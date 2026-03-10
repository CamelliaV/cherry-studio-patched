import { render, screen } from '@testing-library/react'
import type { ReactNode } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { Assistant, Topic } from '@renderer/types'
import type { Message } from '@renderer/types/newMessage'

import Messages from '../Messages'

const { estimateHistoryTokensMock, messageAnchorLineRenderSpy } = vi.hoisted(() => ({
  estimateHistoryTokensMock: vi.fn(async () => 128),
  messageAnchorLineRenderSpy: vi.fn()
}))

vi.mock('@renderer/hooks/useAssistant', () => ({
  useAssistant: () => ({
    addTopic: vi.fn()
  })
}))

vi.mock('@renderer/hooks/useChatContext', () => ({
  useChatContext: () => ({
    isMultiSelectMode: false,
    handleSelectMessage: vi.fn()
  })
}))

vi.mock('@renderer/hooks/useMessageOperations', () => ({
  useMessageOperations: () => ({
    clearTopicMessages: vi.fn(),
    deleteMessage: vi.fn(),
    createTopicBranch: vi.fn()
  }),
  useTopicMessages: () => [
    {
      id: 'message-1',
      role: 'user',
      assistantId: 'assistant-1',
      topicId: 'topic-1',
      createdAt: '2026-03-10T00:00:00.000Z',
      status: 'success',
      blocks: []
    }
  ]
}))

vi.mock('@renderer/hooks/useScrollPosition', () => ({
  default: () => ({
    containerRef: { current: null },
    handleScroll: vi.fn()
  })
}))

vi.mock('@renderer/hooks/useSettings', () => ({
  useSettings: () => ({
    showPrompt: false
  })
}))

vi.mock('@renderer/hooks/useShortcuts', () => ({
  useShortcut: vi.fn()
}))

vi.mock('@renderer/hooks/useTopic', () => ({
  autoRenameTopic: vi.fn()
}))

vi.mock('@renderer/services/AssistantService', () => ({
  getDefaultTopic: vi.fn()
}))

vi.mock('@renderer/services/EventService', () => ({
  EVENT_NAMES: {
    ESTIMATED_TOKEN_COUNT: 'estimated-token-count'
  },
  EventEmitter: {
    on: vi.fn(() => () => {}),
    emit: vi.fn()
  }
}))

vi.mock('@renderer/services/MessagesService', () => ({
  getContextCount: vi.fn(() => ({ messages: 1, prompts: 0 })),
  getGroupedMessages: vi.fn((messages: Message[]) => ({
    group: messages.map((message, index) => ({ ...message, index }))
  })),
  getUserMessage: vi.fn()
}))

vi.mock('@renderer/services/TokenService', () => ({
  estimateHistoryTokens: estimateHistoryTokensMock
}))

vi.mock('@renderer/store', () => ({
  __esModule: true,
  default: {
    getState: vi.fn(() => ({}))
  },
  useAppDispatch: () => vi.fn()
}))

vi.mock('@renderer/store/messageBlock', () => ({
  messageBlocksSelectors: {
    selectById: vi.fn()
  },
  updateOneBlock: vi.fn()
}))

vi.mock('@renderer/store/newMessage', () => ({
  newMessagesActions: {
    addMessage: vi.fn()
  }
}))

vi.mock('@renderer/store/thunk/messageThunk', () => ({
  saveMessageAndBlocksToDB: vi.fn(),
  updateMessageAndBlocksThunk: vi.fn()
}))

vi.mock('@renderer/utils', () => ({
  captureScrollableAsBlob: vi.fn(),
  captureScrollableAsDataURL: vi.fn(),
  removeSpecialCharactersForFileName: vi.fn((value: string) => value),
  runAsyncFunction: (callback: () => Promise<unknown>) => callback()
}))

vi.mock('@renderer/utils/markdown', () => ({
  updateCodeBlock: vi.fn()
}))

vi.mock('@renderer/utils/messageUtils/find', () => ({
  getMainTextContent: vi.fn(() => 'message content')
}))

vi.mock('@renderer/utils/messageUtils/is', () => ({
  isTextLikeBlock: vi.fn(() => false)
}))

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => key
  })
}))

vi.mock('../MessageAnchorLine', () => ({
  default: (props: { isActive?: boolean }) => {
    messageAnchorLineRenderSpy(props)
    return <div data-testid="message-anchor-line" data-active={String(props.isActive)} />
  }
}))

vi.mock('../MessageGroup', () => ({
  default: () => <div data-testid="message-group" />
}))

vi.mock('../NarrowLayout', () => ({
  default: ({ children }: { children: ReactNode }) => <div>{children}</div>
}))

vi.mock('../Prompt', () => ({
  default: () => <div data-testid="prompt" />
}))

vi.mock('../SelectionBox', () => ({
  default: () => <div data-testid="selection-box" />
}))

vi.mock('@renderer/components/ContextMenu', () => ({
  default: ({ children }: { children: ReactNode }) => <>{children}</>
}))

const assistant = {
  id: 'assistant-1',
  name: 'Assistant',
  prompt: '',
  topics: []
} as Assistant

const topic = {
  id: 'topic-1',
  name: 'Topic 1'
} as Topic

describe('Messages dormancy', () => {
  beforeEach(() => {
    estimateHistoryTokensMock.mockClear()
    messageAnchorLineRenderSpy.mockClear()
  })

  it('does not run inactive-only timeline and token work for warm panels', async () => {
    render(<Messages assistant={assistant} topic={topic} setActiveTopic={vi.fn()} isActive={false} />)

    await Promise.resolve()

    expect(estimateHistoryTokensMock).not.toHaveBeenCalled()
    expect(screen.queryByTestId('message-anchor-line')).not.toBeInTheDocument()
    expect(messageAnchorLineRenderSpy).not.toHaveBeenCalled()
  })

  it('keeps active panel affordances mounted', async () => {
    render(<Messages assistant={assistant} topic={topic} setActiveTopic={vi.fn()} isActive />)

    await Promise.resolve()

    expect(screen.getByTestId('message-anchor-line')).toBeInTheDocument()
  })
})
