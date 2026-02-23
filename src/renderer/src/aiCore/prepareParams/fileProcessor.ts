/**
 * 文件处理模块
 * 处理文件内容提取、文件格式转换、文件上传等逻辑
 */

import type OpenAI from '@cherrystudio/openai'
import { loggerService } from '@logger'
import { getProviderByModel } from '@renderer/services/AssistantService'
import type { FileMetadata, Message, Model, VideoIngestResult } from '@renderer/types'
import { FILE_TYPE } from '@renderer/types'
import type { FileMessageBlock } from '@renderer/types/newMessage'
import { findFileBlocks } from '@renderer/utils/messageUtils/find'
import type { FilePart, ImagePart, TextPart } from 'ai'

import { getAiSdkProviderId } from '../provider/factory'
import { getFileSizeLimit, supportsImageInput, supportsLargeFileUpload, supportsPdfInput } from './modelCapabilities'

const logger = loggerService.withContext('fileProcessor')

const MAX_VIDEO_FRAME_PARTS = 12
const MAX_VIDEO_SEGMENT_TEXTS = 24
const MAX_VIDEO_TRANSCRIPT_CHARS = 10000

function formatTimelineTimestamp(seconds: number): string {
  const safeSeconds = Math.max(0, Math.floor(seconds || 0))
  const hours = Math.floor(safeSeconds / 3600)
  const minutes = Math.floor((safeSeconds % 3600) / 60)
  const remainSeconds = safeSeconds % 60

  if (hours > 0) {
    return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${remainSeconds.toString().padStart(2, '0')}`
  }

  return `${minutes.toString().padStart(2, '0')}:${remainSeconds.toString().padStart(2, '0')}`
}

function buildVideoSummaryText(file: FileMetadata, ingestResult: VideoIngestResult): string {
  const lines = [
    `Video attachment: ${file.origin_name}`,
    `Duration: ${formatTimelineTimestamp(ingestResult.durationSec)}`,
    `Segments: ${ingestResult.segments.length}`,
    `Frames extracted: ${ingestResult.frames.length}`,
    ingestResult.audio ? 'Audio extracted: yes' : 'Audio extracted: no',
    ingestResult.transcript?.segments.length
      ? `Transcript segments: ${ingestResult.transcript.segments.length}`
      : 'Transcript segments: 0'
  ]

  return lines.join('\n')
}

function buildVideoTimelineText(ingestResult: VideoIngestResult): string | null {
  const lines = ingestResult.segments.slice(0, MAX_VIDEO_SEGMENT_TEXTS).map((segment) => {
    const range = `[${formatTimelineTimestamp(segment.startSec)} - ${formatTimelineTimestamp(segment.endSec)}]`
    const transcript = segment.transcript ? segment.transcript.slice(0, 160) : 'No transcript'
    return `${range} ${transcript}`
  })

  if (lines.length === 0) {
    return null
  }

  return `Video timeline:\n${lines.join('\n')}`
}

function buildVideoTranscriptText(ingestResult: VideoIngestResult): string | null {
  if (!ingestResult.transcript?.segments.length) {
    return null
  }

  const lines = ingestResult.transcript.segments.slice(0, MAX_VIDEO_SEGMENT_TEXTS).map((segment) => {
    const range = `[${formatTimelineTimestamp(segment.startSec)} - ${formatTimelineTimestamp(segment.endSec)}]`
    return `${range} ${segment.text}`
  })

  const transcriptText = lines.join('\n').slice(0, MAX_VIDEO_TRANSCRIPT_CHARS)

  if (!transcriptText) {
    return null
  }

  return `Video transcript:\n${transcriptText}`
}

/**
 * 提取文件内容
 */
export async function extractFileContent(message: Message): Promise<string> {
  const fileBlocks = findFileBlocks(message)
  if (fileBlocks.length > 0) {
    const textFileBlocks = fileBlocks.filter(
      (fb) => fb.file && [FILE_TYPE.TEXT, FILE_TYPE.DOCUMENT].some((type) => fb.file.type === type)
    )

    if (textFileBlocks.length > 0) {
      let text = ''
      const divider = '\n\n---\n\n'

      for (const fileBlock of textFileBlocks) {
        const file = fileBlock.file
        const fileContent = (await window.api.file.read(file.id + file.ext)).trim()
        const fileNameRow = 'file: ' + file.origin_name + '\n\n'
        text = text + fileNameRow + fileContent + divider
      }

      return text
    }
  }

  return ''
}

/**
 * 将文件块转换为文本部分
 */
export async function convertFileBlockToTextPart(fileBlock: FileMessageBlock): Promise<TextPart | null> {
  const file = fileBlock.file

  // 处理文本文件
  if (file.type === FILE_TYPE.TEXT) {
    try {
      const fileContent = await window.api.file.read(file.id + file.ext)
      return {
        type: 'text',
        text: `${file.origin_name}\n${fileContent.trim()}`
      }
    } catch (error) {
      logger.warn('Failed to read text file:', error as Error)
    }
  }

  // 处理文档文件（PDF、Word、Excel等）- 提取为文本内容
  if (file.type === FILE_TYPE.DOCUMENT) {
    try {
      const fileContent = await window.api.file.read(file.id + file.ext, true) // true表示强制文本提取
      return {
        type: 'text',
        text: `${file.origin_name}\n${fileContent.trim()}`
      }
    } catch (error) {
      logger.warn(`Failed to extract text from document ${file.origin_name}:`, error as Error)
    }
  }

  return null
}

/**
 * 将视频文件转换为“帧 + 音频 + 时间线文本”多模态输入
 */
export async function convertVideoFileBlockToParts(
  fileBlock: FileMessageBlock,
  model: Model
): Promise<Array<TextPart | FilePart | ImagePart>> {
  const file = fileBlock.file

  if (file.type !== FILE_TYPE.VIDEO) {
    return []
  }

  try {
    const includeFrames = supportsImageInput(model)
    const ingestResult = await window.api.file.ingestVideo(file, {
      frameIntervalSec: includeFrames ? 2 : 4,
      maxFrames: includeFrames ? MAX_VIDEO_FRAME_PARTS : 0,
      segmentDurationSec: 20,
      maxAudioDurationSec: 600
    })

    const parts: Array<TextPart | FilePart | ImagePart> = []
    parts.push({ type: 'text', text: buildVideoSummaryText(file, ingestResult) })

    const timelineText = buildVideoTimelineText(ingestResult)
    if (timelineText) {
      parts.push({ type: 'text', text: timelineText })
    }

    if (includeFrames) {
      const framePaths = ingestResult.segments
        .map((segment) => segment.representativeFramePath)
        .filter((framePath): framePath is string => Boolean(framePath))
        .slice(0, MAX_VIDEO_FRAME_PARTS)

      for (const framePath of framePaths) {
        const base64Frame = await window.api.file.base64ExternalFile(framePath)
        parts.push({
          type: 'image',
          image: base64Frame.data,
          mediaType: base64Frame.mime
        })
      }
    }

    if (ingestResult.audio?.path) {
      const audioSizeLimit = getFileSizeLimit(model, FILE_TYPE.AUDIO)
      if (audioSizeLimit === Infinity || ingestResult.audio.size <= audioSizeLimit) {
        const base64Audio = await window.api.file.base64ExternalFile(ingestResult.audio.path)
        parts.push({
          type: 'file',
          data: base64Audio.data,
          mediaType: base64Audio.mime,
          filename: `${file.id}_audio.wav`
        })
      } else {
        logger.warn(
          `Extracted audio from ${file.origin_name} exceeds size limit (${ingestResult.audio.size} > ${audioSizeLimit})`
        )
      }
    }

    const transcriptText = buildVideoTranscriptText(ingestResult)
    if (transcriptText) {
      parts.push({ type: 'text', text: transcriptText })
    }

    return parts
  } catch (error) {
    logger.warn(`Failed to preprocess video ${file.origin_name}:`, error as Error)
    return [
      {
        type: 'text',
        text: `Video attachment: ${file.origin_name}\nFailed to preprocess video into frames and audio. Please summarize based on available context.`
      }
    ]
  }
}

/**
 * 处理Gemini大文件上传
 */
export async function handleGeminiFileUpload(file: FileMetadata, model: Model): Promise<FilePart | null> {
  try {
    const provider = getProviderByModel(model)

    // 检查文件是否已经上传过
    const fileMetadata = await window.api.fileService.retrieve(provider, file.id)

    if (fileMetadata.status === 'success' && fileMetadata.originalFile?.file) {
      const remoteFile = fileMetadata.originalFile.file as any // 临时类型断言，因为File类型定义可能不完整
      // 注意：AI SDK的FilePart格式和Gemini原生格式不同，这里需要适配
      // 暂时返回null让它回退到文本处理，或者需要扩展FilePart支持uri
      logger.info(`File ${file.origin_name} already uploaded to Gemini with URI: ${remoteFile.uri || 'unknown'}`)
      return null
    }

    // 如果文件未上传，执行上传
    const uploadResult = await window.api.fileService.upload(provider, file)
    if (uploadResult.originalFile?.file) {
      const remoteFile = uploadResult.originalFile.file as any // 临时类型断言
      logger.info(`File ${file.origin_name} uploaded to Gemini with URI: ${remoteFile.uri || 'unknown'}`)
      // 同样，这里需要处理URI格式的文件引用
      return null
    }
  } catch (error) {
    logger.error(`Failed to upload file ${file.origin_name} to Gemini:`, error as Error)
  }

  return null
}

/**
 * 处理OpenAI兼容大文件上传
 */
export async function handleOpenAILargeFileUpload(
  file: FileMetadata,
  model: Model
): Promise<(FilePart & { id?: string }) | null> {
  const provider = getProviderByModel(model)
  // 如果模型为qwen-long系列，文档中要求purpose需要为'file-extract'
  if (['qwen-long', 'qwen-doc'].some((modelName) => model.name.includes(modelName))) {
    file = {
      ...file,
      // 该类型并不在OpenAI定义中，但符合sdk规范，强制断言
      purpose: 'file-extract' as OpenAI.FilePurpose
    }
  }
  try {
    // 检查文件是否已经上传过
    const fileMetadata = await window.api.fileService.retrieve(provider, file.id)
    if (fileMetadata.status === 'success' && fileMetadata.originalFile?.file) {
      // 断言OpenAIFile对象
      const remoteFile = fileMetadata.originalFile.file as OpenAI.Files.FileObject
      // 判断用途是否一致
      if (remoteFile.purpose !== file.purpose) {
        logger.warn(`File ${file.origin_name} purpose mismatch: ${remoteFile.purpose} vs ${file.purpose}`)
        throw new Error('File purpose mismatch')
      }
      return {
        type: 'file',
        filename: file.origin_name,
        mediaType: '',
        data: `fileid://${remoteFile.id}`
      }
    }
  } catch (error) {
    logger.error(`Failed to retrieve file ${file.origin_name}:`, error as Error)
    return null
  }
  try {
    // 如果文件未上传，执行上传
    const uploadResult = await window.api.fileService.upload(provider, file)
    if (uploadResult.originalFile?.file) {
      // 断言OpenAIFile对象
      const remoteFile = uploadResult.originalFile.file as OpenAI.Files.FileObject
      logger.info(`File ${file.origin_name} uploaded.`)
      return {
        type: 'file',
        filename: remoteFile.filename,
        mediaType: '',
        data: `fileid://${remoteFile.id}`
      }
    }
  } catch (error) {
    logger.error(`Failed to upload file ${file.origin_name}:`, error as Error)
  }

  return null
}

/**
 * 大文件上传路由函数
 */
export async function handleLargeFileUpload(
  file: FileMetadata,
  model: Model
): Promise<(FilePart & { id?: string }) | null> {
  const provider = getProviderByModel(model)
  const aiSdkId = getAiSdkProviderId(provider)

  if (['google', 'google-generative-ai', 'google-vertex'].includes(aiSdkId)) {
    return await handleGeminiFileUpload(file, model)
  }

  if (provider.type === 'openai') {
    return await handleOpenAILargeFileUpload(file, model)
  }

  return null
}

/**
 * 将文件块转换为FilePart（用于原生文件支持）
 */
export async function convertFileBlockToFilePart(fileBlock: FileMessageBlock, model: Model): Promise<FilePart | null> {
  const file = fileBlock.file
  const fileSizeLimit = getFileSizeLimit(model, file.type)

  try {
    // 处理PDF文档
    if (file.type === FILE_TYPE.DOCUMENT && file.ext === '.pdf' && supportsPdfInput(model)) {
      // 检查文件大小限制
      if (file.size > fileSizeLimit) {
        // 如果支持大文件上传（如Gemini File API），尝试上传
        if (supportsLargeFileUpload(model)) {
          logger.info(`Large PDF file ${file.origin_name} (${file.size} bytes) attempting File API upload`)
          const uploadResult = await handleLargeFileUpload(file, model)
          if (uploadResult) {
            return uploadResult
          }
          // 如果上传失败，回退到文本处理
          logger.warn(`Failed to upload large PDF ${file.origin_name}, falling back to text extraction`)
          return null
        } else {
          logger.warn(`PDF file ${file.origin_name} exceeds size limit (${file.size} > ${fileSizeLimit})`)
          return null // 文件过大，回退到文本处理
        }
      }

      const base64Data = await window.api.file.base64File(file.id + file.ext)
      return {
        type: 'file',
        data: base64Data.data,
        mediaType: base64Data.mime,
        filename: file.origin_name
      }
    }

    // 处理图片文件
    if (file.type === FILE_TYPE.IMAGE && supportsImageInput(model)) {
      // 检查文件大小
      if (file.size > fileSizeLimit) {
        logger.warn(`Image file ${file.origin_name} exceeds size limit (${file.size} > ${fileSizeLimit})`)
        return null
      }

      const base64Data = await window.api.file.base64Image(file.id + file.ext)

      // 处理MIME类型，特别是jpg->jpeg的转换（Anthropic要求）
      let mediaType = base64Data.mime
      const provider = getProviderByModel(model)
      const aiSdkId = getAiSdkProviderId(provider)

      if (aiSdkId === 'anthropic' && mediaType === 'image/jpg') {
        mediaType = 'image/jpeg'
      }

      return {
        type: 'file',
        data: base64Data.base64,
        mediaType: mediaType,
        filename: file.origin_name
      }
    }

    // 视频输入不再发送原始文件，统一在上层通过 convertVideoFileBlockToParts 做“帧 + 音频”转换
    if (file.type === FILE_TYPE.VIDEO) {
      return null
    }

    // 处理其他文档类型（Word、Excel等）
    if (file.type === FILE_TYPE.DOCUMENT && file.ext !== '.pdf') {
      // 目前大多数提供商不支持Word等格式的原生处理
      // 返回null会触发上层调用convertFileBlockToTextPart进行文本提取
      // 这与Legacy架构中的处理方式一致
      logger.debug(`Document file ${file.origin_name} with extension ${file.ext} will use text extraction fallback`)
      return null
    }
  } catch (error) {
    logger.warn(`Failed to process file ${file.origin_name}:`, error as Error)
  }

  return null
}
