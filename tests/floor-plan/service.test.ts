import path from 'path';
import os from 'os';
import fs from 'fs/promises';

// Mock child_process before importing module
const mockExecFile = jest.fn();
jest.mock('child_process', () => ({
  execFile: mockExecFile,
}));

// Mock fetch globally
const mockFetch = jest.fn();
(global as any).fetch = mockFetch;

// Mock Telegraf bot
const mockGetFileLink = jest.fn();
const mockBot = {
  telegram: {
    getFileLink: mockGetFileLink,
  },
} as any;

import { extractFrames, downloadVideoToTemp } from '../../src/services/floor-plan';

describe('floor-plan service', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('extractFrames', () => {
    it('calls ffmpeg with correct arguments for intervalSec and maxFrames', async () => {
      const videoPath = '/tmp/test-video.mp4';

      // Mock execFile to simulate ffmpeg creating frame files
      mockExecFile.mockImplementation(
        (cmd: string, args: string[], callback: Function) => {
          // Extract the output directory from the args
          const outputPattern = args[args.length - 1];
          const outputDir = path.dirname(outputPattern);
          // Create mock frame files
          const createFrames = async () => {
            await fs.mkdir(outputDir, { recursive: true });
            await fs.writeFile(path.join(outputDir, 'frame_001.jpg'), 'fake-jpg');
            await fs.writeFile(path.join(outputDir, 'frame_002.jpg'), 'fake-jpg');
            await fs.writeFile(path.join(outputDir, 'frame_003.jpg'), 'fake-jpg');
          };
          createFrames().then(() => callback(null, { stdout: '', stderr: '' }));
        }
      );

      const frames = await extractFrames(videoPath, { intervalSec: 3, maxFrames: 10 });

      // Check ffmpeg was called with correct args
      expect(mockExecFile).toHaveBeenCalledTimes(1);
      const callArgs = mockExecFile.mock.calls[0];
      expect(callArgs[0]).toBe('ffmpeg');
      const ffmpegArgs: string[] = callArgs[1];
      expect(ffmpegArgs).toContain('-i');
      expect(ffmpegArgs).toContain(videoPath);
      expect(ffmpegArgs).toContain('-vf');
      expect(ffmpegArgs).toContain('fps=1/3,scale=800:-1');
      expect(ffmpegArgs).toContain('-frames:v');
      expect(ffmpegArgs).toContain('10');
      expect(ffmpegArgs).toContain('-q:v');
      expect(ffmpegArgs).toContain('5');

      // Verify frames returned sorted
      expect(frames).toHaveLength(3);
      expect(frames[0]).toContain('frame_001.jpg');
      expect(frames[1]).toContain('frame_002.jpg');
      expect(frames[2]).toContain('frame_003.jpg');

      // Cleanup
      for (const f of frames) {
        await fs.unlink(f).catch(() => {});
      }
      await fs.rmdir(path.dirname(frames[0])).catch(() => {});
    });

    it('returns sorted array of frame paths from temp dir', async () => {
      const videoPath = '/tmp/test-video.mp4';

      mockExecFile.mockImplementation(
        (cmd: string, args: string[], callback: Function) => {
          const outputPattern = args[args.length - 1];
          const outputDir = path.dirname(outputPattern);
          const createFrames = async () => {
            await fs.mkdir(outputDir, { recursive: true });
            // Create out of order to verify sorting
            await fs.writeFile(path.join(outputDir, 'frame_003.jpg'), 'fake');
            await fs.writeFile(path.join(outputDir, 'frame_001.jpg'), 'fake');
            await fs.writeFile(path.join(outputDir, 'frame_002.jpg'), 'fake');
          };
          createFrames().then(() => callback(null, { stdout: '', stderr: '' }));
        }
      );

      const frames = await extractFrames(videoPath, { intervalSec: 2, maxFrames: 20 });

      expect(frames[0]).toMatch(/frame_001\.jpg$/);
      expect(frames[1]).toMatch(/frame_002\.jpg$/);
      expect(frames[2]).toMatch(/frame_003\.jpg$/);
      // All in same temp dir
      const dir = path.dirname(frames[0]);
      expect(dir).toContain('textbud-frames-');
      expect(frames.every(f => path.dirname(f) === dir)).toBe(true);

      // Cleanup
      for (const f of frames) {
        await fs.unlink(f).catch(() => {});
      }
      await fs.rmdir(dir).catch(() => {});
    });
  });

  describe('downloadVideoToTemp', () => {
    it('downloads video from Telegram and writes to temp file', async () => {
      const fakeFileId = 'test-file-id-123';
      const fakeVideoData = Buffer.from('fake-video-data');

      mockGetFileLink.mockResolvedValue({ href: 'https://api.telegram.org/file/bot123/video.mp4' });
      mockFetch.mockResolvedValue({
        arrayBuffer: () => Promise.resolve(fakeVideoData.buffer.slice(
          fakeVideoData.byteOffset,
          fakeVideoData.byteOffset + fakeVideoData.byteLength
        )),
      });

      const resultPath = await downloadVideoToTemp(mockBot, fakeFileId);

      // Verify bot.telegram.getFileLink was called
      expect(mockGetFileLink).toHaveBeenCalledWith(fakeFileId);

      // Verify fetch was called with the file link
      expect(mockFetch).toHaveBeenCalledWith('https://api.telegram.org/file/bot123/video.mp4');

      // Verify the file exists and contains the video data
      expect(resultPath).toContain('textbud-video-');
      expect(resultPath).toMatch(/\.mp4$/);
      const written = await fs.readFile(resultPath);
      expect(written.toString()).toBe('fake-video-data');

      // Cleanup
      await fs.unlink(resultPath).catch(() => {});
    });
  });
});
