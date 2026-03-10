import { getGroupedMessages } from '@renderer/services/MessagesService'
import type { Message } from '@renderer/types/newMessage'
import { getMainTextContent } from '@renderer/utils/messageUtils/find'

export interface TimelineAnchor {
  id: string
  userPreview: string
  assistantPreview: string
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
  nonClearMessages.forEach((message) => {
    if (message.role !== 'assistant' || !message.askId) {
      return
    }

    const assistantPreview = getMessagePreview(message, MAX_ASSISTANT_PREVIEW_LENGTH)
    if (assistantPreview) {
      assistantPreviewByAskId.set(message.askId, assistantPreview)
    }
  })

  if (userMessages.length > 0) {
    return userMessages.map((userMessage) => ({
      id: userMessage.id,
      userPreview: getMessagePreview(userMessage, MAX_USER_PREVIEW_LENGTH),
      assistantPreview: assistantPreviewByAskId.get(userMessage.id) || ''
    }))
  }

  return nonClearMessages.map((message) => ({
    id: message.id,
    userPreview: message.role === 'user' ? getMessagePreview(message, MAX_USER_PREVIEW_LENGTH) : '',
    assistantPreview: message.role === 'assistant' ? getMessagePreview(message, MAX_ASSISTANT_PREVIEW_LENGTH) : ''
  }))
}
