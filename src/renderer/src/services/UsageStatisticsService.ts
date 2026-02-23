import type { Assistant, Topic, Usage } from '@renderer/types'
import type { Message } from '@renderer/types/newMessage'

export interface TokenUsageSummary {
  promptTokens: number
  completionTokens: number
  totalTokens: number
  messageCount: number
  messagesWithUsage: number
}

export interface ConversationUsageStats extends TokenUsageSummary {
  id: string
  index: number
  startedAt?: string
  updatedAt?: string
}

export interface TopicUsageStats extends TokenUsageSummary {
  topicId: string
  topicName: string
  conversationCount: number
  conversations: ConversationUsageStats[]
}

export interface AssistantUsageStats extends TokenUsageSummary {
  assistantId: string
  assistantName: string
  topicCount: number
  conversationCount: number
  topics: TopicUsageStats[]
}

export interface UsageStatistics extends TokenUsageSummary {
  assistantCount: number
  topicCount: number
  conversationCount: number
  generatedAt: string
  assistants: AssistantUsageStats[]
}

const createEmptySummary = (): TokenUsageSummary => ({
  promptTokens: 0,
  completionTokens: 0,
  totalTokens: 0,
  messageCount: 0,
  messagesWithUsage: 0
})

const normalizeUsage = (
  usage?: Usage
): Pick<TokenUsageSummary, 'promptTokens' | 'completionTokens' | 'totalTokens'> => {
  const promptTokens = Math.max(0, usage?.prompt_tokens ?? 0)
  const completionTokens = Math.max(0, usage?.completion_tokens ?? 0)
  const totalTokens = Math.max(0, usage?.total_tokens ?? promptTokens + completionTokens)

  return {
    promptTokens,
    completionTokens,
    totalTokens
  }
}

const addMessageUsage = (summary: TokenUsageSummary, message: Message): void => {
  const usage = normalizeUsage(message.usage)
  summary.promptTokens += usage.promptTokens
  summary.completionTokens += usage.completionTokens
  summary.totalTokens += usage.totalTokens
  summary.messageCount += 1

  if (message.usage) {
    summary.messagesWithUsage += 1
  }
}

const mergeSummary = (target: TokenUsageSummary, source: TokenUsageSummary): void => {
  target.promptTokens += source.promptTokens
  target.completionTokens += source.completionTokens
  target.totalTokens += source.totalTokens
  target.messageCount += source.messageCount
  target.messagesWithUsage += source.messagesWithUsage
}

type ConversationAccumulator = Omit<ConversationUsageStats, 'index'>

const getConversationKey = (message: Message): string => {
  return message.role === 'assistant' && message.askId ? message.askId : message.id
}

export const buildConversationUsageStats = (messages: Message[]): ConversationUsageStats[] => {
  const conversationMap = new Map<string, ConversationAccumulator>()

  for (const message of messages) {
    const key = getConversationKey(message)
    let conversation = conversationMap.get(key)

    if (!conversation) {
      conversation = {
        id: key,
        startedAt: message.createdAt,
        updatedAt: message.createdAt,
        ...createEmptySummary()
      }
      conversationMap.set(key, conversation)
    }

    addMessageUsage(conversation, message)
    conversation.updatedAt = message.createdAt

    if (!conversation.startedAt || message.createdAt < conversation.startedAt) {
      conversation.startedAt = message.createdAt
    }
  }

  return Array.from(conversationMap.values()).map((conversation, index) => ({
    ...conversation,
    index: index + 1
  }))
}

const buildTopicUsageStats = (topic: Topic, messages: Message[]): TopicUsageStats => {
  const conversations = buildConversationUsageStats(messages)
  const summary = createEmptySummary()

  conversations.forEach((conversation) => mergeSummary(summary, conversation))

  return {
    topicId: topic.id,
    topicName: topic.name,
    conversationCount: conversations.length,
    conversations,
    ...summary
  }
}

interface TopicMessagesById {
  [topicId: string]: Message[]
}

export const aggregateUsageStatistics = (
  assistants: Assistant[],
  topicMessagesById: TopicMessagesById,
  generatedAt: string = new Date().toISOString()
): UsageStatistics => {
  const assistantStats: AssistantUsageStats[] = assistants.map((assistant) => {
    const topics = Array.isArray(assistant.topics) ? assistant.topics : []
    const topicStats = topics.map((topic) => buildTopicUsageStats(topic, topicMessagesById[topic.id] ?? []))

    const summary = createEmptySummary()
    topicStats.forEach((topic) => mergeSummary(summary, topic))

    return {
      assistantId: assistant.id,
      assistantName: assistant.name,
      topicCount: topicStats.length,
      conversationCount: topicStats.reduce((count, topic) => count + topic.conversationCount, 0),
      topics: topicStats,
      ...summary
    }
  })

  const globalSummary = createEmptySummary()
  assistantStats.forEach((assistant) => mergeSummary(globalSummary, assistant))

  return {
    assistantCount: assistantStats.length,
    topicCount: assistantStats.reduce((count, assistant) => count + assistant.topicCount, 0),
    conversationCount: assistantStats.reduce((count, assistant) => count + assistant.conversationCount, 0),
    generatedAt,
    assistants: assistantStats,
    ...globalSummary
  }
}
