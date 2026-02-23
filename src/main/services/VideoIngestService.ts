import { spawn } from 'node:child_process'
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'

import { loggerService } from '@logger'
import { getFilesDir, getTempDir } from '@main/utils/file'
import type {
  FileMetadata,
  VideoIngestFrame,
  VideoIngestOptions,
  VideoIngestResult,
  VideoIngestSegment,
  VideoIngestTranscript,
  VideoTranscriptSegment
} from '@types'
import { FILE_TYPE } from '@types'
import mime from 'mime-types'

const logger = loggerService.withContext('VideoIngestService')

const CACHE_VERSION = 1

const DEFAULT_INGEST_OPTIONS: Required<VideoIngestOptions> = {
  frameIntervalSec: 2,
  maxFrames: 12,
  segmentDurationSec: 20,
  maxAudioDurationSec: 600
}

interface VideoIngestCacheManifest {
  version: number
  options: Required<VideoIngestOptions>
  result: VideoIngestResult
}

class VideoIngestService {
  private cacheDir = path.join(getTempDir(), 'video-ingest')

  public ingestVideo = async (
    _: Electron.IpcMainInvokeEvent,
    file: FileMetadata,
    options?: VideoIngestOptions
  ): Promise<VideoIngestResult> => {
    if (file.type !== FILE_TYPE.VIDEO) {
      throw new Error(`File ${file.origin_name} is not a video`)
    }

    await fs.promises.mkdir(this.cacheDir, { recursive: true })

    const sourcePath = this.resolveSourcePath(file)
    await fs.promises.access(sourcePath, fs.constants.R_OK)

    const normalizedOptions = this.normalizeOptions(options)
    const sourceHash = await this.getFileHash(sourcePath)
    const cachePath = path.join(this.cacheDir, sourceHash)
    const manifestPath = path.join(cachePath, 'manifest.json')

    const cached = await this.loadCachedResult(manifestPath, normalizedOptions)
    if (cached) {
      return cached
    }

    await fs.promises.mkdir(cachePath, { recursive: true })

    const durationSec = await this.probeDuration(sourcePath)
    const frames = await this.extractFrames(sourcePath, cachePath, normalizedOptions)
    const transcript = await this.loadSidecarTranscript(sourcePath)
    const audio = await this.extractAudio(sourcePath, cachePath, normalizedOptions)
    const segments = this.buildSegments(
      frames,
      transcript?.segments || [],
      durationSec,
      normalizedOptions.segmentDurationSec
    )

    const result: VideoIngestResult = {
      sourceFileId: file.id,
      sourceHash,
      sourcePath,
      createdAt: new Date().toISOString(),
      cacheDir: cachePath,
      durationSec,
      frameIntervalSec: normalizedOptions.frameIntervalSec,
      segmentDurationSec: normalizedOptions.segmentDurationSec,
      frames,
      segments,
      audio,
      transcript
    }

    await this.saveManifest(manifestPath, {
      version: CACHE_VERSION,
      options: normalizedOptions,
      result
    })

    return result
  }

  private resolveSourcePath(file: FileMetadata): string {
    if (file.path && fs.existsSync(file.path)) {
      return file.path
    }

    const fallbackPath = path.join(getFilesDir(), file.id + file.ext)
    if (fs.existsSync(fallbackPath)) {
      return fallbackPath
    }

    throw new Error(`Video file not found: ${file.path}`)
  }

  private normalizeOptions(options?: VideoIngestOptions): Required<VideoIngestOptions> {
    const mergedOptions = {
      ...DEFAULT_INGEST_OPTIONS,
      ...options
    }

    const safeFrameInterval =
      Number.isFinite(mergedOptions.frameIntervalSec) && mergedOptions.frameIntervalSec > 0
        ? mergedOptions.frameIntervalSec
        : DEFAULT_INGEST_OPTIONS.frameIntervalSec

    const safeMaxFrames =
      Number.isFinite(mergedOptions.maxFrames) && mergedOptions.maxFrames >= 0
        ? Math.floor(mergedOptions.maxFrames)
        : DEFAULT_INGEST_OPTIONS.maxFrames

    const safeSegmentDuration =
      Number.isFinite(mergedOptions.segmentDurationSec) && mergedOptions.segmentDurationSec > 0
        ? mergedOptions.segmentDurationSec
        : DEFAULT_INGEST_OPTIONS.segmentDurationSec

    const safeMaxAudioDuration =
      Number.isFinite(mergedOptions.maxAudioDurationSec) && mergedOptions.maxAudioDurationSec > 0
        ? mergedOptions.maxAudioDurationSec
        : DEFAULT_INGEST_OPTIONS.maxAudioDurationSec

    return {
      frameIntervalSec: safeFrameInterval,
      maxFrames: safeMaxFrames,
      segmentDurationSec: safeSegmentDuration,
      maxAudioDurationSec: safeMaxAudioDuration
    }
  }

  private async getFileHash(filePath: string): Promise<string> {
    return await new Promise((resolve, reject) => {
      const hash = crypto.createHash('sha256')
      const stream = fs.createReadStream(filePath)
      stream.on('data', (chunk) => hash.update(chunk))
      stream.on('end', () => resolve(hash.digest('hex')))
      stream.on('error', reject)
    })
  }

  private async loadCachedResult(
    manifestPath: string,
    options: Required<VideoIngestOptions>
  ): Promise<VideoIngestResult | null> {
    if (!fs.existsSync(manifestPath)) {
      return null
    }

    try {
      const raw = await fs.promises.readFile(manifestPath, 'utf-8')
      const parsed = JSON.parse(raw) as VideoIngestCacheManifest

      if (parsed.version !== CACHE_VERSION) {
        return null
      }

      if (!this.isSameOptions(parsed.options, options)) {
        return null
      }

      if (!(await this.isResultFilesReady(parsed.result))) {
        return null
      }

      return parsed.result
    } catch (error) {
      logger.warn('Failed to load cached video ingest result:', error as Error)
      return null
    }
  }

  private isSameOptions(a: Required<VideoIngestOptions>, b: Required<VideoIngestOptions>): boolean {
    return (
      a.frameIntervalSec === b.frameIntervalSec &&
      a.maxFrames === b.maxFrames &&
      a.segmentDurationSec === b.segmentDurationSec &&
      a.maxAudioDurationSec === b.maxAudioDurationSec
    )
  }

  private async isResultFilesReady(result: VideoIngestResult): Promise<boolean> {
    const frameExists = result.frames.every((frame) => fs.existsSync(frame.path))
    if (!frameExists) {
      return false
    }

    if (result.audio && !fs.existsSync(result.audio.path)) {
      return false
    }

    if (result.transcript && !fs.existsSync(result.transcript.path)) {
      return false
    }

    return true
  }

  private async saveManifest(manifestPath: string, manifest: VideoIngestCacheManifest): Promise<void> {
    await fs.promises.writeFile(manifestPath, JSON.stringify(manifest, null, 2), 'utf-8')
  }

  private async probeDuration(sourcePath: string): Promise<number> {
    try {
      const { stdout } = await this.runCommand('ffprobe', [
        '-v',
        'error',
        '-show_entries',
        'format=duration',
        '-of',
        'default=nokey=1:noprint_wrappers=1',
        sourcePath
      ])

      const duration = Number.parseFloat(stdout.trim())
      if (!Number.isFinite(duration) || duration <= 0) {
        return 0
      }

      return duration
    } catch (error) {
      logger.warn('Failed to probe video duration:', error as Error)
      return 0
    }
  }

  private async extractFrames(
    sourcePath: string,
    cachePath: string,
    options: Required<VideoIngestOptions>
  ): Promise<VideoIngestFrame[]> {
    if (options.maxFrames <= 0) {
      return []
    }

    const framesDir = path.join(cachePath, 'frames')
    await fs.promises.rm(framesDir, { recursive: true, force: true })
    await fs.promises.mkdir(framesDir, { recursive: true })

    const outputPattern = path.join(framesDir, 'frame_%06d.jpg')

    await this.runCommand('ffmpeg', [
      '-hide_banner',
      '-loglevel',
      'error',
      '-y',
      '-i',
      sourcePath,
      '-vf',
      `fps=${1 / options.frameIntervalSec}`,
      '-frames:v',
      String(options.maxFrames),
      '-q:v',
      '4',
      outputPattern
    ])

    const frameFiles = (await fs.promises.readdir(framesDir))
      .filter((fileName) => fileName.endsWith('.jpg') || fileName.endsWith('.jpeg') || fileName.endsWith('.png'))
      .sort((a, b) => a.localeCompare(b))

    return frameFiles.map((fileName, index) => {
      const framePath = path.join(framesDir, fileName)
      const mimeType = mime.lookup(framePath)
      return {
        path: framePath,
        mime: typeof mimeType === 'string' ? mimeType : 'image/jpeg',
        timestampSec: index * options.frameIntervalSec
      }
    })
  }

  private async extractAudio(
    sourcePath: string,
    cachePath: string,
    options: Required<VideoIngestOptions>
  ): Promise<VideoIngestResult['audio']> {
    const audioPath = path.join(cachePath, 'audio.wav')
    await fs.promises.rm(audioPath, { force: true })

    try {
      await this.runCommand('ffmpeg', [
        '-hide_banner',
        '-loglevel',
        'error',
        '-y',
        '-i',
        sourcePath,
        '-vn',
        '-ac',
        '1',
        '-ar',
        '16000',
        '-c:a',
        'pcm_s16le',
        '-t',
        String(options.maxAudioDurationSec),
        audioPath
      ])

      const stats = await fs.promises.stat(audioPath)
      return {
        path: audioPath,
        mime: 'audio/wav',
        sampleRate: 16000,
        channels: 1,
        size: stats.size
      }
    } catch (error) {
      logger.warn('Failed to extract video audio track:', error as Error)
      return undefined
    }
  }

  private async loadSidecarTranscript(sourcePath: string): Promise<VideoIngestTranscript | undefined> {
    const parsedPath = path.parse(sourcePath)
    const candidatePaths: Array<{ path: string; format: 'srt' | 'vtt' }> = [
      { path: path.join(parsedPath.dir, `${parsedPath.name}.srt`), format: 'srt' },
      { path: path.join(parsedPath.dir, `${parsedPath.name}.vtt`), format: 'vtt' }
    ]

    for (const candidate of candidatePaths) {
      if (!fs.existsSync(candidate.path)) {
        continue
      }

      try {
        const raw = await fs.promises.readFile(candidate.path, 'utf-8')
        const segments = this.parseSubtitle(raw)
        if (segments.length === 0) {
          continue
        }

        return {
          path: candidate.path,
          format: candidate.format,
          segments
        }
      } catch (error) {
        logger.warn(`Failed to parse sidecar subtitle file ${candidate.path}:`, error as Error)
      }
    }

    return undefined
  }

  private parseSubtitle(content: string): VideoTranscriptSegment[] {
    const normalizedContent = content.replace(/\r\n/g, '\n').replace(/^WEBVTT\n?/i, '')
    const blocks = normalizedContent
      .split(/\n\s*\n/)
      .map((block) => block.trim())
      .filter(Boolean)

    const segments: VideoTranscriptSegment[] = []

    for (const block of blocks) {
      const lines = block
        .split('\n')
        .map((line) => line.trim())
        .filter(Boolean)

      const timelineIndex = lines.findIndex((line) => line.includes('-->'))
      if (timelineIndex < 0) {
        continue
      }

      const [rawStart, rawEnd] = lines[timelineIndex].split('-->').map((time) => time.trim())
      const startToken = rawStart.split(' ')[0]
      const endToken = rawEnd.split(' ')[0]

      const startSec = this.parseTimecode(startToken)
      const endSec = this.parseTimecode(endToken)

      if (!Number.isFinite(startSec) || !Number.isFinite(endSec) || endSec <= startSec) {
        continue
      }

      const text = lines
        .slice(timelineIndex + 1)
        .join(' ')
        .replace(/<[^>]+>/g, '')
        .trim()

      if (!text) {
        continue
      }

      segments.push({
        startSec,
        endSec,
        text
      })
    }

    return segments.sort((a, b) => a.startSec - b.startSec)
  }

  private parseTimecode(timecode: string): number {
    const normalized = timecode.replace(',', '.').trim()
    const parts = normalized.split(':')

    if (parts.length < 2 || parts.length > 3) {
      return Number.NaN
    }

    const seconds = Number.parseFloat(parts[parts.length - 1])
    const minutes = Number.parseInt(parts[parts.length - 2], 10)
    const hours = parts.length === 3 ? Number.parseInt(parts[0], 10) : 0

    if (!Number.isFinite(seconds) || Number.isNaN(minutes) || Number.isNaN(hours)) {
      return Number.NaN
    }

    return hours * 3600 + minutes * 60 + seconds
  }

  private buildSegments(
    frames: VideoIngestFrame[],
    transcriptSegments: VideoTranscriptSegment[],
    durationSec: number,
    segmentDurationSec: number
  ): VideoIngestSegment[] {
    const maxFrameTimestamp = frames.length > 0 ? frames[frames.length - 1].timestampSec : 0
    const maxTranscriptTimestamp = transcriptSegments.reduce((max, segment) => Math.max(max, segment.endSec), 0)
    const effectiveDuration = Math.max(durationSec, maxFrameTimestamp, maxTranscriptTimestamp, segmentDurationSec)
    const segmentCount = Math.max(1, Math.ceil(effectiveDuration / segmentDurationSec))

    const segments: VideoIngestSegment[] = Array.from({ length: segmentCount }, (_, index) => ({
      index,
      startSec: index * segmentDurationSec,
      endSec: Math.min((index + 1) * segmentDurationSec, effectiveDuration),
      framePaths: []
    }))

    for (const frame of frames) {
      const segmentIndex = Math.min(Math.floor(frame.timestampSec / segmentDurationSec), segmentCount - 1)
      segments[segmentIndex].framePaths.push(frame.path)
    }

    for (const segment of segments) {
      if (segment.framePaths.length > 0) {
        segment.representativeFramePath = segment.framePaths[0]
      }
    }

    for (const transcriptSegment of transcriptSegments) {
      for (const segment of segments) {
        if (transcriptSegment.startSec < segment.endSec && transcriptSegment.endSec > segment.startSec) {
          segment.transcript = [segment.transcript, transcriptSegment.text].filter(Boolean).join(' ').trim()
        }
      }
    }

    return segments.filter((segment, index) => {
      if (index === 0) {
        return true
      }
      return Boolean(segment.representativeFramePath || segment.transcript)
    })
  }

  private async runCommand(command: string, args: string[]): Promise<{ stdout: string; stderr: string }> {
    return await new Promise((resolve, reject) => {
      const child = spawn(command, args, {
        windowsHide: true,
        stdio: ['ignore', 'pipe', 'pipe']
      })

      let stdout = ''
      let stderr = ''

      child.stdout.on('data', (data: Buffer) => {
        stdout += data.toString()
      })

      child.stderr.on('data', (data: Buffer) => {
        stderr += data.toString()
      })

      child.on('error', (error: NodeJS.ErrnoException) => {
        if (error.code === 'ENOENT') {
          reject(new Error(`${command} is not available in PATH`))
          return
        }
        reject(error)
      })

      child.on('close', (code) => {
        if (code === 0) {
          resolve({ stdout, stderr })
          return
        }

        const output = (stderr || stdout).trim()
        const shortOutput = output.length > 1200 ? `${output.slice(0, 1200)}...` : output
        reject(new Error(`${command} exited with code ${code}: ${shortOutput}`))
      })
    })
  }
}

export const videoIngestService = new VideoIngestService()
