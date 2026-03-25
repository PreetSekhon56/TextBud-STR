import { Telegraf } from 'telegraf';
import { execFile } from 'child_process';
import { promisify } from 'util';
import fs from 'fs/promises';
import path from 'path';
import os from 'os';
import Anthropic from '@anthropic-ai/sdk';
import { getDb } from '../db/connection.js';
import { RoomConnectivity } from '../types/index.js';

const execFileAsync = promisify(execFile);
const anthropic = new Anthropic();

/**
 * Downloads a video from Telegram to a temp file.
 */
export async function downloadVideoToTemp(bot: Telegraf, fileId: string): Promise<string> {
  const fileLink = await bot.telegram.getFileLink(fileId);
  const response = await fetch(fileLink.href);
  const buffer = Buffer.from(await response.arrayBuffer());
  const tmpPath = path.join(os.tmpdir(), `textbud-video-${Date.now()}.mp4`);
  await fs.writeFile(tmpPath, buffer);
  return tmpPath;
}

/**
 * Extracts frames from a video file using FFmpeg.
 */
export async function extractFrames(
  videoPath: string,
  opts: { intervalSec: number; maxFrames: number }
): Promise<string[]> {
  const outputDir = path.join(os.tmpdir(), `textbud-frames-${Date.now()}`);
  await fs.mkdir(outputDir, { recursive: true });

  const outputPattern = path.join(outputDir, 'frame_%03d.jpg');

  await execFileAsync('ffmpeg', [
    '-i', videoPath,
    '-vf', `fps=1/${opts.intervalSec},scale=800:-1`,
    '-frames:v', String(opts.maxFrames),
    '-q:v', '5',
    outputPattern,
  ]);

  const files = await fs.readdir(outputDir);
  return files
    .filter(f => f.endsWith('.jpg'))
    .sort()
    .map(f => path.join(outputDir, f));
}

/**
 * Generates a fallback SVG when Claude returns invalid output.
 * Simple grid layout with room names and connection lines.
 */
function generateFallbackSvg(connectivity: RoomConnectivity, roomNames: string[]): string {
  const rooms = connectivity.rooms.length > 0
    ? connectivity.rooms.map(r => r.name)
    : roomNames;
  const cols = Math.ceil(Math.sqrt(rooms.length));
  const boxW = 120;
  const boxH = 60;
  const gapX = 40;
  const gapY = 40;
  const width = cols * (boxW + gapX) + gapX;
  const rows = Math.ceil(rooms.length / cols);
  const height = rows * (boxH + gapY) + gapY;

  let rects = '';
  const positions: Map<string, { cx: number; cy: number }> = new Map();

  rooms.forEach((name, i) => {
    const col = i % cols;
    const row = Math.floor(i / cols);
    const x = gapX + col * (boxW + gapX);
    const y = gapY + row * (boxH + gapY);
    const cx = x + boxW / 2;
    const cy = y + boxH / 2;
    positions.set(name, { cx, cy });
    rects += `  <rect x="${x}" y="${y}" width="${boxW}" height="${boxH}" fill="#e8f4fd" stroke="#333" stroke-width="1.5" rx="6"/>\n`;
    rects += `  <text x="${cx}" y="${cy + 4}" text-anchor="middle" font-size="11" font-family="sans-serif">${name}</text>\n`;
  });

  let lines = '';
  for (const room of connectivity.rooms) {
    const from = positions.get(room.name);
    if (!from) continue;
    for (const target of room.connectedTo) {
      const to = positions.get(target);
      if (!to) continue;
      lines += `  <line x1="${from.cx}" y1="${from.cy}" x2="${to.cx}" y2="${to.cy}" stroke="#999" stroke-width="1" stroke-dasharray="4,4"/>\n`;
    }
  }

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}">\n${lines}${rects}</svg>`;
}

/**
 * Analyzes walkthrough frames using Claude Vision to determine room connectivity.
 */
export async function analyzeWalkthroughFrames(
  framePaths: string[],
  roomNames: string[]
): Promise<RoomConnectivity> {
  const imageBlocks: Anthropic.Messages.ContentBlockParam[] = [];

  for (const framePath of framePaths) {
    const buf = await fs.readFile(framePath);
    const base64 = buf.toString('base64');
    imageBlocks.push({
      type: 'image',
      source: { type: 'base64', media_type: 'image/jpeg', data: base64 },
    });
  }

  imageBlocks.push({
    type: 'text',
    text: `You are analyzing frames from a walkthrough video of a rental property. The property has these rooms: ${roomNames.join(', ')}. For each frame, identify which room is shown. Then determine the order rooms were visited and which rooms connect to each other (share doorways/openings). Return JSON only: {"rooms": [{"name": "RoomName", "connectedTo": ["OtherRoom"]}], "walkOrder": ["Room1", "Room2"]}`,
  });

  const message = await anthropic.messages.create({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 2048,
    messages: [{ role: 'user', content: imageBlocks }],
  });

  const text = message.content[0].type === 'text' ? message.content[0].text : '';
  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    return { rooms: roomNames.map(n => ({ name: n, connectedTo: [] })), walkOrder: roomNames };
  }

  try {
    const parsed = JSON.parse(jsonMatch[0]);
    return {
      rooms: Array.isArray(parsed.rooms) ? parsed.rooms : [],
      walkOrder: Array.isArray(parsed.walkOrder) ? parsed.walkOrder : [],
    };
  } catch {
    return { rooms: roomNames.map(n => ({ name: n, connectedTo: [] })), walkOrder: roomNames };
  }
}

/**
 * Generates an SVG floor plan from room connectivity data using Claude.
 */
export async function generateFloorPlanSvg(
  connectivity: RoomConnectivity,
  roomNames: string[]
): Promise<string> {
  try {
    const message = await anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 4096,
      messages: [{
        role: 'user',
        content: `Generate a simple SVG floor plan diagram from this room connectivity data. Each room should be a labeled rectangle. Connected rooms should be adjacent with a doorway indicator. Use a clean, minimal style with light fill colors. Size: 600x400. Rooms: ${JSON.stringify(connectivity)}. Return only the SVG code starting with <svg and ending with </svg>, no explanation.`,
      }],
    });

    const text = message.content[0].type === 'text' ? message.content[0].text : '';
    const svgMatch = text.match(/<svg[\s\S]*<\/svg>/);
    if (svgMatch) {
      return svgMatch[0];
    }
  } catch {
    // Fall through to fallback
  }

  return generateFallbackSvg(connectivity, roomNames);
}

/**
 * Full pipeline: download video, extract frames, analyze, generate SVG, store in DB.
 */
export async function generateFloorPlan(
  bot: Telegraf,
  propertyId: number,
  videoFileId: string,
  roomNames: string[]
): Promise<string> {
  let videoPath: string | null = null;
  let framePaths: string[] = [];

  try {
    videoPath = await downloadVideoToTemp(bot, videoFileId);
    framePaths = await extractFrames(videoPath, { intervalSec: 2, maxFrames: 20 });
    const connectivity = await analyzeWalkthroughFrames(framePaths, roomNames);
    const svg = await generateFloorPlanSvg(connectivity, roomNames);

    const db = getDb();
    db.prepare('UPDATE properties SET floor_plan_svg = ? WHERE id = ?').run(svg, propertyId);

    return svg;
  } finally {
    // Cleanup temp files
    if (videoPath) {
      await fs.unlink(videoPath).catch(() => {});
    }
    if (framePaths.length > 0) {
      const frameDir = path.dirname(framePaths[0]);
      for (const f of framePaths) {
        await fs.unlink(f).catch(() => {});
      }
      await fs.rmdir(frameDir).catch(() => {});
    }
  }
}
