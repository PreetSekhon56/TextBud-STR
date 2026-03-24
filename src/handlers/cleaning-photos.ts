import { Telegraf, Context } from 'telegraf';
import { getDb } from '../db/connection.js';
import { StagingPhoto, Cleaner } from '../types/index.js';
import { getActiveSessionByChatId } from './cleaning.js';
import { sendRoomChecklist } from './cleaning-checklist.js';
import { comparePhotos, downloadTelegramPhoto } from '../services/vision.js';

export const MAX_PHOTO_ATTEMPTS = 3;

export function registerPhotoHandlers(bot: Telegraf): void {
  bot.on('photo', async (ctx) => {
    // Only handle group photos (not DMs)
    if (ctx.chat.type === 'private') return;

    const chatId = ctx.chat.id;
    const session = getActiveSessionByChatId(chatId);
    if (!session || !session.waitingForPhoto) return;

    // Verify sender is the assigned cleaner
    const db = getDb();
    const cleaner = db.prepare('SELECT * FROM cleaners WHERE id = ?').get(session.cleanerId) as Cleaner | undefined;
    if (!cleaner || ctx.from.id !== cleaner.telegram_id) return;

    // Get highest-resolution photo
    const photos = ctx.message.photo;
    const photoFileId = photos[photos.length - 1].file_id;

    // Get current room info
    const roomId = session.currentPhotoRoomId;
    if (!roomId) return;

    const room = session.rooms[session.currentRoomIndex];
    const roomName = room ? room.name : 'this room';

    // Increment attempt count
    const attemptCount = (session.photoAttempts.get(roomId) || 0) + 1;
    session.photoAttempts.set(roomId, attemptCount);

    // Insert milestone photo record
    const milestoneResult = db.prepare(
      'INSERT INTO milestone_photos (session_id, room_id, file_id, attempt_number) VALUES (?, ?, ?, ?)'
    ).run(session.sessionId, roomId, photoFileId, attemptCount);
    const milestonePhotoId = Number(milestoneResult.lastInsertRowid);

    // Check for staging photos for this room
    const stagingPhoto = db.prepare(
      'SELECT * FROM staging_photos WHERE room_id = ? ORDER BY sort_order LIMIT 1'
    ).get(roomId) as StagingPhoto | undefined;

    if (!stagingPhoto) {
      // No staging photo -- skip comparison
      await ctx.reply(`No reference photo for ${roomName} -- skipping comparison. Photo saved for the report.`);
      session.waitingForPhoto = false;
      await sendRoomChecklist(ctx, session, session.currentRoomIndex + 1);
      return;
    }

    // Show typing while AI processes
    await ctx.sendChatAction('typing');

    // Download both photos as base64
    let comparisonResult: { pass: boolean; issues: string[] };
    try {
      const milestoneLink = await ctx.telegram.getFileLink(photoFileId);
      const milestoneBase64 = await downloadTelegramPhoto(milestoneLink.href);
      const stagingLink = await ctx.telegram.getFileLink(stagingPhoto.file_id);
      const stagingBase64 = await downloadTelegramPhoto(stagingLink.href);

      // Compare with retry on failure
      try {
        comparisonResult = await comparePhotos(stagingBase64, milestoneBase64, roomName);
      } catch {
        // Retry once after brief delay
        await new Promise(resolve => setTimeout(resolve, 3000));
        try {
          comparisonResult = await comparePhotos(stagingBase64, milestoneBase64, roomName);
        } catch {
          await ctx.reply("Couldn't compare this photo right now -- I've saved it for the report. Moving on.");
          session.waitingForPhoto = false;
          await sendRoomChecklist(ctx, session, session.currentRoomIndex + 1);
          return;
        }
      }
    } catch {
      await ctx.reply("Couldn't compare this photo right now -- I've saved it for the report. Moving on.");
      session.waitingForPhoto = false;
      await sendRoomChecklist(ctx, session, session.currentRoomIndex + 1);
      return;
    }

    // Store comparison result
    const issuesJson = comparisonResult.issues.length > 0 ? JSON.stringify(comparisonResult.issues) : null;
    db.prepare(
      'INSERT INTO comparison_results (milestone_photo_id, staging_photo_id, passed, issues, raw_response) VALUES (?, ?, ?, ?, ?)'
    ).run(milestonePhotoId, stagingPhoto.id, comparisonResult.pass ? 1 : 0, issuesJson, issuesJson);

    if (comparisonResult.pass) {
      // PASS -- advance to next room
      await ctx.reply(`${roomName} looks great!`);
      session.waitingForPhoto = false;
      await sendRoomChecklist(ctx, session, session.currentRoomIndex + 1);
    } else {
      // FLAG -- check attempt count
      if (attemptCount < MAX_PHOTO_ATTEMPTS) {
        const issuesList = comparisonResult.issues.map(i => `- ${i}`).join('\n');
        await ctx.reply(
          `Looks like there are a few things to check in ${roomName}:\n${issuesList}\n\nCan you take another look and send a new photo? (Attempt ${attemptCount}/${MAX_PHOTO_ATTEMPTS})`
        );
        // Keep waitingForPhoto = true for re-submit
      } else {
        // Max attempts reached -- accept and move on
        await ctx.reply(`I've noted the issues in ${roomName} for the report. Let's move on.`);
        session.waitingForPhoto = false;
        await sendRoomChecklist(ctx, session, session.currentRoomIndex + 1);
      }
    }
  });
}
