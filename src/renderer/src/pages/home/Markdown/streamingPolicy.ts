import { MessageBlockStatus } from '@renderer/types/newMessage'

export interface MarkdownStreamingPolicy {
  minDelay: number
  deferMarkdownRender: boolean
  deferStateUpdates: boolean
}

const DEFAULT_POLICY: MarkdownStreamingPolicy = {
  minDelay: 10,
  deferMarkdownRender: false,
  deferStateUpdates: false
}

export const getMarkdownStreamingPolicy = (
  status: MessageBlockStatus | string | undefined,
  contentLength: number
): MarkdownStreamingPolicy => {
  if (status !== MessageBlockStatus.STREAMING) {
    return DEFAULT_POLICY
  }

  if (contentLength >= 12000) {
    return {
      minDelay: 80,
      deferMarkdownRender: true,
      deferStateUpdates: true
    }
  }

  if (contentLength >= 4000) {
    return {
      minDelay: 48,
      deferMarkdownRender: true,
      deferStateUpdates: true
    }
  }

  return {
    minDelay: 16,
    deferMarkdownRender: false,
    deferStateUpdates: false
  }
}
