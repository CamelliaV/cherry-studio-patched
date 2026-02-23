import { loggerService } from '@logger'
import AssistantAvatar from '@renderer/components/Avatar/AssistantAvatar'
import AddAssistantPopup from '@renderer/components/Popups/AddAssistantPopup'
import { db } from '@renderer/databases'
import { useShortcutDisplay } from '@renderer/hooks/useShortcuts'
import { getDefaultTopic } from '@renderer/services/AssistantService'
import { useAppDispatch } from '@renderer/store'
import { addTopic as addTopicAction, setModel as setModelAction } from '@renderer/store/assistants'
import type { Assistant, Topic } from '@renderer/types'
import type { InputRef } from 'antd'
import { Dropdown, Input } from 'antd'
import dayjs from 'dayjs'
import { ChevronRight, Hash, Plus, Search } from 'lucide-react'
import type { KeyboardEvent } from 'react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import styled from 'styled-components'

import { useNavigatorContextMenus } from './useNavigatorContextMenus'

type LauncherMode = 'tab' | 'popup'
const logger = loggerService.withContext('LauncherNavigator')

interface LauncherGroup {
  assistant: Assistant
  assistantName: string
  topics: Topic[]
  assistantEntryTopic: Topic
}

interface LauncherEntry {
  key: string
  assistant: Assistant
  topic: Topic
  type: 'assistant' | 'topic'
}

interface LauncherNavigatorProps {
  assistants: Assistant[]
  activeAssistant: Assistant
  activeTopic: Topic
  mode?: LauncherMode
  onSelect: (assistant: Assistant, topic: Topic) => void
  onClose?: () => void
  className?: string
}

const buildEntryKey = (assistantId: string, topicId: string, type: 'assistant' | 'topic') =>
  `${assistantId}:${topicId}:${type}`

const LauncherNavigator: React.FC<LauncherNavigatorProps> = ({
  assistants,
  activeAssistant,
  activeTopic,
  mode = 'tab',
  onSelect,
  onClose,
  className
}) => {
  const { t } = useTranslation()
  const dispatch = useAppDispatch()
  const [searchText, setSearchText] = useState('')
  const [highlightedKey, setHighlightedKey] = useState('')
  const [isCreatingAssistant, setIsCreatingAssistant] = useState(false)
  const [isCreatingTopic, setIsCreatingTopic] = useState(false)
  const openLauncherShortcut = useShortcutDisplay('open_launcher')
  const searchInputRef = useRef<InputRef>(null)
  const normalizedSearchText = searchText.trim().toLocaleLowerCase()
  const { getAssistantContextMenuItems, getTopicContextMenuItems } = useNavigatorContextMenus({
    activeAssistant,
    activeTopic,
    onSelect
  })
  const topicTargetAssistant = useMemo(
    () => assistants.find((assistant) => assistant.id === activeAssistant.id) ?? assistants[0] ?? null,
    [activeAssistant.id, assistants]
  )

  const launcherGroups = useMemo<LauncherGroup[]>(() => {
    const groups: LauncherGroup[] = []

    for (const assistant of assistants) {
      const topics = assistant.topics ?? []
      if (topics.length === 0) {
        continue
      }

      const assistantName = assistant.name || t('chat.default.name')
      const assistantNameMatched = assistantName.toLocaleLowerCase().includes(normalizedSearchText)
      const visibleTopics = normalizedSearchText
        ? topics.filter(
            (topic) => assistantNameMatched || (topic.name || '').toLocaleLowerCase().includes(normalizedSearchText)
          )
        : topics

      if (!assistantNameMatched && visibleTopics.length === 0) {
        continue
      }

      groups.push({
        assistant,
        assistantName,
        topics: visibleTopics,
        assistantEntryTopic: topics[0]
      })
    }

    return groups
  }, [assistants, normalizedSearchText, t])

  const launcherEntries = useMemo<LauncherEntry[]>(() => {
    const entries: LauncherEntry[] = []

    for (const group of launcherGroups) {
      entries.push({
        key: buildEntryKey(group.assistant.id, group.assistantEntryTopic.id, 'assistant'),
        assistant: group.assistant,
        topic: group.assistantEntryTopic,
        type: 'assistant'
      })

      for (const topic of group.topics) {
        entries.push({
          key: buildEntryKey(group.assistant.id, topic.id, 'topic'),
          assistant: group.assistant,
          topic,
          type: 'topic'
        })
      }
    }

    return entries
  }, [launcherGroups])

  useEffect(() => {
    if (mode !== 'popup') {
      return
    }

    // Delay focus until modal transition has rendered the input.
    requestAnimationFrame(() => searchInputRef.current?.focus({ cursor: 'all' }))
  }, [mode])

  useEffect(() => {
    if (launcherEntries.length === 0) {
      setHighlightedKey('')
      return
    }

    const activeTopicEntry = launcherEntries.find(
      (entry) =>
        entry.type === 'topic' && entry.assistant.id === activeAssistant.id && entry.topic.id === activeTopic.id
    )
    if (activeTopicEntry) {
      setHighlightedKey(activeTopicEntry.key)
      return
    }

    const activeAssistantEntry = launcherEntries.find(
      (entry) => entry.type === 'assistant' && entry.assistant.id === activeAssistant.id
    )
    setHighlightedKey(activeAssistantEntry?.key ?? launcherEntries[0].key)
  }, [launcherEntries, activeAssistant.id, activeTopic.id])

  const moveHighlight = useCallback(
    (direction: 1 | -1) => {
      if (launcherEntries.length === 0) {
        return
      }

      const currentIndex = launcherEntries.findIndex((entry) => entry.key === highlightedKey)
      const startIndex = currentIndex >= 0 ? currentIndex : 0
      const nextIndex = (startIndex + direction + launcherEntries.length) % launcherEntries.length
      setHighlightedKey(launcherEntries[nextIndex].key)
    },
    [highlightedKey, launcherEntries]
  )

  const selectEntry = useCallback(
    (entry: LauncherEntry) => {
      onSelect(entry.assistant, entry.topic)
      if (mode === 'popup') {
        onClose?.()
      }
    },
    [mode, onClose, onSelect]
  )

  const onSearchInputKeyDown = useCallback(
    (event: KeyboardEvent<HTMLInputElement>) => {
      if (event.key === 'ArrowDown') {
        event.preventDefault()
        moveHighlight(1)
        return
      }
      if (event.key === 'ArrowUp') {
        event.preventDefault()
        moveHighlight(-1)
        return
      }
      if (event.key === 'Enter') {
        event.preventDefault()
        const selectedEntry =
          launcherEntries.find((entry) => entry.key === highlightedKey) ?? launcherEntries.at(0) ?? null
        if (selectedEntry) {
          selectEntry(selectedEntry)
        }
        return
      }
      if (event.key === 'Escape' && mode === 'popup') {
        event.preventDefault()
        onClose?.()
      }
    },
    [highlightedKey, launcherEntries, mode, moveHighlight, onClose, selectEntry]
  )

  const handleCreateAssistant = useCallback(async () => {
    if (isCreatingAssistant) {
      return
    }

    setIsCreatingAssistant(true)
    try {
      const assistant = await AddAssistantPopup.show()
      const firstTopic = assistant?.topics?.[0]
      if (assistant && firstTopic) {
        onSelect(assistant, firstTopic)
      }
    } finally {
      setIsCreatingAssistant(false)
    }
  }, [isCreatingAssistant, onSelect])

  const handleCreateTopic = useCallback(async () => {
    if (!topicTargetAssistant || isCreatingTopic) {
      return
    }

    setIsCreatingTopic(true)
    try {
      const newTopic = getDefaultTopic(topicTargetAssistant.id)
      await db.topics.add({ id: newTopic.id, messages: [] })

      if (topicTargetAssistant.defaultModel) {
        dispatch(setModelAction({ assistantId: topicTargetAssistant.id, model: topicTargetAssistant.defaultModel }))
      }

      dispatch(addTopicAction({ assistantId: topicTargetAssistant.id, topic: newTopic }))
      onSelect(topicTargetAssistant, newTopic)
    } catch (error) {
      logger.error('Failed to create topic from launcher', error as Error)
      window.toast.error(t('common.error'))
    } finally {
      setIsCreatingTopic(false)
    }
  }, [dispatch, isCreatingTopic, onSelect, t, topicTargetAssistant])

  return (
    <Container className={className} data-mode={mode}>
      <SearchSection data-mode={mode}>
        <Input
          ref={searchInputRef}
          allowClear
          value={searchText}
          onChange={(event) => setSearchText(event.target.value)}
          onKeyDown={onSearchInputKeyDown}
          prefix={<Search size={14} />}
          placeholder={`${t('assistants.search')} / ${t('common.topics')}`}
          spellCheck={false}
        />
        <ActionButtons>
          <CreateActionButton type="button" onClick={() => void handleCreateAssistant()} disabled={isCreatingAssistant}>
            <Plus size={12} />
            <span>{t('chat.add.assistant.title')}</span>
          </CreateActionButton>
          <CreateActionButton
            type="button"
            onClick={() => void handleCreateTopic()}
            disabled={isCreatingTopic || !topicTargetAssistant}>
            <Plus size={12} />
            <span>{t('chat.add.topic.title')}</span>
          </CreateActionButton>
        </ActionButtons>
        {mode === 'tab' && openLauncherShortcut && <ShortcutHint>{openLauncherShortcut}</ShortcutHint>}
      </SearchSection>
      <ResultsSection data-mode={mode}>
        {launcherGroups.length === 0 && <EmptyState>{t('quickPanel.noResult')}</EmptyState>}
        {launcherGroups.map((group) => (
          <GroupCard key={group.assistant.id}>
            <Dropdown menu={{ items: getAssistantContextMenuItems(group.assistant) }} trigger={['contextMenu']}>
              <LauncherButton
                type="button"
                data-level={0}
                data-highlighted={
                  highlightedKey === buildEntryKey(group.assistant.id, group.assistantEntryTopic.id, 'assistant')
                }
                data-active={group.assistant.id === activeAssistant.id}
                onMouseEnter={() =>
                  setHighlightedKey(buildEntryKey(group.assistant.id, group.assistantEntryTopic.id, 'assistant'))
                }
                onClick={() =>
                  selectEntry({
                    key: buildEntryKey(group.assistant.id, group.assistantEntryTopic.id, 'assistant'),
                    assistant: group.assistant,
                    topic: group.assistantEntryTopic,
                    type: 'assistant'
                  })
                }>
                <LeftContent>
                  <AssistantAvatar assistant={group.assistant} size={20} />
                  <TitleText>{group.assistantName}</TitleText>
                </LeftContent>
                <RightContent>
                  <MetaTag>
                    <Hash size={10} />
                    <span>{group.assistant.topics.length}</span>
                  </MetaTag>
                  <ChevronRight size={14} />
                </RightContent>
              </LauncherButton>
            </Dropdown>
            {group.topics.map((topic) => {
              const topicKey = buildEntryKey(group.assistant.id, topic.id, 'topic')
              const topicName = topic.name || t('common.topics')
              const formattedTime = dayjs(topic.updatedAt || topic.createdAt).format('MM-DD HH:mm')

              return (
                <Dropdown
                  key={topicKey}
                  menu={{ items: getTopicContextMenuItems(group.assistant, topic) }}
                  trigger={['contextMenu']}>
                  <LauncherButton
                    type="button"
                    data-level={1}
                    data-highlighted={highlightedKey === topicKey}
                    data-active={group.assistant.id === activeAssistant.id && topic.id === activeTopic.id}
                    onMouseEnter={() => setHighlightedKey(topicKey)}
                    onClick={() =>
                      selectEntry({
                        key: topicKey,
                        assistant: group.assistant,
                        topic,
                        type: 'topic'
                      })
                    }>
                    <LeftContent>
                      <TopicMarker />
                      <TitleText>{topicName}</TitleText>
                    </LeftContent>
                    <Timestamp>{formattedTime}</Timestamp>
                  </LauncherButton>
                </Dropdown>
              )
            })}
          </GroupCard>
        ))}
      </ResultsSection>
    </Container>
  )
}

const Container = styled.div`
  display: flex;
  height: 100%;
  min-height: 0;
  flex-direction: column;
  gap: 12px;
  padding: 10px;
`

const SearchSection = styled.div`
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 8px;
  border: 1px solid color-mix(in srgb, var(--color-border) 70%, transparent);
  border-radius: 14px;
  background:
    linear-gradient(135deg, color-mix(in srgb, var(--color-primary) 12%, transparent), transparent 45%),
    var(--color-background);

  .ant-input-affix-wrapper {
    border-radius: 10px;
    border: 1px solid color-mix(in srgb, var(--color-border) 75%, transparent);
    background: color-mix(in srgb, var(--color-background) 94%, var(--color-primary) 6%);
    min-width: 0;
  }

  &[data-mode='popup'] {
    margin: 2px;
  }
`

const ActionButtons = styled.div`
  display: inline-flex;
  align-items: center;
  gap: 6px;
`

const CreateActionButton = styled.button`
  display: inline-flex;
  align-items: center;
  gap: 4px;
  height: 26px;
  padding: 0 8px;
  border-radius: 8px;
  border: 1px solid color-mix(in srgb, var(--color-border) 72%, transparent);
  background: color-mix(in srgb, var(--color-background) 94%, var(--color-primary) 6%);
  color: var(--color-text-2);
  font-size: 11px;
  cursor: pointer;
  white-space: nowrap;
  transition:
    border-color 0.15s ease,
    color 0.15s ease,
    background-color 0.15s ease;

  &:hover:not(:disabled) {
    color: var(--color-text);
    border-color: color-mix(in srgb, var(--color-primary) 45%, transparent);
    background: color-mix(in srgb, var(--color-list-item-hover) 80%, var(--color-primary) 20%);
  }

  &:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
`

const ShortcutHint = styled.span`
  padding: 2px 8px;
  border-radius: 999px;
  border: 1px dashed color-mix(in srgb, var(--color-border) 70%, transparent);
  color: var(--color-text-2);
  font-size: 11px;
  white-space: nowrap;
`

const ResultsSection = styled.div`
  display: flex;
  flex: 1;
  min-height: 0;
  flex-direction: column;
  gap: 8px;
  overflow: auto;
  padding-right: 2px;

  &[data-mode='popup'] {
    max-height: 55vh;
  }
`

const GroupCard = styled.div`
  border: 1px solid color-mix(in srgb, var(--color-border) 80%, transparent);
  border-radius: 14px;
  padding: 6px;
  background: color-mix(in srgb, var(--color-background) 96%, var(--color-primary) 4%);
`

const LauncherButton = styled.button`
  width: 100%;
  min-height: 34px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  border: none;
  border-radius: 10px;
  text-align: left;
  cursor: pointer;
  color: var(--color-text);
  background: transparent;
  transition: background-color 0.15s ease;

  &[data-level='0'] {
    padding: 8px 10px;
    font-size: 13px;
    font-weight: 600;
  }

  &[data-level='1'] {
    padding: 7px 10px 7px 30px;
    font-size: 12px;
    color: var(--color-text-2);
  }

  &[data-highlighted='true'] {
    background: color-mix(in srgb, var(--color-list-item-hover) 85%, var(--color-primary) 15%);
  }

  &[data-active='true'] {
    background: color-mix(in srgb, var(--color-list-item) 80%, var(--color-primary) 20%);
    color: var(--color-text);
  }
`

const LeftContent = styled.div`
  min-width: 0;
  display: flex;
  align-items: center;
  gap: 8px;
  flex: 1;
`

const RightContent = styled.div`
  display: inline-flex;
  align-items: center;
  gap: 8px;
  color: var(--color-text-3);
`

const MetaTag = styled.span`
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 1px 6px;
  border-radius: 999px;
  border: 1px solid color-mix(in srgb, var(--color-border) 70%, transparent);
  color: var(--color-text-2);
  font-size: 10px;
  line-height: 1;
`

const TitleText = styled.span`
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
`

const TopicMarker = styled.span`
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: color-mix(in srgb, var(--color-primary) 75%, transparent);
  flex: 0 0 auto;
`

const Timestamp = styled.span`
  color: var(--color-text-3);
  font-size: 11px;
  white-space: nowrap;
`

const EmptyState = styled.div`
  margin-top: 18px;
  text-align: center;
  color: var(--color-text-3);
  font-size: 12px;
`

export default LauncherNavigator
