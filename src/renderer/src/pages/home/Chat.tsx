import { CloseOutlined, DeleteOutlined, EditOutlined, PlusOutlined } from '@ant-design/icons'
import { loggerService } from '@logger'
import type { ContentSearchRef } from '@renderer/components/ContentSearch'
import { ContentSearch } from '@renderer/components/ContentSearch'
import { HStack } from '@renderer/components/Layout'
import MultiSelectActionPopup from '@renderer/components/Popups/MultiSelectionPopup'
import PromptPopup from '@renderer/components/Popups/PromptPopup'
import { QuickPanelProvider } from '@renderer/components/QuickPanel'
import { useCreateDefaultSession } from '@renderer/hooks/agents/useCreateDefaultSession'
import { useAssistant, useAssistants } from '@renderer/hooks/useAssistant'
import { useChatContext } from '@renderer/hooks/useChatContext'
import { useRuntime } from '@renderer/hooks/useRuntime'
import { useNavbarPosition, useSettings } from '@renderer/hooks/useSettings'
import { useShortcut } from '@renderer/hooks/useShortcuts'
import { useShowTopics } from '@renderer/hooks/useStore'
import { useTimer } from '@renderer/hooks/useTimer'
import { EVENT_NAMES, EventEmitter } from '@renderer/services/EventService'
import type { Assistant, Topic } from '@renderer/types'
import { classNames } from '@renderer/utils'
import { buildAgentSessionTopicId } from '@renderer/utils/agentSession'
import { Alert, Dropdown, Flex } from 'antd'
import { debounce, throttle } from 'lodash'
import { AnimatePresence, motion } from 'motion/react'
import type { FC } from 'react'
import React, { useCallback, useEffect, useMemo, useState } from 'react'
import { useHotkeys } from 'react-hotkeys-hook'
import { useTranslation } from 'react-i18next'
import styled from 'styled-components'

import ChatNavbar from './components/ChatNavBar'
import AgentSessionInputbar from './Inputbar/AgentSessionInputbar'
import { PinnedTodoPanel } from './Inputbar/components/PinnedTodoPanel'
import Inputbar from './Inputbar/Inputbar'
import AgentSessionMessages from './Messages/AgentSessionMessages'
import ChatNavigation from './Messages/ChatNavigation'
import Messages from './Messages/Messages'
import Tabs from './Tabs'
import { useNavigatorContextMenus } from './Tabs/components/useNavigatorContextMenus'

const logger = loggerService.withContext('Chat')
const CONVERSATION_TABS_HEIGHT = 54
const CONVERSATION_TABS_SCROLL_KEY = 'home:conversation-tabs:scroll-left:v1'
const CONVERSATION_TABS_SWITCH_THROTTLE_MS = 180

interface Props {
  assistant: Assistant
  activeTopic: Topic
  setActiveTopic: (topic: Topic) => void
  setActiveAssistant: (assistant: Assistant) => void
  activateConversation: (assistant: Assistant, topic: Topic) => void
  conversationTabs: ConversationTabItem[]
  activeConversationTabId: string
  workspaces: ConversationWorkspaceItem[]
  activeWorkspaceId: string
  onWorkspaceSelect: (workspaceId: string) => void
  onWorkspaceCreate: () => void
  onWorkspaceRename: (workspaceId: string, workspaceName: string) => void
  onWorkspaceDelete: (workspaceId: string) => void
  onConversationTabSelect: (assistantId: string, topicId: string) => void
  onConversationTabClose: (assistantId: string, topicId: string) => void
}

interface ConversationTabItem {
  id: string
  assistantId: string
  topicId: string
  assistantName: string
  topicName: string
}

interface ConversationWorkspaceItem {
  id: string
  name: string
  tabCount: number
}

const Chat: FC<Props> = (props) => {
  const { conversationTabs, activeConversationTabId, onConversationTabSelect } = props
  const { assistant, updateTopic } = useAssistant(props.assistant.id)
  const { assistants } = useAssistants()
  const { t } = useTranslation()
  const { topicPosition, messageStyle, messageNavigation } = useSettings()
  const { showTopics } = useShowTopics()
  const { isMultiSelectMode } = useChatContext(props.activeTopic)
  const { isTopNavbar } = useNavbarPosition()
  const { chat } = useRuntime()
  const { activeTopicOrSession, activeAgentId, activeSessionIdMap } = chat
  const activeSessionId = activeAgentId ? activeSessionIdMap[activeAgentId] : null
  const { apiServer } = useSettings()
  const sessionAgentId = activeTopicOrSession === 'session' ? activeAgentId : null
  const { createDefaultSession } = useCreateDefaultSession(sessionAgentId)

  const mainRef = React.useRef<HTMLDivElement>(null)
  const contentSearchRef = React.useRef<ContentSearchRef>(null)
  const conversationTabsRef = React.useRef<HTMLDivElement>(null)
  const [filterIncludeUser, setFilterIncludeUser] = useState(false)

  const { setTimeoutTimer } = useTimer()

  useHotkeys('esc', () => {
    contentSearchRef.current?.disable()
  })

  useShortcut('search_message_in_chat', () => {
    try {
      const selectedText = window.getSelection()?.toString().trim()
      contentSearchRef.current?.enable(selectedText)
    } catch (error) {
      logger.error('Error enabling content search:', error as Error)
    }
  })

  useShortcut('rename_topic', async () => {
    const topic = props.activeTopic
    if (!topic) return

    EventEmitter.emit(EVENT_NAMES.SHOW_TOPIC_SIDEBAR)

    const name = await PromptPopup.show({
      title: t('chat.topics.edit.title'),
      message: '',
      defaultValue: topic.name || '',
      extraNode: <div style={{ color: 'var(--color-text-3)', marginTop: 8 }}>{t('chat.topics.edit.title_tip')}</div>
    })
    if (name && topic.name !== name) {
      const updatedTopic = { ...topic, name, isNameManuallyEdited: true }
      updateTopic(updatedTopic as Topic)
    }
  })

  useShortcut(
    'new_topic',
    () => {
      if (activeTopicOrSession !== 'session' || !activeAgentId) {
        return
      }
      void createDefaultSession()
    },
    {
      enabled: activeTopicOrSession === 'session',
      preventDefault: true,
      enableOnFormTags: true
    }
  )

  const contentSearchFilter: NodeFilter = {
    acceptNode(node) {
      const container = node.parentElement?.closest('.message-content-container')
      if (!container) return NodeFilter.FILTER_REJECT

      const message = container.closest('.message')
      if (!message) return NodeFilter.FILTER_REJECT

      if (filterIncludeUser) {
        return NodeFilter.FILTER_ACCEPT
      }
      if (message.classList.contains('message-assistant')) {
        return NodeFilter.FILTER_ACCEPT
      }
      return NodeFilter.FILTER_REJECT
    }
  }

  const userOutlinedItemClickHandler = () => {
    setFilterIncludeUser(!filterIncludeUser)
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        setTimeoutTimer(
          'userOutlinedItemClickHandler',
          () => {
            contentSearchRef.current?.search()
            contentSearchRef.current?.focus()
          },
          0
        )
      })
    })
  }

  let firstUpdateCompleted = false
  const firstUpdateOrNoFirstUpdateHandler = debounce(() => {
    contentSearchRef.current?.silentSearch()
  }, 10)

  const messagesComponentUpdateHandler = () => {
    if (firstUpdateCompleted) {
      firstUpdateOrNoFirstUpdateHandler()
    }
  }

  const messagesComponentFirstUpdateHandler = () => {
    setTimeoutTimer('messagesComponentFirstUpdateHandler', () => (firstUpdateCompleted = true), 300)
    firstUpdateOrNoFirstUpdateHandler()
  }

  const mainHeight = isTopNavbar ? 'calc(100vh - var(--navbar-height) - 6px)' : 'calc(100vh - var(--navbar-height))'
  const showWorkspaceSwitcher = activeTopicOrSession === 'topic' && props.workspaces.length > 0
  const showConversationTabs = activeTopicOrSession === 'topic' && conversationTabs.length > 0
  const activeWorkspace = useMemo(
    () => props.workspaces.find((workspace) => workspace.id === props.activeWorkspaceId),
    [props.activeWorkspaceId, props.workspaces]
  )
  const handleContextMenuSelect = useCallback(
    (nextAssistant: Assistant, nextTopic: Topic) => {
      onConversationTabSelect(nextAssistant.id, nextTopic.id)
    },
    [onConversationTabSelect]
  )
  const { getAssistantContextMenuItems, getTopicContextMenuItems } = useNavigatorContextMenus({
    activeAssistant: props.assistant,
    activeTopic: props.activeTopic,
    onSelect: handleContextMenuSelect
  })

  const persistConversationTabsScroll = useMemo(
    () =>
      throttle((scrollLeft: number) => {
        window.localStorage.setItem(CONVERSATION_TABS_SCROLL_KEY, String(scrollLeft))
      }, 120),
    []
  )

  const restoreConversationTabsScroll = useCallback(() => {
    const rawScrollLeft = window.localStorage.getItem(CONVERSATION_TABS_SCROLL_KEY)
    if (!rawScrollLeft || !conversationTabsRef.current) {
      return
    }

    const scrollLeft = Number(rawScrollLeft)
    if (!Number.isFinite(scrollLeft) || scrollLeft < 0) {
      return
    }

    conversationTabsRef.current.scrollTo({ left: scrollLeft })
  }, [])

  const handleConversationTabsScroll = useCallback(
    (event: React.UIEvent<HTMLDivElement>) => {
      persistConversationTabsScroll(event.currentTarget.scrollLeft)
    },
    [persistConversationTabsScroll]
  )

  const switchConversationTabByOffset = useCallback(
    (offset: number) => {
      if (conversationTabs.length <= 1) {
        return
      }

      const currentIndex = conversationTabs.findIndex((tab) => tab.id === activeConversationTabId)
      if (currentIndex === -1) {
        return
      }

      const normalizedOffset = offset >= 0 ? Math.ceil(offset) : Math.floor(offset)
      if (normalizedOffset === 0) {
        return
      }

      const nextIndex = (currentIndex + normalizedOffset + conversationTabs.length) % conversationTabs.length
      const nextTab = conversationTabs[nextIndex]
      if (!nextTab) {
        return
      }

      onConversationTabSelect(nextTab.assistantId, nextTab.topicId)
    },
    [activeConversationTabId, conversationTabs, onConversationTabSelect]
  )

  const throttledWheelTabSwitch = useMemo(
    () =>
      throttle(
        (delta: number) => {
          switchConversationTabByOffset(delta > 0 ? 1 : -1)
        },
        CONVERSATION_TABS_SWITCH_THROTTLE_MS,
        { leading: true, trailing: false }
      ),
    [switchConversationTabByOffset]
  )

  useEffect(() => {
    return () => {
      throttledWheelTabSwitch.cancel()
    }
  }, [throttledWheelTabSwitch])

  const handleConversationTabsWheel = useCallback(
    (event: React.WheelEvent<HTMLDivElement>) => {
      if (conversationTabs.length <= 1) {
        return
      }

      const dominantDelta = Math.abs(event.deltaY) >= Math.abs(event.deltaX) ? event.deltaY : event.deltaX
      if (Math.abs(dominantDelta) < 3) {
        return
      }

      event.preventDefault()
      throttledWheelTabSwitch(dominantDelta)
    },
    [conversationTabs.length, throttledWheelTabSwitch]
  )

  useEffect(() => {
    return () => {
      persistConversationTabsScroll.flush()
      persistConversationTabsScroll.cancel()
    }
  }, [persistConversationTabsScroll])

  useEffect(() => {
    if (!showConversationTabs) {
      return
    }

    requestAnimationFrame(restoreConversationTabsScroll)
    setTimeoutTimer('chat:restoreConversationTabsScroll', restoreConversationTabsScroll, 80)
  }, [conversationTabs.length, restoreConversationTabsScroll, setTimeoutTimer, showConversationTabs])

  useHotkeys(
    'ctrl+tab',
    (event) => {
      event.preventDefault()
      switchConversationTabByOffset(1)
    },
    {
      enabled: showConversationTabs && conversationTabs.length > 1,
      preventDefault: true,
      enableOnFormTags: true
    }
  )

  useHotkeys(
    'ctrl+shift+tab',
    (event) => {
      event.preventDefault()
      switchConversationTabByOffset(-1)
    },
    {
      enabled: showConversationTabs && conversationTabs.length > 1,
      preventDefault: true,
      enableOnFormTags: true
    }
  )

  const handleRenameWorkspace = useCallback(async () => {
    if (!activeWorkspace) {
      return
    }

    const workspaceName = await PromptPopup.show({
      title: t('common.rename'),
      message: '',
      defaultValue: activeWorkspace.name
    })
    const nextWorkspaceName = workspaceName?.trim()
    if (!nextWorkspaceName || nextWorkspaceName === activeWorkspace.name) {
      return
    }

    props.onWorkspaceRename(activeWorkspace.id, nextWorkspaceName)
  }, [activeWorkspace, props, t])

  const handleDeleteWorkspace = useCallback(() => {
    if (!activeWorkspace || props.workspaces.length <= 1) {
      return
    }

    window.modal.confirm({
      title: t('common.delete'),
      content: activeWorkspace.name,
      centered: true,
      onOk: () => props.onWorkspaceDelete(activeWorkspace.id)
    })
  }, [activeWorkspace, props, t])

  // TODO: more info
  const AgentInvalid = useCallback(() => {
    return <Alert type="warning" message={t('chat.alerts.select_agent')} style={{ margin: '5px 16px' }} />
  }, [t])

  // TODO: more info
  const SessionInvalid = useCallback(() => {
    return (
      <div className="flex h-full w-full items-center justify-center">
        <Alert type="warning" message={t('chat.alerts.create_session')} style={{ margin: '5px 16px' }} />
      </div>
    )
  }, [t])

  return (
    <Container id="chat" className={classNames([messageStyle, { 'multi-select-mode': isMultiSelectMode }])}>
      <HStack>
        <motion.div
          layout
          transition={{ duration: 0.3, ease: 'easeInOut' }}
          style={{ flex: 1, display: 'flex', minWidth: 0, overflow: 'hidden' }}>
          <Main
            ref={mainRef}
            id="chat-main"
            vertical
            flex={1}
            justify="space-between"
            style={{ height: mainHeight, width: '100%' }}>
            <QuickPanelProvider>
              <MainContent>
                <ChatNavbar
                  activeAssistant={props.assistant}
                  activeTopic={props.activeTopic}
                  setActiveTopic={props.setActiveTopic}
                  setActiveAssistant={props.setActiveAssistant}
                  activateConversation={props.activateConversation}
                  position="left"
                />
                {showWorkspaceSwitcher && (
                  <WorkspaceSwitcherContainer>
                    <WorkspaceSelect
                      value={props.activeWorkspaceId}
                      onChange={(event) => props.onWorkspaceSelect(event.currentTarget.value)}
                      aria-label="Conversation workspace">
                      {props.workspaces.map((workspace) => (
                        <option key={workspace.id} value={workspace.id}>
                          {workspace.name} ({workspace.tabCount})
                        </option>
                      ))}
                    </WorkspaceSelect>
                    <WorkspaceActions>
                      <WorkspaceActionButton
                        type="button"
                        aria-label={t('common.add')}
                        title={t('common.add')}
                        onClick={props.onWorkspaceCreate}>
                        <PlusOutlined />
                      </WorkspaceActionButton>
                      <WorkspaceActionButton
                        type="button"
                        aria-label={t('common.rename')}
                        title={t('common.rename')}
                        onClick={handleRenameWorkspace}
                        disabled={!activeWorkspace}>
                        <EditOutlined />
                      </WorkspaceActionButton>
                      <WorkspaceActionButton
                        type="button"
                        aria-label={t('common.delete')}
                        title={t('common.delete')}
                        onClick={handleDeleteWorkspace}
                        disabled={!activeWorkspace || props.workspaces.length <= 1}>
                        <DeleteOutlined />
                      </WorkspaceActionButton>
                    </WorkspaceActions>
                  </WorkspaceSwitcherContainer>
                )}
                {showConversationTabs && (
                  <ConversationTabsContainer
                    ref={conversationTabsRef}
                    onScroll={handleConversationTabsScroll}
                    onWheel={handleConversationTabsWheel}>
                    {conversationTabs.map((tab) => {
                      const isActive = tab.id === activeConversationTabId
                      const tabAssistant = assistants.find((candidate) => candidate.id === tab.assistantId)
                      const tabTopic = tabAssistant?.topics.find((candidate) => candidate.id === tab.topicId)

                      return (
                        <ConversationTabButton
                          key={tab.id}
                          type="button"
                          $active={isActive}
                          onMouseDown={(event) => {
                            if (event.button !== 1 || conversationTabs.length <= 1) {
                              return
                            }
                            event.preventDefault()
                          }}
                          onAuxClick={(event) => {
                            if (event.button !== 1 || conversationTabs.length <= 1) {
                              return
                            }
                            event.preventDefault()
                            event.stopPropagation()
                            props.onConversationTabClose(tab.assistantId, tab.topicId)
                          }}
                          onClick={() => props.onConversationTabSelect(tab.assistantId, tab.topicId)}>
                          <ConversationTabText $active={isActive}>
                            {tabAssistant && tabTopic ? (
                              <Dropdown
                                menu={{ items: getTopicContextMenuItems(tabAssistant, tabTopic) }}
                                trigger={['contextMenu']}>
                                <ConversationTabTitle $active={isActive}>
                                  {tab.topicName || tab.topicId}
                                </ConversationTabTitle>
                              </Dropdown>
                            ) : (
                              <ConversationTabTitle $active={isActive}>
                                {tab.topicName || tab.topicId}
                              </ConversationTabTitle>
                            )}
                            {tabAssistant ? (
                              <Dropdown
                                menu={{ items: getAssistantContextMenuItems(tabAssistant) }}
                                trigger={['contextMenu']}>
                                <ConversationTabMeta $active={isActive}>{tab.assistantName}</ConversationTabMeta>
                              </Dropdown>
                            ) : (
                              <ConversationTabMeta $active={isActive}>{tab.assistantName}</ConversationTabMeta>
                            )}
                          </ConversationTabText>
                          {conversationTabs.length > 1 && (
                            <ConversationTabClose
                              type="button"
                              onClick={(event) => {
                                event.stopPropagation()
                                props.onConversationTabClose(tab.assistantId, tab.topicId)
                              }}
                              aria-label={t('chat.navigation.close')}>
                              <CloseOutlined />
                            </ConversationTabClose>
                          )}
                        </ConversationTabButton>
                      )
                    })}
                  </ConversationTabsContainer>
                )}
                <div className="flex min-h-0 flex-1 flex-col justify-between">
                  {activeTopicOrSession === 'topic' && (
                    <>
                      <Messages
                        key={props.activeTopic.id}
                        assistant={assistant}
                        topic={props.activeTopic}
                        setActiveTopic={props.setActiveTopic}
                        onComponentUpdate={messagesComponentUpdateHandler}
                        onFirstUpdate={messagesComponentFirstUpdateHandler}
                      />
                      <ContentSearch
                        ref={contentSearchRef}
                        searchTarget={mainRef as React.RefObject<HTMLElement>}
                        filter={contentSearchFilter}
                        includeUser={filterIncludeUser}
                        onIncludeUserChange={userOutlinedItemClickHandler}
                      />
                      {messageNavigation === 'buttons' && <ChatNavigation containerId="messages" />}
                      <Inputbar assistant={assistant} setActiveTopic={props.setActiveTopic} topic={props.activeTopic} />
                    </>
                  )}
                  {activeTopicOrSession === 'session' && !activeAgentId && <AgentInvalid />}
                  {activeTopicOrSession === 'session' && activeAgentId && !activeSessionId && <SessionInvalid />}
                  {activeTopicOrSession === 'session' && activeAgentId && activeSessionId && (
                    <>
                      {!apiServer.enabled ? (
                        <Alert
                          type="warning"
                          message={t('agent.warning.enable_server')}
                          style={{ margin: '5px 16px' }}
                        />
                      ) : (
                        <>
                          <AgentSessionMessages agentId={activeAgentId} sessionId={activeSessionId} />
                          <PinnedTodoPanelWrapper>
                            <PinnedTodoPanel topicId={buildAgentSessionTopicId(activeSessionId)} />
                          </PinnedTodoPanelWrapper>
                        </>
                      )}
                      {messageNavigation === 'buttons' && <ChatNavigation containerId="messages" />}
                      <AgentSessionInputbar agentId={activeAgentId} sessionId={activeSessionId} />
                    </>
                  )}
                  {isMultiSelectMode && <MultiSelectActionPopup topic={props.activeTopic} />}
                </div>
              </MainContent>
            </QuickPanelProvider>
          </Main>
        </motion.div>
        <AnimatePresence initial={false}>
          {topicPosition === 'right' && showTopics && (
            <motion.div
              key="right-tabs"
              initial={{ width: 0, opacity: 0 }}
              animate={{ width: 'var(--assistants-width)', opacity: 1 }}
              exit={{ width: 0, opacity: 0 }}
              transition={{ duration: 0.3, ease: 'easeInOut' }}
              style={{
                overflow: 'hidden'
              }}>
              <Tabs
                activeAssistant={assistant}
                activeTopic={props.activeTopic}
                setActiveAssistant={props.setActiveAssistant}
                setActiveTopic={props.setActiveTopic}
                activateConversation={props.activateConversation}
                position="right"
              />
            </motion.div>
          )}
        </AnimatePresence>
      </HStack>
    </Container>
  )
}

const Container = styled.div`
  display: flex;
  flex-direction: column;
  height: calc(100vh - var(--navbar-height));
  flex: 1;
  overflow: hidden;
  [navbar-position='top'] & {
    height: calc(100vh - var(--navbar-height) - 6px);
    background-color: var(--color-background);
    border-top-left-radius: 10px;
    border-bottom-left-radius: 10px;
  }
`

const Main = styled(Flex)`
  [navbar-position='left'] & {
    height: calc(100vh - var(--navbar-height));
  }
  transform: translateZ(0);
  position: relative;
`

const MainContent = styled.div`
  display: flex;
  flex-direction: column;
  min-height: 0;
  height: 100%;
`

const WorkspaceSwitcherContainer = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  padding: 7px 16px;
  border-bottom: 1px solid color-mix(in srgb, var(--color-border) 58%, transparent);
  background: transparent;
  min-height: 42px;
  max-height: 42px;
  position: relative;
  z-index: 2;
`

const WorkspaceSelect = styled.select`
  flex: 1;
  min-width: 0;
  max-width: 380px;
  height: 28px;
  border-radius: 8px;
  border: 1px solid color-mix(in srgb, var(--color-border) 60%, transparent);
  background: color-mix(in srgb, var(--color-background) 22%, transparent);
  color: var(--color-text);
  padding: 0 10px;
  font-size: 12px;
  outline: none;
  transition: border-color 0.15s ease;

  &:focus {
    border-color: color-mix(in srgb, var(--color-primary) 58%, transparent);
  }
`

const WorkspaceActions = styled.div`
  display: inline-flex;
  align-items: center;
  gap: 6px;
`

const WorkspaceActionButton = styled.button`
  width: 28px;
  height: 28px;
  border-radius: 8px;
  border: 1px solid color-mix(in srgb, var(--color-border) 56%, transparent);
  background: transparent;
  color: color-mix(in srgb, var(--color-text) 75%, transparent);
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  transition:
    border-color 0.15s ease,
    color 0.15s ease,
    box-shadow 0.15s ease;

  &:hover:not(:disabled) {
    color: var(--color-text);
    border-color: color-mix(in srgb, var(--color-primary) 52%, transparent);
    box-shadow: 0 0 0 1px color-mix(in srgb, var(--color-primary) 32%, transparent);
  }

  &:disabled {
    cursor: not-allowed;
    opacity: 0.45;
  }
`

const ConversationTabsContainer = styled.div`
  display: flex;
  align-items: center;
  flex: 0 0 ${CONVERSATION_TABS_HEIGHT}px;
  gap: 12px;
  padding: 8px 16px;
  min-height: ${CONVERSATION_TABS_HEIGHT}px;
  max-height: ${CONVERSATION_TABS_HEIGHT}px;
  border-bottom: 1px solid color-mix(in srgb, var(--color-border) 62%, transparent);
  background: transparent;
  overflow-x: auto;
  overflow-y: hidden;
  scroll-snap-type: x proximity;
  scrollbar-width: none;
  position: relative;
  z-index: 2;

  &::-webkit-scrollbar {
    display: none;
  }
`

const ConversationTabButton = styled.button<{ $active: boolean }>`
  display: flex;
  align-items: center;
  gap: 8px;
  flex: 0 0 auto;
  min-width: 240px;
  max-width: 420px;
  padding: 8px 12px;
  border-radius: 10px;
  border: 1px solid
    ${(props) =>
      props.$active
        ? 'color-mix(in srgb, var(--color-primary) 82%, transparent)'
        : 'color-mix(in srgb, var(--color-border) 55%, transparent)'};
  background: ${(props) =>
    props.$active
      ? 'linear-gradient(145deg, color-mix(in srgb, var(--color-primary) 26%, transparent), color-mix(in srgb, var(--color-primary) 8%, transparent))'
      : 'transparent'};
  color: var(--color-text);
  cursor: pointer;
  text-align: left;
  position: relative;
  overflow: hidden;
  transition:
    border-color 0.15s ease,
    background-color 0.15s ease,
    box-shadow 0.15s ease,
    transform 0.15s ease;
  box-shadow: ${(props) =>
    props.$active
      ? '0 0 0 1px color-mix(in srgb, var(--color-primary) 68%, transparent), 0 6px 16px color-mix(in srgb, var(--color-primary) 22%, transparent), inset 0 -2px 0 color-mix(in srgb, var(--color-primary) 95%, transparent)'
      : 'none'};
  transform: ${(props) => (props.$active ? 'translateY(-1px)' : 'translateY(0)')};
  scroll-snap-align: start;

  &::before {
    content: '';
    position: absolute;
    inset: 0;
    border-radius: inherit;
    pointer-events: none;
    opacity: ${(props) => (props.$active ? 1 : 0)};
    background: linear-gradient(
      120deg,
      color-mix(in srgb, white 22%, transparent) 0%,
      transparent 42%,
      color-mix(in srgb, var(--color-primary) 35%, transparent) 100%
    );
    transition: opacity 0.15s ease;
  }

  &::after {
    content: '';
    position: absolute;
    left: 9px;
    right: 9px;
    bottom: 0;
    height: 2px;
    border-radius: 2px;
    pointer-events: none;
    background: linear-gradient(
      90deg,
      color-mix(in srgb, var(--color-primary) 25%, transparent),
      color-mix(in srgb, var(--color-primary) 100%, transparent),
      color-mix(in srgb, var(--color-primary) 25%, transparent)
    );
    opacity: ${(props) => (props.$active ? 1 : 0)};
    transition: opacity 0.15s ease;
  }

  &:hover {
    transform: translateY(-1px);
    border-color: color-mix(in srgb, var(--color-primary) 42%, transparent);
    background: ${(props) =>
      props.$active
        ? 'linear-gradient(145deg, color-mix(in srgb, var(--color-primary) 30%, transparent), color-mix(in srgb, var(--color-primary) 10%, transparent))'
        : 'transparent'};
    box-shadow: ${(props) =>
      props.$active
        ? '0 0 0 1px color-mix(in srgb, var(--color-primary) 75%, transparent), 0 8px 20px color-mix(in srgb, var(--color-primary) 26%, transparent), inset 0 -2px 0 color-mix(in srgb, var(--color-primary) 100%, transparent)'
        : '0 0 0 1px color-mix(in srgb, var(--color-primary) 28%, transparent)'};
  }

  &:focus-visible {
    outline: none;
    border-color: color-mix(in srgb, var(--color-primary) 70%, transparent);
    box-shadow:
      0 0 0 2px color-mix(in srgb, var(--color-background) 84%, transparent),
      0 0 0 3px color-mix(in srgb, var(--color-primary) 62%, transparent);
  }
`

const ConversationTabText = styled.span<{ $active: boolean }>`
  display: flex;
  flex: 1;
  min-width: 0;
  flex-direction: column;
  align-items: flex-start;
  gap: 2px;
`

const ConversationTabTitle = styled.span<{ $active: boolean }>`
  display: block;
  width: 100%;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 13px;
  font-weight: ${(props) => (props.$active ? 700 : 600)};
  color: ${(props) =>
    props.$active ? 'color-mix(in srgb, var(--color-text) 100%, transparent)' : 'var(--color-text)'};
`

const ConversationTabMeta = styled.span<{ $active: boolean }>`
  display: block;
  width: 100%;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 11px;
  color: ${(props) =>
    props.$active
      ? 'color-mix(in srgb, var(--color-primary) 70%, var(--color-text) 30%)'
      : 'color-mix(in srgb, var(--color-text) 72%, transparent)'};
`

const ConversationTabClose = styled.button`
  width: 24px;
  height: 24px;
  border: none;
  border-radius: 6px;
  background: transparent;
  color: color-mix(in srgb, var(--color-text) 66%, transparent);
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition:
    background-color 0.15s ease,
    color 0.15s ease,
    box-shadow 0.15s ease;

  &:hover {
    color: var(--color-text);
    background: transparent;
    box-shadow: 0 0 0 1px color-mix(in srgb, var(--color-primary) 38%, transparent);
  }
`

const PinnedTodoPanelWrapper = styled.div`
  margin-top: auto;
  padding: 0 18px 8px 18px;
`

export default Chat
