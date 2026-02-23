import { loggerService } from '@renderer/services/LoggerService'
import type { VideoMessageBlock } from '@renderer/types/newMessage'
import type { FC } from 'react'
import { useRef } from 'react'
import { useTranslation } from 'react-i18next'
import ReactPlayer from 'react-player'
import styled from 'styled-components'

const logger = loggerService.withContext('MessageVideo')
interface Props {
  block: VideoMessageBlock
}

const MessageVideo: FC<Props> = ({ block }) => {
  const playerRef = useRef<HTMLVideoElement | null>(null)
  const { t } = useTranslation()

  logger.debug(`MessageVideo: ${JSON.stringify(block)}`)

  if (!block.url && !block.filePath) {
    return null
  }

  /**
   * 渲染本地视频文件
   */
  const renderLocalVideo = () => {
    const localPath = block.filePath || block.metadata?.video?.path
    if (!localPath) {
      logger.warn('Local video was requested but block.filePath is missing.')
      return <div>{t('message.video.error.local_file_missing')}</div>
    }

    const videoSrc = `file://${encodeURI(localPath)}`

    const handleReady = () => {
      const startTime = Math.floor(block.metadata?.startTime ?? 0)
      if (playerRef.current) {
        playerRef.current.currentTime = startTime
      }
    }

    return (
      <ReactPlayer
        ref={playerRef}
        style={{
          height: '100%',
          width: '100%'
        }}
        src={videoSrc}
        controls
        onReady={handleReady}
      />
    )
  }

  const renderVideo = () => {
    if (block.url) {
      return (
        <ReactPlayer
          ref={playerRef}
          style={{
            height: '100%',
            width: '100%'
          }}
          src={block.url}
          controls
        />
      )
    }

    if (block.filePath || block.metadata?.video?.path) {
      return renderLocalVideo()
    }

    logger.warn(`Unsupported video type: ${block.metadata?.type} or missing necessary data.`)
    return <div>{t('message.video.error.unsupported_type')}</div>
  }

  return <Container>{renderVideo()}</Container>
}

export default MessageVideo

const Container = styled.div`
  max-width: 560px;
  width: 100%;
  aspect-ratio: 16 / 9;
  height: auto;
  background-color: #000;
`
