import { Context } from 'telegraf';
import fs from 'fs';
import path from 'path';
import { getDb } from '../db/connection.js';
import { SetupSession, Room, StagingPhoto } from '../types/index.js';

const STAGING_PHOTOS_DIR = process.env.STAGING_PHOTOS_DIR || './data/staging-photos';

export async function promptPhotos(ctx: Context, roomName: string): Promise<void> {
  await ctx.reply(
    `Send me photos of how ${roomName} should look after cleaning. ` +
    `These will be your reference standard. Send 1-5 photos, then say "done" when finished.\n\n` +
    `Tip: Wide shots with good lighting work best for comparison.`
  );
}

function getRooms(propertyId: number): Room[] {
  const db = getDb();
  return db.prepare('SELECT * FROM rooms WHERE property_id = ? ORDER BY sort_order')
    .all(propertyId) as Room[];
}

function getPhotoCount(roomId: number): number {
  const db = getDb();
  const result = db.prepare('SELECT COUNT(*) as count FROM staging_photos WHERE room_id = ?')
    .get(roomId) as { count: number };
  return result.count;
}

export async function handlePhotoSetup(
  ctx: Context,
  session: SetupSession
): Promise<'step_complete' | 'next_room' | 'waiting'> {
  const db = getDb();
  const rooms = getRooms(session.property_id);
  const currentRoomIndex = session.current_room_index ?? 0;

  if (currentRoomIndex >= rooms.length) {
    return 'step_complete';
  }

  const currentRoom = rooms[currentRoomIndex];

  // Check if this is a text message (e.g., "done")
  if ('text' in (ctx.message || {})) {
    const text = (ctx.message as { text: string }).text.trim().toLowerCase();

    if (text === 'done') {
      const photoCount = getPhotoCount(currentRoom.id);
      const nextRoomIndex = currentRoomIndex + 1;

      if (nextRoomIndex >= rooms.length) {
        // All rooms done
        await ctx.reply(
          `Staging photos complete! Here's what we have:\n` +
          rooms.map(r => `- ${r.name}: ${getPhotoCount(r.id)} photo(s)`).join('\n')
        );
        return 'step_complete';
      }

      // Move to next room
      db.prepare('UPDATE setup_sessions SET current_room_index = ? WHERE id = ?')
        .run(nextRoomIndex, session.id);

      const nextRoom = rooms[nextRoomIndex];
      await ctx.reply(`${currentRoom.name} is set with ${photoCount} photo(s).`);
      await promptPhotos(ctx, nextRoom.name);
      return 'next_room';
    }

    if (text === 'skip') {
      const nextRoomIndex = currentRoomIndex + 1;
      if (nextRoomIndex >= rooms.length) {
        await ctx.reply('Staging photos complete! You can add photos later.');
        return 'step_complete';
      }

      db.prepare('UPDATE setup_sessions SET current_room_index = ? WHERE id = ?')
        .run(nextRoomIndex, session.id);

      const nextRoom = rooms[nextRoomIndex];
      await ctx.reply(`Skipped photos for ${currentRoom.name}. You can add them later.`);
      await promptPhotos(ctx, nextRoom.name);
      return 'next_room';
    }

    // Other text during photo step
    await ctx.reply(
      `Send me photos of ${currentRoom.name}, or say "done" to move to the next room.`
    );
    return 'waiting';
  }

  // Handle photo message
  if ('photo' in (ctx.message || {})) {
    const photoMsg = ctx.message as { photo: Array<{ file_id: string; file_unique_id: string }> };
    const photo = photoMsg.photo[photoMsg.photo.length - 1]; // Largest resolution
    const fileId = photo.file_id;

    // Create directory structure
    const photoDir = path.join(STAGING_PHOTOS_DIR, String(session.property_id), String(currentRoom.id));
    if (!fs.existsSync(photoDir)) {
      fs.mkdirSync(photoDir, { recursive: true });
    }

    // Determine sort order based on existing photos
    const existingCount = getPhotoCount(currentRoom.id);
    const sortOrder = existingCount;

    // Download photo via Telegram API
    let localPath = '';
    try {
      const fileLink = await ctx.telegram.getFileLink(fileId);
      const fileName = `photo_${sortOrder}.jpg`;
      localPath = path.join(photoDir, fileName);

      // Download and save
      const response = await fetch(fileLink.href);
      const buffer = Buffer.from(await response.arrayBuffer());
      fs.writeFileSync(localPath, buffer);
    } catch {
      // Store with file_id only if download fails
      localPath = path.join(photoDir, `photo_${sortOrder}.jpg`);
    }

    // Store in database
    db.prepare(
      'INSERT INTO staging_photos (room_id, file_id, file_path, sort_order) VALUES (?, ?, ?, ?)'
    ).run(currentRoom.id, fileId, localPath, sortOrder);

    const newCount = existingCount + 1;
    await ctx.reply(
      `Got it -- staging photo ${newCount} for ${currentRoom.name}. ` +
      `Send more or say "done" to move to the next room.`
    );
    return 'waiting';
  }

  return 'waiting';
}
