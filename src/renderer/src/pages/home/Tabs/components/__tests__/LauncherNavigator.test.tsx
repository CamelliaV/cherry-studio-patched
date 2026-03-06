import type { Assistant, Topic } from '@renderer/types'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import LauncherNavigator from '../LauncherNavigator'

const mockNextImage = vi.fn()
const mockUseSettings = vi.fn(() => ({ backgroundSlideshowEnabled: true }))
const mockUseNavigatorContextMenus = vi.fn(() => ({
  getAssistantContextMenuItems: () => [],
  getTopicContextMenuItems: () => []
}))

vi.mock('@logger', () => ({
  loggerService: {
    withContext: () => ({
      error: vi.fn()
    })
  }
}))

vi.mock('@renderer/components/Avatar/AssistantAvatar', () => ({
  default: ({ assistant }: { assistant: Assistant }) => <span>{assistant.name}</span>
}))

vi.mock('@renderer/components/Popups/AddAssistantPopup', () => ({
  default: {
    show: vi.fn()
  }
}))

vi.mock('@renderer/databases', () => ({
  db: {
    topics: {
      add: vi.fn()
    }
  }
}))

vi.mock('@renderer/hooks/useSettings', () => ({
  useSettings: () => mockUseSettings()
}))

vi.mock('@renderer/hooks/useShortcuts', () => ({
  useShortcutDisplay: vi.fn(() => '')
}))

vi.mock('@renderer/services/BackgroundSlideshowService', () => ({
  backgroundSlideshowService: {
    nextImage: (...args: unknown[]) => mockNextImage(...args)
  }
}))

vi.mock('@renderer/services/AssistantService', () => ({
  getDefaultTopic: vi.fn()
}))

vi.mock('@renderer/store', () => ({
  useAppDispatch: vi.fn(() => vi.fn())
}))

vi.mock('@renderer/store/assistants', () => ({
  addTopic: vi.fn(),
  setModel: vi.fn()
}))

vi.mock('antd', () => ({
  Dropdown: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  Input: ({ onChange, onKeyDown, placeholder, value, ref }: any) => (
    <input ref={ref} value={value} onChange={onChange} onKeyDown={onKeyDown} placeholder={placeholder} />
  )
}))

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) =>
      (
        ({
          'assistants.search': 'Search assistants',
          'chat.add.assistant.title': 'Add Assistant',
          'chat.add.topic.title': 'Add Topic',
          'chat.default.name': 'Default Assistant',
          'common.topics': 'Topics',
          'settings.quickPanel.next_background_image': 'Next Background Image',
          'settings.quickPanel.noResult': 'No results found'
        }) as Record<string, string>
      )[key] ?? key
  })
}))

vi.mock('../useNavigatorContextMenus', () => ({
  useNavigatorContextMenus: () => mockUseNavigatorContextMenus()
}))

const createTopic = (overrides: Partial<Topic> = {}): Topic => ({
  id: 'topic-1',
  assistantId: 'assistant-1',
  name: 'Topic One',
  createdAt: '2026-03-06T00:00:00.000Z',
  updatedAt: '2026-03-06T00:00:00.000Z',
  messages: [],
  ...overrides
})

const createAssistant = (topic: Topic, overrides: Partial<Assistant> = {}): Assistant => ({
  id: 'assistant-1',
  name: 'Assistant One',
  prompt: '',
  topics: [topic],
  type: 'assistant',
  ...overrides
})

describe('LauncherNavigator', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockUseSettings.mockReturnValue({ backgroundSlideshowEnabled: true })
    mockNextImage.mockResolvedValue('file:///next-image.jpg')
  })

  it('shows a next background image action when slideshow background is enabled and keeps it searchable', () => {
    const topic = createTopic()
    const assistant = createAssistant(topic)

    render(
      <LauncherNavigator
        assistants={[assistant]}
        activeAssistant={assistant}
        activeTopic={topic}
        mode="tab"
        onSelect={vi.fn()}
      />
    )

    expect(screen.getByText('Next Background Image')).toBeInTheDocument()

    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'background' } })

    expect(screen.getByText('Next Background Image')).toBeInTheDocument()
    expect(screen.queryByText('Topic One')).not.toBeInTheDocument()
  })

  it('switches the background image and closes the popup after selecting the action', async () => {
    const topic = createTopic()
    const assistant = createAssistant(topic)
    const onClose = vi.fn()

    render(
      <LauncherNavigator
        assistants={[assistant]}
        activeAssistant={assistant}
        activeTopic={topic}
        mode="popup"
        onSelect={vi.fn()}
        onClose={onClose}
      />
    )

    fireEvent.click(screen.getByText('Next Background Image'))

    await waitFor(() => {
      expect(mockNextImage).toHaveBeenCalledTimes(1)
    })
    await waitFor(() => {
      expect(onClose).toHaveBeenCalledTimes(1)
    })
  })

  it('does not show the action when slideshow background is disabled', () => {
    mockUseSettings.mockReturnValue({ backgroundSlideshowEnabled: false })
    const topic = createTopic()
    const assistant = createAssistant(topic)

    render(
      <LauncherNavigator
        assistants={[assistant]}
        activeAssistant={assistant}
        activeTopic={topic}
        mode="tab"
        onSelect={vi.fn()}
      />
    )

    expect(screen.queryByText('Next Background Image')).not.toBeInTheDocument()
  })
})
