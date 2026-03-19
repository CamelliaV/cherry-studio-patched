import { getGroupedMessages } from '@renderer/services/MessagesService'
import { AssistantMessageStatus, MessageBlockStatus, MessageBlockType, type Message } from '@renderer/types/newMessage'
import { findAllBlocks, getMainTextContent } from '@renderer/utils/messageUtils/find'

export interface TimelineAnchor {
  id: string
  userPreview: string
  assistantPreview: string
  hasFailure: boolean
}

type GroupedMessage = Message & {
  index: number
}

export interface MessageRenderData {
  displayMessages: Message[]
  groupedMessages: Array<[string, GroupedMessage[]]>
  timelineAnchors: TimelineAnchor[]
}

const MAX_USER_PREVIEW_LENGTH = 44
const MAX_ASSISTANT_PREVIEW_LENGTH = 56

const renderDataCache = new WeakMap<Message[], MessageRenderData>()

const normalizePreview = (content: string) => content.replace(/\s+/g, ' ').trim()

const truncatePreview = (content: string, maxLength: number) =>
  content.length > maxLength ? `${content.slice(0, maxLength)}…` : content

const getMessagePreview = (message: Message | undefined, maxLength: number) => {
  if (!message) {
    return ''
  }

  const content = normalizePreview(getMainTextContent(message))
  if (!content) {
    return ''
  }

  return truncatePreview(content, maxLength)
}

const hasUnfinishedAssistantReply = (message: Message | undefined) => {
  if (!message || message.role !== 'assistant') {
    return false
  }

  // Message status is the canonical indicator of whether a conversation turn
  // is complete. Block-level statuses can be stale (e.g. thinking blocks stuck
  // in STREAMING after the stream ended without a reasoning-end event).
  return (
    message.status === AssistantMessageStatus.PENDING ||
    message.status === AssistantMessageStatus.PROCESSING ||
    message.status === AssistantMessageStatus.SEARCHING
  )
}

const hasAssistantReplyFailure = (message: Message | undefined, hasLaterActivity: boolean) => {
  if (!message || message.role !== 'assistant') {
    return false
  }

  if (message.status === AssistantMessageStatus.ERROR || message.status === AssistantMessageStatus.PAUSED) {
    return true
  }

  const blocks = findAllBlocks(message)
  const hasExplicitFailure = blocks.some((block) => {
    if (block.type === MessageBlockType.ERROR) {
      return true
    }

    if (block.status === MessageBlockStatus.PAUSED) {
      return true
    }

    return block.status === MessageBlockStatus.ERROR && block.type !== MessageBlockType.TOOL
  })

  if (hasExplicitFailure) {
    return true
  }

  return hasLaterActivity && hasUnfinishedAssistantReply(message)
}

export const deriveMessageRenderData = (messages: Message[]): MessageRenderData => {
  const cached = renderDataCache.get(messages)
  if (cached) {
    return cached
  }

  const displayMessages = [...messages].reverse()
  const groupedMessages = Object.entries(getGroupedMessages(displayMessages)).map(
    ([key, group]) => [key, group.toReversed()] as [string, GroupedMessage[]]
  )
  const timelineAnchors = deriveTimelineAnchorsFromDisplayMessages(displayMessages)

  const result = {
    displayMessages,
    groupedMessages,
    timelineAnchors
  }

  renderDataCache.set(messages, result)

  return result
}

export const deriveTimelineAnchorsFromDisplayMessages = (displayMessages: Message[]): TimelineAnchor[] => {
  const nonClearMessages = displayMessages.filter((message) => message.type !== 'clear').toReversed()
  const userMessages = nonClearMessages.filter((message) => message.role === 'user')

  const assistantPreviewByAskId = new Map<string, string>()
  const assistantFailureByAskId = new Map<string, boolean>()
  nonClearMessages.forEach((message, index) => {
    if (message.role !== 'assistant' || !message.askId) {
      return
    }

    const hasLaterActivity = index < nonClearMessages.length - 1

    const assistantPreview = getMessagePreview(message, MAX_ASSISTANT_PREVIEW_LENGTH)
    if (assistantPreview) {
      assistantPreviewByAskId.set(message.askId, assistantPreview)
    }

    assistantFailureByAskId.set(
      message.askId,
      (assistantFailureByAskId.get(message.askId) ?? false) || hasAssistantReplyFailure(message, hasLaterActivity)
    )
  })

  if (userMessages.length > 0) {
    return userMessages.map((userMessage) => ({
      id: userMessage.id,
      userPreview: getMessagePreview(userMessage, MAX_USER_PREVIEW_LENGTH),
      assistantPreview: assistantPreviewByAskId.get(userMessage.id) || '',
      hasFailure: assistantFailureByAskId.get(userMessage.id) || false
    }))
  }

  return nonClearMessages.map((message, index) => {
    const hasLaterActivity = index < nonClearMessages.length - 1

    return {
      id: message.id,
      userPreview: message.role === 'user' ? getMessagePreview(message, MAX_USER_PREVIEW_LENGTH) : '',
      assistantPreview: message.role === 'assistant' ? getMessagePreview(message, MAX_ASSISTANT_PREVIEW_LENGTH) : '',
      hasFailure: hasAssistantReplyFailure(message, hasLaterActivity)
    }
  })
}
