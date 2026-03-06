import { useEffect } from 'react'

interface ConversationTabRef {
  id: string
  assistantId: string
  topicId: string
}

interface UseCloseActiveConversationTabShortcutOptions {
  activeConversationTabId: string
  conversationTabs: ConversationTabRef[]
  enabled: boolean
  onConversationTabClose: (assistantId: string, topicId: string) => void
}

export function useCloseActiveConversationTabShortcut({
  activeConversationTabId,
  conversationTabs,
  enabled,
  onConversationTabClose
}: UseCloseActiveConversationTabShortcutOptions) {
  useEffect(() => {
    if (!enabled || conversationTabs.length <= 1) {
      return
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      const isCloseShortcut = (event.ctrlKey || event.metaKey) && !event.altKey && !event.shiftKey && event.key === 'w'

      if (!isCloseShortcut) {
        return
      }

      const activeTab = conversationTabs.find((tab) => tab.id === activeConversationTabId)
      if (!activeTab) {
        return
      }

      event.preventDefault()
      event.stopPropagation()
      event.stopImmediatePropagation()
      onConversationTabClose(activeTab.assistantId, activeTab.topicId)
    }

    window.addEventListener('keydown', handleKeyDown, true)

    return () => {
      window.removeEventListener('keydown', handleKeyDown, true)
    }
  }, [activeConversationTabId, conversationTabs, enabled, onConversationTabClose])
}
