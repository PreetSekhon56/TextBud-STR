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
 * Analyzes walkthrough frames using Claude Vision to determine room connectivity.
 */
export async function analyzeWalkthroughFrames(
  framePaths: string[],
  roomNames: string[]
): Promise<RoomConnectivity> {
  throw new Error('Not implemented');
}

/**
 * Generates an SVG floor plan from room connectivity data using Claude.
 */
export async function generateFloorPlanSvg(
  connectivity: RoomConnectivity,
  roomNames: string[]
): Promise<string> {
  throw new Error('Not implemented');
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
  throw new Error('Not implemented');
}
