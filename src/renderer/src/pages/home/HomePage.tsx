import { ErrorBoundary } from '@renderer/components/ErrorBoundary'
import { useAgentSessionInitializer } from '@renderer/hooks/agents/useAgentSessionInitializer'
import { useAssistants } from '@renderer/hooks/useAssistant'
import { useRuntime } from '@renderer/hooks/useRuntime'
import { useNavbarPosition, useSettings } from '@renderer/hooks/useSettings'
import { useActiveTopic } from '@renderer/hooks/useTopic'
import NavigationService from '@renderer/services/NavigationService'
import { newMessagesActions } from '@renderer/store/newMessage'
import { setActiveAgentId, setActiveTopicOrSessionAction } from '@renderer/store/runtime'
import type { Assistant, Topic } from '@renderer/types'
import { MIN_WINDOW_HEIGHT, MIN_WINDOW_WIDTH, SECOND_MIN_WINDOW_WIDTH } from '@shared/config/constant'
import { AnimatePresence, motion } from 'motion/react'
import type { FC } from 'react'
import { startTransition, useCallback, useEffect, useMemo, useState } from 'react'
import { useDispatch } from 'react-redux'
import { useLocation, useNavigate } from 'react-router-dom'
import styled from 'styled-components'

import Chat from './Chat'
import Navbar from './Navbar'
import HomeTabs from './Tabs'

let _activeAssistant: Assistant
const buildConversationTabId = (assistantId: string, topicId: string) => `${assistantId}:${topicId}`
const buildWorkspaceName = (index: number) => `Workspace ${index}`
const createWorkspaceId = () => `workspace-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`

interface ConversationTabRef {
  assistantId: string
  topicId: string
}

interface ConversationTabItem extends ConversationTabRef {
  id: string
  assistantName: string
  topicName: string
}

interface ConversationWorkspace {
  id: string
  name: string
  tabs: ConversationTabRef[]
  active?: ConversationTabRef
}

interface ConversationWorkspaceItem {
  id: string
  name: string
  tabCount: number
}

interface StoredConversationWorkspacesState {
  workspaces: ConversationWorkspace[]
  activeWorkspaceId?: string
}

const CONVERSATION_WORKSPACES_STORAGE_KEY = 'home:conversation-tabs:v2'
const LEGACY_CONVERSATION_TABS_STORAGE_KEY = 'home:conversation-tabs:v1'

const isConversationTabRef = (value: unknown): value is ConversationTabRef => {
  if (!value || typeof value !== 'object') {
    return false
  }

  const tab = value as Partial<ConversationTabRef>
  return typeof tab.assistantId === 'string' && typeof tab.topicId === 'string'
}

const normalizeConversationTabs = (tabs: ConversationTabRef[]) => {
  const dedupedTabs = new Map<string, ConversationTabRef>()
  tabs.forEach((tab) => {
    if (!tab.assistantId || !tab.topicId) {
      return
    }
    dedupedTabs.set(buildConversationTabId(tab.assistantId, tab.topicId), tab)
  })
  return [...dedupedTabs.values()]
}

const parseConversationWorkspace = (value: unknown): ConversationWorkspace | null => {
  if (!value || typeof value !== 'object') {
    return null
  }

  const workspace = value as {
    id?: unknown
    name?: unknown
    tabs?: unknown
    active?: unknown
  }

  if (typeof workspace.id !== 'string' || !workspace.id) {
    return null
  }

  const tabs = normalizeConversationTabs(
    Array.isArray(workspace.tabs) ? workspace.tabs.filter(isConversationTabRef) : []
  )
  const active = isConversationTabRef(workspace.active) ? workspace.active : undefined
  const name = typeof workspace.name === 'string' ? workspace.name : ''

  return {
    id: workspace.id,
    name,
    tabs,
    active
  }
}

const normalizeConversationWorkspaces = (workspaces: ConversationWorkspace[]) => {
  const dedupedWorkspaces = new Map<string, ConversationWorkspace>()

  workspaces.forEach((workspace, index) => {
    if (!workspace?.id) {
      return
    }

    const tabs = normalizeConversationTabs(workspace.tabs ?? [])
    const fallbackName = buildWorkspaceName(index + 1)
    const name = workspace.name?.trim() || fallbackName
    const active =
      workspace.active &&
      tabs.some((tab) => tab.assistantId === workspace.active?.assistantId && tab.topicId === workspace.active?.topicId)
        ? workspace.active
        : tabs[0]

    dedupedWorkspaces.set(workspace.id, {
      id: workspace.id,
      name,
      tabs,
      active
    })
  })

  return [...dedupedWorkspaces.values()]
}

const readStoredConversationWorkspacesState = (): StoredConversationWorkspacesState | null => {
  if (typeof window === 'undefined') {
    return null
  }

  try {
    const raw = window.localStorage.getItem(CONVERSATION_WORKSPACES_STORAGE_KEY)
    if (raw) {
      const parsed = JSON.parse(raw) as {
        workspaces?: unknown[]
        activeWorkspaceId?: unknown
      }

      const parsedWorkspaces = Array.isArray(parsed.workspaces)
        ? parsed.workspaces
            .map((workspace) => parseConversationWorkspace(workspace))
            .filter((workspace): workspace is ConversationWorkspace => workspace !== null)
        : []

      const workspaces = normalizeConversationWorkspaces(parsedWorkspaces)
      if (workspaces.length > 0) {
        const activeWorkspaceId =
          typeof parsed.activeWorkspaceId === 'string' &&
          workspaces.some((workspace) => workspace.id === parsed.activeWorkspaceId)
            ? parsed.activeWorkspaceId
            : workspaces[0].id

        return {
          workspaces,
          activeWorkspaceId
        }
      }
    }

    const legacyRaw = window.localStorage.getItem(LEGACY_CONVERSATION_TABS_STORAGE_KEY)
    if (!legacyRaw) {
      return null
    }

    const legacyParsed = JSON.parse(legacyRaw) as {
      tabs?: unknown[]
      active?: unknown
    }

    const tabs = normalizeConversationTabs(
      Array.isArray(legacyParsed.tabs) ? legacyParsed.tabs.filter(isConversationTabRef) : []
    )
    if (tabs.length === 0) {
      return null
    }

    const active = isConversationTabRef(legacyParsed.active) ? legacyParsed.active : tabs[0]
    const legacyWorkspaceId = 'workspace-legacy-default'

    return {
      workspaces: [
        {
          id: legacyWorkspaceId,
          name: buildWorkspaceName(1),
          tabs,
          active
        }
      ],
      activeWorkspaceId: legacyWorkspaceId
    }
  } catch {
    return null
  }
}

const writeStoredConversationWorkspacesState = (state: StoredConversationWorkspacesState) => {
  if (typeof window === 'undefined') {
    return
  }

  const workspaces = normalizeConversationWorkspaces(state.workspaces)
  if (workspaces.length === 0) {
    window.localStorage.removeItem(CONVERSATION_WORKSPACES_STORAGE_KEY)
    return
  }

  const activeWorkspaceId = workspaces.some((workspace) => workspace.id === state.activeWorkspaceId)
    ? state.activeWorkspaceId
    : workspaces[0].id

  window.localStorage.setItem(
    CONVERSATION_WORKSPACES_STORAGE_KEY,
    JSON.stringify({
      workspaces,
      activeWorkspaceId
    })
  )
}

const HomePage: FC = () => {
  const { assistants } = useAssistants()
  const navigate = useNavigate()
  const { isLeftNavbar } = useNavbarPosition()

  // Initialize agent session hook
  useAgentSessionInitializer()

  const location = useLocation()
  const state = location.state

  const storedWorkspaceState = useMemo(() => readStoredConversationWorkspacesState(), [])
  const storedActiveConversation = useMemo(() => {
    if (!storedWorkspaceState?.workspaces?.length) {
      return undefined
    }

    const activeWorkspace =
      storedWorkspaceState.workspaces.find((workspace) => workspace.id === storedWorkspaceState.activeWorkspaceId) ??
      storedWorkspaceState.workspaces[0]

    return activeWorkspace?.active ?? activeWorkspace?.tabs[0]
  }, [storedWorkspaceState])

  const storedActiveAssistant = storedActiveConversation
    ? assistants.find((assistant) => assistant.id === storedActiveConversation.assistantId)
    : undefined

  const initialAssistant = state?.assistant || _activeAssistant || storedActiveAssistant || assistants[0]
  const initialTopic =
    state?.topic ||
    (storedActiveConversation && initialAssistant?.id === storedActiveConversation.assistantId
      ? initialAssistant?.topics?.find((topic) => topic.id === storedActiveConversation.topicId)
      : undefined) ||
    initialAssistant?.topics?.[0]

  const initialWorkspaceSeed = useMemo(() => {
    const storedWorkspaces = storedWorkspaceState?.workspaces ?? []
    if (storedWorkspaces.length > 0) {
      const activeWorkspaceId =
        storedWorkspaceState?.activeWorkspaceId &&
        storedWorkspaces.some((workspace) => workspace.id === storedWorkspaceState.activeWorkspaceId)
          ? storedWorkspaceState.activeWorkspaceId
          : storedWorkspaces[0].id

      return {
        workspaces: storedWorkspaces,
        activeWorkspaceId
      }
    }

    const workspaceId = createWorkspaceId()
    const initialTab =
      initialAssistant?.id && initialTopic?.id
        ? [
            {
              assistantId: initialAssistant.id,
              topicId: initialTopic.id
            }
          ]
        : []

    return {
      workspaces: [
        {
          id: workspaceId,
          name: buildWorkspaceName(1),
          tabs: initialTab,
          active: initialTab[0]
        }
      ],
      activeWorkspaceId: workspaceId
    }
  }, [initialAssistant?.id, initialTopic?.id, storedWorkspaceState])

  const [activeAssistant, _setActiveAssistant] = useState<Assistant>(initialAssistant)
  const { activeTopic, setActiveTopic: _setActiveTopic } = useActiveTopic(activeAssistant?.id ?? '', initialTopic)
  const [conversationWorkspaces, setConversationWorkspaces] = useState<ConversationWorkspace[]>(
    initialWorkspaceSeed.workspaces
  )
  const [activeWorkspaceId, setActiveWorkspaceId] = useState<string>(initialWorkspaceSeed.activeWorkspaceId)

  const { showAssistants, showTopics, topicPosition } = useSettings()
  const dispatch = useDispatch()
  const { chat } = useRuntime()
  const { activeTopicOrSession } = chat

  const activeWorkspace = useMemo(
    () => conversationWorkspaces.find((workspace) => workspace.id === activeWorkspaceId) ?? conversationWorkspaces[0],
    [activeWorkspaceId, conversationWorkspaces]
  )

  _activeAssistant = activeAssistant

  const findConversationByTab = useCallback(
    (tab: ConversationTabRef | undefined) => {
      if (!tab) {
        return undefined
      }

      const assistant = assistants.find((item) => item.id === tab.assistantId)
      const topic = assistant?.topics?.find((item) => item.id === tab.topicId)
      if (!assistant || !topic) {
        return undefined
      }

      return { assistant, topic }
    },
    [assistants]
  )

  const setWorkspaceActiveConversation = useCallback((workspaceId: string, tab: ConversationTabRef) => {
    if (!workspaceId || !tab.assistantId || !tab.topicId) {
      return
    }

    setConversationWorkspaces((prev) => {
      let workspaceFound = false
      let changed = false

      const nextWorkspaces = prev.map((workspace) => {
        if (workspace.id !== workspaceId) {
          return workspace
        }

        workspaceFound = true
        const hasTab = workspace.tabs.some(
          (workspaceTab) => workspaceTab.assistantId === tab.assistantId && workspaceTab.topicId === tab.topicId
        )
        const isSameActive =
          workspace.active?.assistantId === tab.assistantId && workspace.active?.topicId === tab.topicId

        if (hasTab && isSameActive) {
          return workspace
        }

        changed = true
        return {
          ...workspace,
          tabs: hasTab ? workspace.tabs : [...workspace.tabs, tab],
          active: tab
        }
      })

      if (!workspaceFound) {
        changed = true
        nextWorkspaces.push({
          id: workspaceId,
          name: buildWorkspaceName(prev.length + 1),
          tabs: [tab],
          active: tab
        })
      }

      return changed ? normalizeConversationWorkspaces(nextWorkspaces) : prev
    })
  }, [])

  const activateConversation = useCallback(
    (targetAssistant: Assistant, targetTopic: Topic, workspaceIdOverride?: string) => {
      if (!targetAssistant?.id || !targetTopic?.id) {
        return
      }

      const workspaceId = workspaceIdOverride || activeWorkspace?.id || activeWorkspaceId
      if (!workspaceId) {
        return
      }

      startTransition(() => {
        if (workspaceId !== activeWorkspaceId) {
          setActiveWorkspaceId(workspaceId)
        }

        if (targetAssistant.id !== activeAssistant?.id) {
          _setActiveAssistant(targetAssistant)
          if (targetAssistant.id !== 'fake') {
            dispatch(setActiveAgentId(null))
          }
        }

        setWorkspaceActiveConversation(workspaceId, {
          assistantId: targetAssistant.id,
          topicId: targetTopic.id
        })
        _setActiveTopic((prev) => (targetTopic.id === prev.id ? prev : targetTopic))
        dispatch(newMessagesActions.setTopicFulfilled({ topicId: targetTopic.id, fulfilled: false }))
        dispatch(setActiveTopicOrSessionAction('topic'))
      })
    },
    [
      activeAssistant?.id,
      activeWorkspace?.id,
      activeWorkspaceId,
      dispatch,
      setWorkspaceActiveConversation,
      _setActiveTopic
    ]
  )

  const setActiveAssistant = useCallback(
    // TODO: allow to set it as null.
    (newAssistant: Assistant) => {
      if (newAssistant.id === activeAssistant?.id) return

      const firstTopic = newAssistant.topics[0]
      if (!firstTopic) {
        startTransition(() => {
          _setActiveAssistant(newAssistant)
          if (newAssistant.id !== 'fake') {
            dispatch(setActiveAgentId(null))
          }
        })
        return
      }

      activateConversation(newAssistant, firstTopic, activeWorkspace?.id)
    },
    [activeAssistant?.id, activateConversation, activeWorkspace?.id, dispatch]
  )

  const setActiveTopic = useCallback(
    (newTopic: Topic) => {
      if (!activeAssistant) {
        return
      }
      activateConversation(activeAssistant, newTopic, activeWorkspace?.id)
    },
    [activeAssistant, activateConversation, activeWorkspace?.id]
  )

  const conversationTabs = useMemo<ConversationTabItem[]>(() => {
    const workspaceTabs = activeWorkspace?.tabs ?? []

    return workspaceTabs.flatMap((tab) => {
      const assistant = assistants.find((item) => item.id === tab.assistantId)
      const topic = assistant?.topics?.find((item) => item.id === tab.topicId)

      if (!assistant || !topic) {
        return []
      }

      return [
        {
          id: buildConversationTabId(assistant.id, topic.id),
          assistantId: assistant.id,
          topicId: topic.id,
          assistantName: assistant.name,
          topicName: topic.name || topic.id
        }
      ]
    })
  }, [activeWorkspace?.tabs, assistants])

  const workspaceItems = useMemo<ConversationWorkspaceItem[]>(
    () =>
      conversationWorkspaces.map((workspace) => ({
        id: workspace.id,
        name: workspace.name,
        tabCount: workspace.tabs.length
      })),
    [conversationWorkspaces]
  )

  const activeConversationTabId = useMemo(() => {
    if (activeWorkspace?.active) {
      return buildConversationTabId(activeWorkspace.active.assistantId, activeWorkspace.active.topicId)
    }
    if (!activeAssistant?.id || !activeTopic?.id) {
      return ''
    }
    return buildConversationTabId(activeAssistant.id, activeTopic.id)
  }, [activeAssistant?.id, activeTopic?.id, activeWorkspace?.active])

  const switchConversationTab = useCallback(
    (assistantId: string, topicId: string) => {
      const targetAssistant = assistants.find((assistant) => assistant.id === assistantId)
      const targetTopic = targetAssistant?.topics?.find((topic) => topic.id === topicId)

      if (!targetAssistant || !targetTopic) {
        return
      }

      activateConversation(targetAssistant, targetTopic, activeWorkspace?.id)
    },
    [activateConversation, activeWorkspace?.id, assistants]
  )

  const closeConversationTab = useCallback(
    (assistantId: string, topicId: string) => {
      if (!activeWorkspace?.id || conversationTabs.length <= 1) {
        return
      }

      const closingTabId = buildConversationTabId(assistantId, topicId)
      const closingIndex = conversationTabs.findIndex((tab) => tab.id === closingTabId)
      if (closingIndex === -1) {
        return
      }

      const fallbackIndex = closingIndex === 0 ? 0 : closingIndex - 1
      const fallbackTab = conversationTabs.filter((tab) => tab.id !== closingTabId)[fallbackIndex]

      setConversationWorkspaces((prev) =>
        normalizeConversationWorkspaces(
          prev.map((workspace) => {
            if (workspace.id !== activeWorkspace.id) {
              return workspace
            }

            const nextTabs = workspace.tabs.filter(
              (tab) => !(tab.assistantId === assistantId && tab.topicId === topicId)
            )
            const isClosingActive =
              workspace.active?.assistantId === assistantId && workspace.active?.topicId === topicId

            return {
              ...workspace,
              tabs: nextTabs,
              active: isClosingActive
                ? fallbackTab
                  ? { assistantId: fallbackTab.assistantId, topicId: fallbackTab.topicId }
                  : nextTabs[0]
                : workspace.active
            }
          })
        )
      )

      if (closingTabId !== activeConversationTabId) {
        return
      }

      if (fallbackTab) {
        switchConversationTab(fallbackTab.assistantId, fallbackTab.topicId)
      }
    },
    [activeConversationTabId, activeWorkspace, conversationTabs, switchConversationTab]
  )

  const switchWorkspace = useCallback(
    (workspaceId: string) => {
      const targetWorkspace = conversationWorkspaces.find((workspace) => workspace.id === workspaceId)
      if (!targetWorkspace) {
        return
      }

      setActiveWorkspaceId(workspaceId)

      const targetTab = targetWorkspace.active ?? targetWorkspace.tabs[0]
      const targetConversation = findConversationByTab(targetTab)
      if (targetConversation) {
        activateConversation(targetConversation.assistant, targetConversation.topic, workspaceId)
        return
      }

      const fallbackAssistant = activeAssistant ?? assistants[0]
      const fallbackTopic =
        fallbackAssistant?.id === activeAssistant?.id
          ? (activeTopic ?? fallbackAssistant?.topics?.[0])
          : fallbackAssistant?.topics?.[0]
      if (fallbackAssistant && fallbackTopic) {
        activateConversation(fallbackAssistant, fallbackTopic, workspaceId)
      }
    },
    [activeAssistant, activeTopic, activateConversation, assistants, conversationWorkspaces, findConversationByTab]
  )

  const createWorkspace = useCallback(() => {
    const workspaceId = createWorkspaceId()
    const workspaceName = buildWorkspaceName(conversationWorkspaces.length + 1)

    const seedAssistant = activeAssistant ?? assistants[0]
    const seedTopic =
      seedAssistant?.id === activeAssistant?.id
        ? (activeTopic ?? seedAssistant?.topics?.[0])
        : seedAssistant?.topics?.[0]
    const seedTab =
      seedAssistant?.id && seedTopic?.id
        ? {
            assistantId: seedAssistant.id,
            topicId: seedTopic.id
          }
        : undefined

    setConversationWorkspaces((prev) =>
      normalizeConversationWorkspaces([
        ...prev,
        {
          id: workspaceId,
          name: workspaceName,
          tabs: seedTab ? [seedTab] : [],
          active: seedTab
        }
      ])
    )
    setActiveWorkspaceId(workspaceId)

    if (seedAssistant && seedTopic) {
      activateConversation(seedAssistant, seedTopic, workspaceId)
    }
  }, [activeAssistant, activeTopic, activateConversation, assistants, conversationWorkspaces.length])

  const renameWorkspace = useCallback((workspaceId: string, workspaceName: string) => {
    const trimmedName = workspaceName.trim()
    if (!trimmedName) {
      return
    }

    setConversationWorkspaces((prev) =>
      prev.map((workspace) => (workspace.id === workspaceId ? { ...workspace, name: trimmedName } : workspace))
    )
  }, [])

  const deleteWorkspace = useCallback(
    (workspaceId: string) => {
      if (conversationWorkspaces.length <= 1) {
        return
      }

      const removingIndex = conversationWorkspaces.findIndex((workspace) => workspace.id === workspaceId)
      if (removingIndex === -1) {
        return
      }

      const remainingWorkspaces = conversationWorkspaces.filter((workspace) => workspace.id !== workspaceId)
      setConversationWorkspaces(normalizeConversationWorkspaces(remainingWorkspaces))

      if (workspaceId !== activeWorkspaceId) {
        return
      }

      const fallbackWorkspace =
        remainingWorkspaces[removingIndex === 0 ? 0 : removingIndex - 1] ?? remainingWorkspaces[0]
      if (!fallbackWorkspace) {
        return
      }

      setActiveWorkspaceId(fallbackWorkspace.id)

      const targetTab = fallbackWorkspace.active ?? fallbackWorkspace.tabs[0]
      const targetConversation = findConversationByTab(targetTab)
      if (targetConversation) {
        activateConversation(targetConversation.assistant, targetConversation.topic, fallbackWorkspace.id)
      }
    },
    [activeWorkspaceId, activateConversation, conversationWorkspaces, findConversationByTab]
  )

  useEffect(() => {
    setConversationWorkspaces((prev) =>
      normalizeConversationWorkspaces(
        prev.map((workspace) => {
          const tabs = workspace.tabs.filter((tab) => !!findConversationByTab(tab))
          const active =
            workspace.active &&
            tabs.some(
              (tab) => tab.assistantId === workspace.active?.assistantId && tab.topicId === workspace.active?.topicId
            )
              ? workspace.active
              : tabs[0]

          return {
            ...workspace,
            tabs,
            active
          }
        })
      )
    )
  }, [assistants, findConversationByTab])

  useEffect(() => {
    if (conversationWorkspaces.length === 0) {
      return
    }

    if (!conversationWorkspaces.some((workspace) => workspace.id === activeWorkspaceId)) {
      setActiveWorkspaceId(conversationWorkspaces[0].id)
    }
  }, [activeWorkspaceId, conversationWorkspaces])

  useEffect(() => {
    if (!activeWorkspace?.id) {
      return
    }

    const targetTab = activeWorkspace.active ?? activeWorkspace.tabs[0]
    if (!targetTab) {
      return
    }

    if (targetTab.assistantId === activeAssistant?.id && targetTab.topicId === activeTopic?.id) {
      return
    }

    const targetConversation = findConversationByTab(targetTab)
    if (targetConversation) {
      activateConversation(targetConversation.assistant, targetConversation.topic, activeWorkspace.id)
    }
  }, [activeAssistant?.id, activeTopic?.id, activeWorkspace, activateConversation, findConversationByTab])

  useEffect(() => {
    writeStoredConversationWorkspacesState({
      workspaces: conversationWorkspaces,
      activeWorkspaceId
    })
  }, [activeWorkspaceId, conversationWorkspaces])

  useEffect(() => {
    NavigationService.setNavigate(navigate)
  }, [navigate])

  useEffect(() => {
    if (state?.assistant && state?.topic) {
      activateConversation(state.assistant, state.topic, activeWorkspace?.id)
      return
    }

    state?.assistant && setActiveAssistant(state.assistant)
    state?.topic && setActiveTopic(state.topic)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state])

  useEffect(() => {
    const canMinimize = topicPosition == 'left' ? !showAssistants : !showAssistants && !showTopics
    window.api.window.setMinimumSize(canMinimize ? SECOND_MIN_WINDOW_WIDTH : MIN_WINDOW_WIDTH, MIN_WINDOW_HEIGHT)

    return () => {
      window.api.window.resetMinimumSize()
    }
  }, [showAssistants, showTopics, topicPosition])

  return (
    <Container id="home-page">
      {isLeftNavbar && (
        <Navbar
          activeAssistant={activeAssistant}
          activeTopic={activeTopic}
          setActiveTopic={setActiveTopic}
          setActiveAssistant={setActiveAssistant}
          position="left"
          activeTopicOrSession={activeTopicOrSession}
        />
      )}
      <ContentContainer id={isLeftNavbar ? 'content-container' : undefined}>
        <AnimatePresence initial={false}>
          {showAssistants && (
            <ErrorBoundary>
              <motion.div
                initial={{ width: 0, opacity: 0 }}
                animate={{ width: 'var(--assistants-width)', opacity: 1 }}
                exit={{ width: 0, opacity: 0 }}
                transition={{ duration: 0.3, ease: 'easeInOut' }}
                style={{ overflow: 'hidden' }}>
                <HomeTabs
                  activeAssistant={activeAssistant}
                  activeTopic={activeTopic}
                  setActiveAssistant={setActiveAssistant}
                  setActiveTopic={setActiveTopic}
                  position="left"
                />
              </motion.div>
            </ErrorBoundary>
          )}
        </AnimatePresence>
        <ErrorBoundary>
          <Chat
            assistant={activeAssistant}
            activeTopic={activeTopic}
            setActiveTopic={setActiveTopic}
            setActiveAssistant={setActiveAssistant}
            conversationTabs={conversationTabs}
            activeConversationTabId={activeConversationTabId}
            workspaces={workspaceItems}
            activeWorkspaceId={activeWorkspace?.id ?? ''}
            onWorkspaceSelect={switchWorkspace}
            onWorkspaceCreate={createWorkspace}
            onWorkspaceRename={renameWorkspace}
            onWorkspaceDelete={deleteWorkspace}
            onConversationTabSelect={switchConversationTab}
            onConversationTabClose={closeConversationTab}
          />
        </ErrorBoundary>
      </ContentContainer>
    </Container>
  )
}

const Container = styled.div`
  display: flex;
  flex: 1;
  flex-direction: column;
  [navbar-position='left'] & {
    max-width: calc(100vw - var(--sidebar-width));
  }
  [navbar-position='top'] & {
    max-width: 100vw;
  }
`

const ContentContainer = styled.div`
  display: flex;
  flex: 1;
  flex-direction: row;
  overflow: hidden;

  [navbar-position='top'] & {
    max-width: calc(100vw - 12px);
  }
`

export default HomePage
