import { loggerService } from '@logger'
import { db } from '@renderer/databases'
import { useAssistants } from '@renderer/hooks/useAssistant'
import { useAssistantPresets } from '@renderer/hooks/useAssistantPresets'
import { useNotesSettings } from '@renderer/hooks/useNotesSettings'
import { modelGenerating } from '@renderer/hooks/useRuntime'
import { useSettings } from '@renderer/hooks/useSettings'
import { useAssistantsTabSortType } from '@renderer/hooks/useStore'
import { useTags } from '@renderer/hooks/useTags'
import { TopicManager } from '@renderer/hooks/useTopic'
import { getAssistantMenuItems, sortAssistantsByPinyin } from '@renderer/pages/home/Tabs/components/AssistantItem'
import { EVENT_NAMES, EventEmitter } from '@renderer/services/EventService'
import { useAppDispatch, useAppSelector } from '@renderer/store'
import {
  addTopic as addTopicAction,
  removeAllTopics as removeAllTopicsAction,
  removeTopic as removeTopicAction,
  updateTopic as updateTopicAction
} from '@renderer/store/assistants'
import { updateTopics as updateTopicsAction } from '@renderer/store/assistants'
import { setGenerating } from '@renderer/store/runtime'
import type { Assistant, Topic } from '@renderer/types'
import type { MenuProps } from 'antd'
import { findIndex } from 'lodash'
import { useCallback } from 'react'
import { useTranslation } from 'react-i18next'

import { buildTopicMenuItems } from './topicMenuBuilder'

const logger = loggerService.withContext('useNavigatorContextMenus')

interface UseNavigatorContextMenusParams {
  activeAssistant: Assistant
  activeTopic: Topic
  onSelect: (assistant: Assistant, topic: Topic) => void
}

export function useNavigatorContextMenus({ activeAssistant, activeTopic, onSelect }: UseNavigatorContextMenusParams) {
  const { t } = useTranslation()
  const dispatch = useAppDispatch()
  const { assistants, updateAssistants, removeAssistant, copyAssistant } = useAssistants()
  const { addAssistantPreset } = useAssistantPresets()
  const { allTags } = useTags()
  const { assistantsTabSortType = 'list', setAssistantsTabSortType } = useAssistantsTabSortType()
  const { setAssistantIconType, setTopicPosition } = useSettings()
  const { notesPath } = useNotesSettings()
  const exportMenuOptions = useAppSelector((state) => state.settings.exportMenuOptions)
  const renamingTopics = useAppSelector((state) => state.runtime.chat.renamingTopics)

  const onAssistantSwitch = useCallback(
    (assistant: Assistant) => {
      const firstTopic = assistant.topics?.[0]
      if (firstTopic) {
        onSelect(assistant, firstTopic)
      }
    },
    [onSelect]
  )

  const onAssistantDelete = useCallback(
    (assistant: Assistant) => {
      const remaining = assistants.filter((item) => item.id !== assistant.id)
      if (remaining.length === 0) {
        window.toast.error(t('assistants.delete.error.remain_one'))
        return
      }

      if (assistant.id === activeAssistant.id) {
        const fallbackAssistant = remaining[remaining.length - 1]
        const fallbackTopic = fallbackAssistant?.topics?.[0]
        if (fallbackAssistant && fallbackTopic) {
          onSelect(fallbackAssistant, fallbackTopic)
        }
      }

      removeAssistant(assistant.id)
    },
    [activeAssistant.id, assistants, onSelect, removeAssistant, t]
  )

  const sortByPinyinAsc = useCallback(() => {
    updateAssistants(sortAssistantsByPinyin(assistants, true))
  }, [assistants, updateAssistants])

  const sortByPinyinDesc = useCallback(() => {
    updateAssistants(sortAssistantsByPinyin(assistants, false))
  }, [assistants, updateAssistants])

  const onPinTopic = useCallback(
    (assistant: Assistant, topic: Topic) => {
      if (topic.pinned) {
        const pinnedTopics = assistant.topics.filter((t) => t.pinned)
        const unpinnedTopics = assistant.topics.filter((t) => !t.pinned)
        const reorderedTopics = [...pinnedTopics.filter((t) => t.id !== topic.id), topic, ...unpinnedTopics]

        dispatch(updateTopicsAction({ assistantId: assistant.id, topics: reorderedTopics }))
      } else {
        const pinnedTopics = assistant.topics.filter((t) => t.pinned)
        const unpinnedTopics = assistant.topics.filter((t) => !t.pinned)
        const reorderedTopics = [topic, ...pinnedTopics, ...unpinnedTopics.filter((t) => t.id !== topic.id)]

        dispatch(updateTopicsAction({ assistantId: assistant.id, topics: reorderedTopics }))
      }

      dispatch(updateTopicAction({ assistantId: assistant.id, topic: { ...topic, pinned: !topic.pinned } }))
    },
    [dispatch]
  )

  const onClearMessages = useCallback(
    (topic: Topic) => {
      dispatch(setGenerating(false))
      EventEmitter.emit(EVENT_NAMES.CLEAR_MESSAGES, topic)
    },
    [dispatch]
  )

  const onDeleteTopic = useCallback(
    async (assistant: Assistant, topic: Topic) => {
      if (assistant.topics.length <= 1) {
        return
      }

      if (topic.id === activeTopic.id && assistant.id === activeAssistant.id) {
        const index = findIndex(assistant.topics, (t) => t.id === topic.id)
        const fallbackTopic = assistant.topics[index + 1 === assistant.topics.length ? index - 1 : index + 1]
        if (fallbackTopic) {
          onSelect(assistant, fallbackTopic)
        }
      }

      await modelGenerating()
      await TopicManager.removeTopic(topic.id)
      dispatch(removeTopicAction({ assistantId: assistant.id, topic }))
    },
    [activeAssistant.id, activeTopic.id, dispatch, onSelect]
  )

  const onMoveTopic = useCallback(
    async (assistant: Assistant, topic: Topic, toAssistant: Assistant) => {
      await modelGenerating()

      if (topic.id === activeTopic.id && assistant.id === activeAssistant.id) {
        const index = findIndex(assistant.topics, (t) => t.id === topic.id)
        const fallbackTopic = assistant.topics[index + 1 === assistant.topics.length ? 0 : index + 1]
        if (fallbackTopic) {
          onSelect(assistant, fallbackTopic)
        }
      }

      dispatch(
        addTopicAction({
          assistantId: toAssistant.id,
          topic: {
            ...topic,
            assistantId: toAssistant.id
          }
        })
      )
      dispatch(removeTopicAction({ assistantId: assistant.id, topic }))

      try {
        await db.topics
          .where('id')
          .equals(topic.id)
          .modify((dbTopic) => {
            if (dbTopic.messages) {
              dbTopic.messages = dbTopic.messages.map((message) => ({
                ...message,
                assistantId: toAssistant.id
              }))
            }
          })
      } catch (error) {
        logger.error('Failed to update topic messages assistantId when moving topic', error as Error)
      }
    },
    [activeAssistant.id, activeTopic.id, dispatch, onSelect]
  )

  const getAssistantContextMenuItems = useCallback(
    (assistant: Assistant): MenuProps['items'] => {
      return getAssistantMenuItems({
        assistant,
        t,
        allTags,
        assistants,
        updateAssistants,
        addPreset: addAssistantPreset,
        copyAssistant,
        onSwitch: onAssistantSwitch,
        onDelete: onAssistantDelete,
        removeAllTopics: async () => {
          await Promise.all(assistant.topics.map((topic) => TopicManager.removeTopic(topic.id)))
          dispatch(removeAllTopicsAction({ assistantId: assistant.id }))
        },
        setAssistantIconType,
        sortBy: assistantsTabSortType,
        handleSortByChange: setAssistantsTabSortType,
        sortByPinyinAsc,
        sortByPinyinDesc
      })
    },
    [
      t,
      allTags,
      assistants,
      updateAssistants,
      addAssistantPreset,
      copyAssistant,
      onAssistantSwitch,
      onAssistantDelete,
      setAssistantIconType,
      assistantsTabSortType,
      setAssistantsTabSortType,
      sortByPinyinAsc,
      sortByPinyinDesc,
      dispatch
    ]
  )

  const getTopicContextMenuItems = useCallback(
    (assistant: Assistant, topic: Topic): MenuProps['items'] => {
      return buildTopicMenuItems({
        topic,
        assistant,
        assistants,
        t,
        notesPath,
        exportMenuOptions,
        activeTopicId: activeTopic.id,
        isRenaming: (topicId) => renamingTopics.includes(topicId),
        setActiveTopic: (nextTopic) => onSelect(assistant, nextTopic),
        updateTopic: (nextTopic) => dispatch(updateTopicAction({ assistantId: assistant.id, topic: nextTopic })),
        onPinTopic: (nextTopic) => onPinTopic(assistant, nextTopic),
        onClearMessages,
        onMoveTopic: (nextTopic, toAssistant) => onMoveTopic(assistant, nextTopic, toAssistant),
        onDeleteTopic: (nextTopic) => onDeleteTopic(assistant, nextTopic),
        setTopicPosition
      })
    },
    [
      activeTopic.id,
      assistants,
      t,
      notesPath,
      exportMenuOptions,
      renamingTopics,
      onSelect,
      dispatch,
      onPinTopic,
      onClearMessages,
      onMoveTopic,
      onDeleteTopic,
      setTopicPosition
    ]
  )

  return { getAssistantContextMenuItems, getTopicContextMenuItems }
}
