import { act, render } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { Message } from '@renderer/types/newMessage'

import MessageAnchorLine from '../MessageAnchorLine'

const { scrollIntoViewMock } = vi.hoisted(() => ({
  scrollIntoViewMock: vi.fn()
}))

vi.mock('@renderer/utils/dom', () => ({
  scrollIntoView: scrollIntoViewMock
}))

vi.mock('@renderer/services/MessagesService', () => ({
  getGroupedMessages: vi.fn(() => ({}))
}))

vi.mock('@renderer/utils/messageUtils/find', () => ({
  getMainTextContent: (message: Message) => message.id
}))

vi.mock('react-hotkeys-hook', () => ({
  useHotkeys: vi.fn()
}))

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => key
  })
}))

const createMessage = (index: number): Message => ({
  id: `user-${index}`,
  role: 'user',
  assistantId: 'assistant-1',
  topicId: 'topic-1',
  createdAt: `2026-03-09T00:00:0${index}.000Z`,
  status: 'success',
  blocks: []
})

const createMessages = (count: number) =>
  Array.from({ length: count }, (_, index) => createMessage(index + 1)).reverse()

const renderTimeline = (messages: Message[]) => {
  render(
    <>
      <div id="messages">
        {messages.map((message) => (
          <div key={message.id} id={`message-${message.id}`}>
            {message.id}
          </div>
        ))}
      </div>
      <MessageAnchorLine messages={messages} containerId="messages" isActive />
    </>
  )
}

describe('MessageAnchorLine', () => {
  beforeEach(() => {
    scrollIntoViewMock.mockClear()
    window.localStorage.clear()
  })

  const dispatchKeyDown = (eventInit: KeyboardEventInit) => {
    act(() => {
      window.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, cancelable: true, ...eventInit }))
    })
  }

  it('jumps to the first anchor on Alt+Numpad1', () => {
    const messages = createMessages(7)
    renderTimeline(messages)

    dispatchKeyDown({
      key: '1',
      code: 'Numpad1',
      altKey: true
    })

    expect(scrollIntoViewMock).toHaveBeenCalledWith(document.getElementById('message-user-1'), {
      behavior: 'smooth',
      block: 'start',
      container: 'nearest'
    })
  })

  it('jumps to the seventh anchor on Alt+Numpad7', () => {
    const messages = createMessages(7)
    renderTimeline(messages)

    dispatchKeyDown({
      key: '7',
      code: 'Numpad7',
      altKey: true
    })

    expect(scrollIntoViewMock).toHaveBeenCalledWith(document.getElementById('message-user-7'), {
      behavior: 'smooth',
      block: 'start',
      container: 'nearest'
    })
  })

  it('keeps the numpad shortcut active while an input is focused', () => {
    const messages = createMessages(2)
    renderTimeline(messages)

    const input = document.createElement('input')
    document.body.append(input)
    input.focus()

    dispatchKeyDown({
      key: '2',
      code: 'Numpad2',
      altKey: true
    })

    expect(scrollIntoViewMock).toHaveBeenCalledWith(document.getElementById('message-user-2'), {
      behavior: 'smooth',
      block: 'start',
      container: 'nearest'
    })
  })

  it('ignores top-row Alt+1', () => {
    const messages = createMessages(3)
    renderTimeline(messages)

    dispatchKeyDown({
      key: '1',
      code: 'Digit1',
      altKey: true
    })

    expect(scrollIntoViewMock).not.toHaveBeenCalled()
  })

  it('does nothing when the requested anchor index is out of range', () => {
    const messages = createMessages(4)
    renderTimeline(messages)

    dispatchKeyDown({
      key: '9',
      code: 'Numpad9',
      altKey: true
    })

    expect(scrollIntoViewMock).not.toHaveBeenCalled()
  })
})
