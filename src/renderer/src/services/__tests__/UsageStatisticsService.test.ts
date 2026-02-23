import type { Assistant, Topic, Usage } from '@renderer/types'
import { AssistantMessageStatus, type Message, UserMessageStatus } from '@renderer/types/newMessage'
import { describe, expect, it } from 'vitest'

import { aggregateUsageStatistics, buildConversationUsageStats } from '../UsageStatisticsService'

const createTopic = (id: string, assistantId: string, name: string): Topic => ({
  id,
  assistantId,
  name,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
  messages: []
})

const createAssistant = (id: string, name: string, topics: Topic[]): Assistant => ({
  id,
  name,
  prompt: '',
  topics,
  type: 'assistant'
})

const createMessage = ({
  id,
  role,
  topicId,
  assistantId,
  createdAt,
  askId,
  usage
}: {
  id: string
  role: Message['role']
  topicId: string
  assistantId: string
  createdAt: string
  askId?: string
  usage?: Usage
}): Message => ({
  id,
  role,
  topicId,
  assistantId,
  createdAt,
  status: role === 'assistant' ? AssistantMessageStatus.SUCCESS : UserMessageStatus.SUCCESS,
  blocks: [],
  askId,
  usage
})

describe('buildConversationUsageStats', () => {
  it('groups assistant responses by askId with related user messages', () => {
    const messages: Message[] = [
      createMessage({
        id: 'u-1',
        role: 'user',
        topicId: 'topic-1',
        assistantId: 'assistant-1',
        createdAt: '2026-01-01T00:00:00.000Z',
        usage: { prompt_tokens: 10, completion_tokens: 0, total_tokens: 10 }
      }),
      createMessage({
        id: 'a-1',
        role: 'assistant',
        topicId: 'topic-1',
        assistantId: 'assistant-1',
        askId: 'u-1',
        createdAt: '2026-01-01T00:00:05.000Z',
        usage: { prompt_tokens: 30, completion_tokens: 70, total_tokens: 100 }
      }),
      createMessage({
        id: 'u-2',
        role: 'user',
        topicId: 'topic-1',
        assistantId: 'assistant-1',
        createdAt: '2026-01-01T00:01:00.000Z',
        usage: { prompt_tokens: 12, completion_tokens: 0, total_tokens: 12 }
      })
    ]

    const conversations = buildConversationUsageStats(messages)

    expect(conversations).toHaveLength(2)
    expect(conversations[0]).toMatchObject({
      id: 'u-1',
      messageCount: 2,
      promptTokens: 40,
      completionTokens: 70,
      totalTokens: 110,
      messagesWithUsage: 2
    })
    expect(conversations[1]).toMatchObject({
      id: 'u-2',
      messageCount: 1,
      promptTokens: 12,
      completionTokens: 0,
      totalTokens: 12,
      messagesWithUsage: 1
    })
  })
})

describe('aggregateUsageStatistics', () => {
  it('aggregates totals across assistants, topics and conversations', () => {
    const topicA1 = createTopic('topic-a1', 'assistant-a', 'Topic A1')
    const topicB1 = createTopic('topic-b1', 'assistant-b', 'Topic B1')

    const assistants: Assistant[] = [
      createAssistant('assistant-a', 'Assistant A', [topicA1]),
      createAssistant('assistant-b', 'Assistant B', [topicB1])
    ]

    const topicMessagesById: Record<string, Message[]> = {
      'topic-a1': [
        createMessage({
          id: 'a-u-1',
          role: 'user',
          topicId: 'topic-a1',
          assistantId: 'assistant-a',
          createdAt: '2026-01-01T00:00:00.000Z',
          usage: { prompt_tokens: 8, completion_tokens: 0, total_tokens: 8 }
        }),
        createMessage({
          id: 'a-a-1',
          role: 'assistant',
          topicId: 'topic-a1',
          assistantId: 'assistant-a',
          askId: 'a-u-1',
          createdAt: '2026-01-01T00:00:03.000Z',
          usage: { prompt_tokens: 12, completion_tokens: 32, total_tokens: 44 }
        })
      ],
      'topic-b1': [
        createMessage({
          id: 'b-u-1',
          role: 'user',
          topicId: 'topic-b1',
          assistantId: 'assistant-b',
          createdAt: '2026-01-01T00:05:00.000Z',
          usage: { prompt_tokens: 6, completion_tokens: 0, total_tokens: 6 }
        }),
        createMessage({
          id: 'b-a-1',
          role: 'assistant',
          topicId: 'topic-b1',
          assistantId: 'assistant-b',
          askId: 'b-u-1',
          createdAt: '2026-01-01T00:05:04.000Z',
          usage: { prompt_tokens: 10, completion_tokens: 40, total_tokens: 50 }
        }),
        createMessage({
          id: 'b-a-2',
          role: 'assistant',
          topicId: 'topic-b1',
          assistantId: 'assistant-b',
          askId: 'b-u-1',
          createdAt: '2026-01-01T00:05:06.000Z',
          usage: { prompt_tokens: 4, completion_tokens: 16, total_tokens: 20 }
        })
      ]
    }

    const stats = aggregateUsageStatistics(assistants, topicMessagesById, '2026-01-01T01:00:00.000Z')

    expect(stats).toMatchObject({
      assistantCount: 2,
      topicCount: 2,
      conversationCount: 2,
      promptTokens: 40,
      completionTokens: 88,
      totalTokens: 128,
      messageCount: 5,
      messagesWithUsage: 5,
      generatedAt: '2026-01-01T01:00:00.000Z'
    })

    expect(stats.assistants[0]).toMatchObject({
      assistantId: 'assistant-a',
      topicCount: 1,
      conversationCount: 1,
      totalTokens: 52
    })

    expect(stats.assistants[1]).toMatchObject({
      assistantId: 'assistant-b',
      topicCount: 1,
      conversationCount: 1,
      totalTokens: 76
    })
  })
})
