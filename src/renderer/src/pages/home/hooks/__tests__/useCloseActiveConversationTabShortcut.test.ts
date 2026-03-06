import { renderHook } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { useCloseActiveConversationTabShortcut } from '../useCloseActiveConversationTabShortcut'

describe('useCloseActiveConversationTabShortcut', () => {
  const onConversationTabClose = vi.fn()

  beforeEach(() => {
    onConversationTabClose.mockClear()
  })

  it('closes the active conversation tab on Ctrl+W', () => {
    renderHook(() =>
      useCloseActiveConversationTabShortcut({
        activeConversationTabId: 'assistant-1:topic-2',
        conversationTabs: [
          { id: 'assistant-1:topic-1', assistantId: 'assistant-1', topicId: 'topic-1' },
          { id: 'assistant-1:topic-2', assistantId: 'assistant-1', topicId: 'topic-2' }
        ],
        enabled: true,
        onConversationTabClose
      })
    )

    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'w', ctrlKey: true, bubbles: true, cancelable: true }))

    expect(onConversationTabClose).toHaveBeenCalledWith('assistant-1', 'topic-2')
  })

  it('does not close when there is only one conversation tab', () => {
    renderHook(() =>
      useCloseActiveConversationTabShortcut({
        activeConversationTabId: 'assistant-1:topic-1',
        conversationTabs: [{ id: 'assistant-1:topic-1', assistantId: 'assistant-1', topicId: 'topic-1' }],
        enabled: true,
        onConversationTabClose
      })
    )

    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'w', ctrlKey: true, bubbles: true, cancelable: true }))

    expect(onConversationTabClose).not.toHaveBeenCalled()
  })
})
