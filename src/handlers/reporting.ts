import { Telegraf, Context } from 'telegraf';
import { getDb } from '../db/connection.js';
import {
  CleaningSession,
  Property,
  Cleaner,
  Room,
  ComparisonResult,
  InventoryItem,
} from '../types/index.js';
import { ActiveCleaningSession, calculateDuration, getComparisonSummary } from './cleaning.js';

// --- Helpers ---

export function formatTime(iso: string): string {
  const d = new Date(iso);
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const month = months[d.getMonth()];
  const day = d.getDate();
  let hours = d.getHours();
  const minutes = d.getMinutes().toString().padStart(2, '0');
  const ampm = hours >= 12 ? 'PM' : 'AM';
  hours = hours % 12 || 12;
  return `${month} ${day}, ${hours}:${minutes} ${ampm}`;
}

// --- Checklist helpers ---

export function getChecklistStatusForRoom(
  sessionId: number,
  roomId: number,
  cleanType: string
): { description: string; completed: boolean }[] {
  const db = getDb();
  const rows = db.prepare(`
    SELECT ci.description, scp.id AS progress_id
    FROM checklists c
    JOIN checklist_items ci ON ci.checklist_id = c.id
    LEFT JOIN session_checklist_progress scp
      ON scp.checklist_item_id = ci.id AND scp.session_id = ?
    WHERE c.room_id = ? AND c.clean_type = ?
    ORDER BY ci.sort_order
  `).all(sessionId, roomId, cleanType) as { description: string; progress_id: number | null }[];

  return rows.map(r => ({
    description: r.description,
    completed: r.progress_id !== null,
  }));
}

// --- Comparison helpers ---

export function getDetailedComparisonForRoom(
  sessionId: number,
  roomId: number
): ComparisonResult | null {
  const db = getDb();
  const row = db.prepare(`
    SELECT cr.* FROM comparison_results cr
    JOIN milestone_photos mp ON cr.milestone_photo_id = mp.id
    WHERE mp.session_id = ? AND mp.room_id = ?
    ORDER BY cr.id DESC LIMIT 1
  `).get(sessionId, roomId) as ComparisonResult | undefined;
  return row || null;
}

// --- Report building ---

export function buildReportHeader(
  session: CleaningSession,
  property: Property,
  cleaner: Cleaner,
  comparison: { passed: number; flagged: number; total: number },
  checklistStats: { completed: number; total: number }
): string {
  const now = session.completed_at || new Date().toISOString();
  const duration = calculateDuration(session.checked_in_at, now);
  const cleanLabel = session.clean_type === 'deep' ? 'Deep Clean' : 'Standard Clean';
  const score = comparison.total > 0
    ? `${comparison.passed}/${comparison.total} rooms passed`
    : 'No photo comparisons';
  const flagged = comparison.flagged > 0 ? ` | ${comparison.flagged} flagged` : '';
  const checklist = checklistStats.total > 0
    ? `${checklistStats.completed}/${checklistStats.total} checklist items done`
    : 'No checklist items';

  return [
    `--- Cleaning Report: ${property.name} ---`,
    ``,
    `Cleaner: ${cleaner.first_name}`,
    `Type: ${cleanLabel}`,
    `Time in: ${formatTime(session.checked_in_at)}`,
    `Time out: ${formatTime(now)}`,
    `Duration: ${duration}`,
    ``,
    `Room Score: ${score}${flagged}`,
    `Checklist: ${checklist}`,
  ].join('\n');
}

// --- Per-room report ---

export async function sendRoomReport(
  ctx: Context,
  room: Room,
  stagingFileId: string | null,
  milestoneFileId: string | null,
  comparisonResult: ComparisonResult | null,
  checklistItems: { description: string; completed: boolean }[]
): Promise<void> {
  const verdict = comparisonResult
    ? (comparisonResult.passed ? 'PASSED' : 'FLAGGED')
    : 'No comparison';

  // Send photo media group if we have photos
  if (stagingFileId && milestoneFileId) {
    await ctx.sendMediaGroup([
      { type: 'photo', media: stagingFileId, caption: `${room.name} - Staging (reference)` },
      { type: 'photo', media: milestoneFileId, caption: `${room.name} - Milestone | ${verdict}` },
    ]);
  } else if (milestoneFileId) {
    await ctx.sendMediaGroup([
      { type: 'photo', media: milestoneFileId, caption: `${room.name} - Milestone | ${verdict}` },
    ]);
  } else if (stagingFileId) {
    await ctx.sendMediaGroup([
      { type: 'photo', media: stagingFileId, caption: `${room.name} - Staging (no milestone photo taken)` },
    ]);
  } else {
    await ctx.reply(`${room.name}: No photos available | ${verdict}`);
  }

  // Send flagged issues if any
  if (comparisonResult && !comparisonResult.passed && comparisonResult.issues) {
    const issues = typeof comparisonResult.issues === 'string'
      ? comparisonResult.issues
      : String(comparisonResult.issues);
    if (issues.trim()) {
      await ctx.reply(`Issues in ${room.name}:\n${issues}`);
    }
  }

  // Send checklist status
  if (checklistItems.length > 0) {
    const lines = checklistItems.map(item => {
      const mark = item.completed ? '[x]' : '[ ]';
      return `${mark} ${item.description}`;
    });
    await ctx.reply(`Checklist - ${room.name}:\n${lines.join('\n')}`);
  }
}

// --- Low stock alerts (exported for Plan 02) ---

export async function appendLowStockAlerts(
  ctx: Context,
  sessionId: number,
  lowStockItems: { name: string; count: number; parLevel: number }[]
): Promise<void> {
  if (lowStockItems.length === 0) {
    await ctx.reply(`--- Inventory Update (Session #${sessionId}) ---\n\nAll supplies above minimum levels.`);
    return;
  }

  const lines = lowStockItems.map(
    item => `- ${item.name}: ${item.count} left (minimum: ${item.parLevel})`
  );
  await ctx.reply(
    `--- Inventory Update (Session #${sessionId}) ---\n\nLow stock alert:\n${lines.join('\n')}`
  );
}

// --- Main report orchestrator ---

export async function sendCompletionReport(
  ctx: Context,
  session: ActiveCleaningSession
): Promise<number> {
  const db = getDb();

  // Query session, property, cleaner
  const sessionRow = db.prepare('SELECT * FROM cleaning_sessions WHERE id = ?')
    .get(session.sessionId) as CleaningSession;
  const property = db.prepare('SELECT * FROM properties WHERE id = ?')
    .get(session.propertyId) as Property;
  const cleaner = db.prepare('SELECT * FROM cleaners WHERE id = ?')
    .get(session.cleanerId) as Cleaner;

  // Get rooms
  const rooms = db.prepare('SELECT * FROM rooms WHERE property_id = ? ORDER BY sort_order')
    .all(session.propertyId) as Room[];

  // Overall comparison summary
  const comparison = getComparisonSummary(session.sessionId);

  // Overall checklist stats
  const checklistStatsRow = db.prepare(`
    SELECT
      COUNT(scp.id) as completed,
      COUNT(ci.id) as total
    FROM checklists c
    JOIN checklist_items ci ON ci.checklist_id = c.id
    LEFT JOIN session_checklist_progress scp
      ON scp.checklist_item_id = ci.id AND scp.session_id = ?
    WHERE c.room_id IN (SELECT id FROM rooms WHERE property_id = ?)
    AND c.clean_type = ?
  `).get(session.sessionId, session.propertyId, sessionRow.clean_type) as { completed: number; total: number };

  const checklistStats = {
    completed: checklistStatsRow?.completed || 0,
    total: checklistStatsRow?.total || 0,
  };

  // Send header
  const headerText = buildReportHeader(sessionRow, property, cleaner, comparison, checklistStats);
  await ctx.reply(headerText);

  // Per-room detail with report data for storage
  const roomReports: any[] = [];

  for (const room of rooms) {
    // Get staging photo
    const stagingRow = db.prepare(
      'SELECT file_id FROM staging_photos WHERE room_id = ? LIMIT 1'
    ).get(room.id) as { file_id: string } | undefined;

    // Get milestone photo (latest attempt)
    const milestoneRow = db.prepare(
      'SELECT * FROM milestone_photos WHERE session_id = ? AND room_id = ? ORDER BY attempt_number DESC LIMIT 1'
    ).get(session.sessionId, room.id) as { id: number; file_id: string } | undefined;

    // Get comparison result
    const compResult = getDetailedComparisonForRoom(session.sessionId, room.id);

    // Get checklist items
    const checklistItems = getChecklistStatusForRoom(session.sessionId, room.id, sessionRow.clean_type);

    // Send room report
    await sendRoomReport(
      ctx,
      room,
      stagingRow?.file_id || null,
      milestoneRow?.file_id || null,
      compResult,
      checklistItems
    );

    roomReports.push({
      roomId: room.id,
      roomName: room.name,
      stagingFileId: stagingRow?.file_id || null,
      milestoneFileId: milestoneRow?.file_id || null,
      passed: compResult?.passed ?? null,
      issues: compResult?.issues || null,
      checklistItems,
    });
  }

  // Overall checklist summary
  if (checklistStats.total > 0) {
    const pct = Math.round((checklistStats.completed / checklistStats.total) * 100);
    await ctx.reply(`Overall checklist: ${checklistStats.completed}/${checklistStats.total} items completed (${pct}%)`);
  }

  // Inventory status note
  const inventoryItems = db.prepare(
    'SELECT COUNT(*) as cnt FROM inventory_items WHERE property_id = ? AND is_active = 1'
  ).get(session.propertyId) as { cnt: number };

  if (inventoryItems.cnt > 0) {
    await ctx.reply('Inventory check starting next -- low-stock follow-up coming.');
  } else {
    await ctx.reply("No inventory items configured. Set up with 'setup inventory'.");
  }

  // Store report in DB
  const reportData = JSON.stringify({
    header: headerText,
    comparison,
    checklistStats,
    rooms: roomReports,
    completedAt: sessionRow.completed_at || new Date().toISOString(),
  });

  const result = db.prepare(
    'INSERT INTO completion_reports (session_id, property_id, report_data) VALUES (?, ?, ?)'
  ).run(session.sessionId, session.propertyId, reportData);

  return Number(result.lastInsertRowid);
}

// --- Report retrieval handler ---

export function registerReportingHandlers(bot: Telegraf): void {
  bot.hears(/\b(last|latest|previous|show)\s*(report|clean(ing)?)\b/i, async (ctx) => {
    if (ctx.chat.type !== 'private') return;

    const db = getDb();
    const telegramId = ctx.from?.id;
    if (!telegramId) return;

    const owner = db.prepare('SELECT * FROM owners WHERE telegram_id = ?')
      .get(telegramId) as { id: number } | undefined;
    if (!owner) {
      await ctx.reply('Please send /start first to register.');
      return;
    }

    // Check if user specified a property name
    const text = (ctx.message as { text: string }).text;
    const propertyMatch = text.match(/report\s+for\s+(.+)/i);

    let report: any;
    if (propertyMatch) {
      const propName = propertyMatch[1].trim();
      report = db.prepare(`
        SELECT cr.* FROM completion_reports cr
        JOIN properties p ON cr.property_id = p.id
        WHERE p.owner_id = ? AND p.name LIKE ?
        ORDER BY cr.created_at DESC LIMIT 1
      `).get(owner.id, `%${propName}%`);
    } else {
      report = db.prepare(`
        SELECT cr.* FROM completion_reports cr
        JOIN properties p ON cr.property_id = p.id
        WHERE p.owner_id = ?
        ORDER BY cr.created_at DESC LIMIT 1
      `).get(owner.id);
    }

    if (!report) {
      await ctx.reply('No cleaning reports found.');
      return;
    }

    try {
      const data = JSON.parse(report.report_data);

      // Re-send header
      await ctx.reply(data.header);

      // Re-send room photos and details
      for (const room of data.rooms) {
        if (room.stagingFileId && room.milestoneFileId) {
          const verdict = room.passed === true ? 'PASSED' : room.passed === false ? 'FLAGGED' : 'No comparison';
          await ctx.sendMediaGroup([
            { type: 'photo', media: room.stagingFileId, caption: `${room.roomName} - Staging` },
            { type: 'photo', media: room.milestoneFileId, caption: `${room.roomName} - Milestone | ${verdict}` },
          ]);
        } else if (room.milestoneFileId) {
          const verdict = room.passed === true ? 'PASSED' : room.passed === false ? 'FLAGGED' : 'No comparison';
          await ctx.sendMediaGroup([
            { type: 'photo', media: room.milestoneFileId, caption: `${room.roomName} - Milestone | ${verdict}` },
          ]);
        }

        if (room.issues) {
          await ctx.reply(`Issues in ${room.roomName}:\n${room.issues}`);
        }

        if (room.checklistItems && room.checklistItems.length > 0) {
          const lines = room.checklistItems.map((item: any) => {
            const mark = item.completed ? '[x]' : '[ ]';
            return `${mark} ${item.description}`;
          });
          await ctx.reply(`Checklist - ${room.roomName}:\n${lines.join('\n')}`);
        }
      }
    } catch {
      await ctx.reply('Error loading report data.');
    }
  });
}
