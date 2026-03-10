import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { Message } from '@renderer/types/newMessage'

const { getGroupedMessagesMock, getMainTextContentMock } = vi.hoisted(() => ({
  getGroupedMessagesMock: vi.fn((messages: Message[]) =>
    Object.fromEntries(messages.map((message, index) => [[`group-${index}`], [{ ...message, index }]]))
  ),
  getMainTextContentMock: vi.fn((message: Message) => {
    const contentById: Record<string, string> = {
      'user-1': 'User one',
      'assistant-1': 'Assistant one',
      'clear-1': 'Clear',
      'user-2': 'User two'
    }

    return contentById[message.id] || message.id
  })
}))

vi.mock('@renderer/services/MessagesService', () => ({
  getGroupedMessages: getGroupedMessagesMock
}))

vi.mock('@renderer/utils/messageUtils/find', () => ({
  getMainTextContent: getMainTextContentMock
}))

import { deriveMessageRenderData } from '../messageDerivations'

const createMessage = (overrides: Partial<Message> & Pick<Message, 'id' | 'role'>): Message =>
  ({
    assistantId: 'assistant-1',
    topicId: 'topic-1',
    createdAt: '2026-03-10T00:00:00.000Z',
    status: 'success',
    blocks: [],
    ...overrides
  }) as Message

describe('deriveMessageRenderData', () => {
  const messages = [
    createMessage({ id: 'user-1', role: 'user' }),
    createMessage({ id: 'assistant-1', role: 'assistant', askId: 'user-1' }),
    createMessage({ id: 'clear-1', role: 'assistant', type: 'clear' }),
    createMessage({ id: 'user-2', role: 'user' })
  ]

  beforeEach(() => {
    getGroupedMessagesMock.mockClear()
    getMainTextContentMock.mockClear()
  })

  it('returns stable cached structures for the same message array', () => {
    const firstResult = deriveMessageRenderData(messages)
    const secondResult = deriveMessageRenderData(messages)

    expect(secondResult).toBe(firstResult)
    expect(secondResult.displayMessages).toBe(firstResult.displayMessages)
    expect(secondResult.groupedMessages).toBe(firstResult.groupedMessages)
    expect(secondResult.timelineAnchors).toBe(firstResult.timelineAnchors)
    expect(getGroupedMessagesMock).toHaveBeenCalledTimes(1)
  })

  it('preserves display ordering and timeline anchor mapping', () => {
    const result = deriveMessageRenderData(messages)

    expect(result.displayMessages.map((message) => message.id)).toEqual(['user-2', 'clear-1', 'assistant-1', 'user-1'])
    expect(result.groupedMessages.map(([key, group]) => [key, group[0]?.id])).toEqual([
      ['group-0', 'user-2'],
      ['group-1', 'clear-1'],
      ['group-2', 'assistant-1'],
      ['group-3', 'user-1']
    ])
    expect(result.timelineAnchors).toEqual([
      {
        id: 'user-1',
        userPreview: 'User one',
        assistantPreview: 'Assistant one'
      },
      {
        id: 'user-2',
        userPreview: 'User two',
        assistantPreview: ''
      }
    ])
  })

  it('ignores clear messages when building timeline anchors', () => {
    const result = deriveMessageRenderData(messages)

    expect(result.timelineAnchors.find((anchor) => anchor.id === 'clear-1')).toBeUndefined()
    expect(getMainTextContentMock).not.toHaveBeenCalledWith(expect.objectContaining({ id: 'clear-1' }))
  })
})
