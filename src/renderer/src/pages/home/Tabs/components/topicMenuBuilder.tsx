import AssistantAvatar from '@renderer/components/Avatar/AssistantAvatar'
import { CopyIcon, DeleteIcon, EditIcon } from '@renderer/components/Icons'
import ObsidianExportPopup from '@renderer/components/Popups/ObsidianExportPopup'
import PromptPopup from '@renderer/components/Popups/PromptPopup'
import SaveToKnowledgePopup from '@renderer/components/Popups/SaveToKnowledgePopup'
import { finishTopicRenaming, startTopicRenaming, TopicManager } from '@renderer/hooks/useTopic'
import { fetchMessagesSummary } from '@renderer/services/ApiService'
import { EVENT_NAMES, EventEmitter } from '@renderer/services/EventService'
import type { RootState } from '@renderer/store'
import type { Assistant, Topic } from '@renderer/types'
import { copyTopicAsMarkdown, copyTopicAsPlainText } from '@renderer/utils/copy'
import {
  exportMarkdownToJoplin,
  exportMarkdownToSiyuan,
  exportMarkdownToYuque,
  exportTopicAsMarkdown,
  exportTopicToNotes,
  exportTopicToNotion,
  topicToMarkdown
} from '@renderer/utils/export'
import { removeSpecialCharactersForFileName } from '@renderer/utils/index'
import type { MenuProps } from 'antd'
import { Tooltip } from 'antd'
import type { ItemType, MenuItemType } from 'antd/es/menu/interface'
import type { TFunction } from 'i18next'
import {
  BrushCleaning,
  FolderOpen,
  HelpCircle,
  MenuIcon,
  NotebookPen,
  PackagePlus,
  PinIcon,
  PinOffIcon,
  Save,
  Sparkles,
  UploadIcon
} from 'lucide-react'

interface BuildTopicMenuItemsParams {
  topic: Topic
  assistant: Assistant
  assistants: Assistant[]
  t: TFunction
  notesPath: string
  exportMenuOptions: RootState['settings']['exportMenuOptions']
  activeTopicId: string
  isRenaming: (topicId: string) => boolean
  setActiveTopic: (topic: Topic) => void
  updateTopic: (topic: Topic) => void
  onPinTopic: (topic: Topic) => void
  onClearMessages: (topic: Topic) => void
  onMoveTopic: (topic: Topic, toAssistant: Assistant) => Promise<void> | void
  onDeleteTopic: (topic: Topic) => Promise<void> | void
  setTopicPosition: (position: 'left' | 'right') => void
}

export function buildTopicMenuItems({
  topic,
  assistant,
  assistants,
  t,
  notesPath,
  exportMenuOptions,
  activeTopicId,
  isRenaming,
  setActiveTopic,
  updateTopic,
  onPinTopic,
  onClearMessages,
  onMoveTopic,
  onDeleteTopic,
  setTopicPosition
}: BuildTopicMenuItemsParams): MenuProps['items'] {
  const menus: MenuProps['items'] = [
    {
      label: t('chat.topics.auto_rename'),
      key: 'auto-rename',
      icon: <Sparkles size={14} />,
      disabled: isRenaming(topic.id),
      async onClick() {
        const messages = await TopicManager.getTopicMessages(topic.id)
        if (messages.length >= 2) {
          startTopicRenaming(topic.id)
          try {
            const { text: summaryText, error } = await fetchMessagesSummary({ messages, assistant })
            if (summaryText) {
              const updatedTopic = { ...topic, name: summaryText, isNameManuallyEdited: false }
              updateTopic(updatedTopic)
            } else if (error) {
              window.toast?.error(`${t('message.error.fetchTopicName')}: ${error}`)
            }
          } finally {
            finishTopicRenaming(topic.id)
          }
        }
      }
    },
    {
      label: t('chat.topics.edit.title'),
      key: 'rename',
      icon: <EditIcon size={14} />,
      disabled: isRenaming(topic.id),
      async onClick() {
        const name = await PromptPopup.show({
          title: t('chat.topics.edit.title'),
          message: '',
          defaultValue: topic.name || '',
          extraNode: <div style={{ color: 'var(--color-text-3)', marginTop: 8 }}>{t('chat.topics.edit.title_tip')}</div>
        })
        if (name && topic.name !== name) {
          const updatedTopic = { ...topic, name, isNameManuallyEdited: true }
          updateTopic(updatedTopic)
        }
      }
    },
    {
      label: t('chat.topics.prompt.label'),
      key: 'topic-prompt',
      icon: <PackagePlus size={14} />,
      extra: (
        <Tooltip title={t('chat.topics.prompt.tips')}>
          <HelpCircle size={14} />
        </Tooltip>
      ),
      async onClick() {
        const prompt = await PromptPopup.show({
          title: t('chat.topics.prompt.edit.title'),
          message: '',
          defaultValue: topic.prompt || '',
          inputProps: {
            rows: 8,
            allowClear: true
          }
        })

        prompt !== null &&
          (() => {
            const updatedTopic = { ...topic, prompt: prompt.trim() }
            updateTopic(updatedTopic)
            topic.id === activeTopicId && setActiveTopic(updatedTopic)
          })()
      }
    },
    {
      label: topic.pinned ? t('chat.topics.unpin') : t('chat.topics.pin'),
      key: 'pin',
      icon: topic.pinned ? <PinOffIcon size={14} /> : <PinIcon size={14} />,
      onClick() {
        onPinTopic(topic)
      }
    },
    {
      label: t('notes.save'),
      key: 'notes',
      icon: <NotebookPen size={14} />,
      onClick: async () => {
        exportTopicToNotes(topic, notesPath)
      }
    },
    {
      label: t('chat.topics.clear.title'),
      key: 'clear-messages',
      icon: <BrushCleaning size={14} />,
      onClick: () => onClearMessages(topic)
    },
    {
      label: t('settings.topic.position.label'),
      key: 'topic-position',
      icon: <MenuIcon size={14} />,
      children: [
        {
          label: t('settings.topic.position.left'),
          key: 'left',
          onClick: () => setTopicPosition('left')
        },
        {
          label: t('settings.topic.position.right'),
          key: 'right',
          onClick: () => setTopicPosition('right')
        }
      ]
    },
    {
      label: t('chat.topics.copy.title'),
      key: 'copy',
      icon: <CopyIcon size={14} />,
      children: [
        {
          label: t('chat.topics.copy.image'),
          key: 'img',
          onClick: () => EventEmitter.emit(EVENT_NAMES.COPY_TOPIC_IMAGE, topic)
        },
        {
          label: t('chat.topics.copy.md'),
          key: 'md',
          onClick: () => copyTopicAsMarkdown(topic)
        },
        {
          label: t('chat.topics.copy.plain_text'),
          key: 'plain_text',
          onClick: () => copyTopicAsPlainText(topic)
        }
      ]
    },
    {
      label: t('chat.save.label'),
      key: 'save',
      icon: <Save size={14} />,
      children: [
        {
          label: t('chat.save.topic.knowledge.title'),
          key: 'knowledge',
          onClick: async () => {
            try {
              const result = await SaveToKnowledgePopup.showForTopic(topic)
              if (result?.success) {
                window.toast.success(t('chat.save.topic.knowledge.success', { count: result.savedCount }))
              }
            } catch {
              window.toast.error(t('chat.save.topic.knowledge.error.save_failed'))
            }
          }
        }
      ]
    },
    {
      label: t('chat.topics.export.title'),
      key: 'export',
      icon: <UploadIcon size={14} />,
      children: [
        exportMenuOptions.image && {
          label: t('chat.topics.export.image'),
          key: 'image',
          onClick: () => EventEmitter.emit(EVENT_NAMES.EXPORT_TOPIC_IMAGE, topic)
        },
        exportMenuOptions.markdown && {
          label: t('chat.topics.export.md.label'),
          key: 'markdown',
          onClick: () => exportTopicAsMarkdown(topic)
        },
        exportMenuOptions.markdown_reason && {
          label: t('chat.topics.export.md.reason'),
          key: 'markdown_reason',
          onClick: () => exportTopicAsMarkdown(topic, true)
        },
        exportMenuOptions.docx && {
          label: t('chat.topics.export.word'),
          key: 'word',
          onClick: async () => {
            const markdown = await topicToMarkdown(topic)
            window.api.export.toWord(markdown, removeSpecialCharactersForFileName(topic.name))
          }
        },
        exportMenuOptions.notion && {
          label: t('chat.topics.export.notion'),
          key: 'notion',
          onClick: async () => {
            exportTopicToNotion(topic)
          }
        },
        exportMenuOptions.yuque && {
          label: t('chat.topics.export.yuque'),
          key: 'yuque',
          onClick: async () => {
            const markdown = await topicToMarkdown(topic)
            exportMarkdownToYuque(topic.name, markdown)
          }
        },
        exportMenuOptions.obsidian && {
          label: t('chat.topics.export.obsidian'),
          key: 'obsidian',
          onClick: async () => {
            await ObsidianExportPopup.show({ title: topic.name, topic, processingMethod: '3' })
          }
        },
        exportMenuOptions.joplin && {
          label: t('chat.topics.export.joplin'),
          key: 'joplin',
          onClick: async () => {
            const topicMessages = await TopicManager.getTopicMessages(topic.id)
            exportMarkdownToJoplin(topic.name, topicMessages)
          }
        },
        exportMenuOptions.siyuan && {
          label: t('chat.topics.export.siyuan'),
          key: 'siyuan',
          onClick: async () => {
            const markdown = await topicToMarkdown(topic)
            exportMarkdownToSiyuan(topic.name, markdown)
          }
        }
      ].filter(Boolean) as ItemType<MenuItemType>[]
    }
  ]

  if (assistants.length > 1 && assistant.topics.length > 1) {
    menus.push({
      label: t('chat.topics.move_to'),
      key: 'move',
      icon: <FolderOpen size={14} />,
      children: assistants
        .filter((a) => a.id !== assistant.id)
        .map((a) => ({
          label: a.name,
          key: a.id,
          icon: <AssistantAvatar assistant={a} size={18} />,
          onClick: () => onMoveTopic(topic, a)
        }))
    })
  }

  if (assistant.topics.length > 1 && !topic.pinned) {
    menus.push({ type: 'divider' })
    menus.push({
      label: t('common.delete'),
      danger: true,
      key: 'delete',
      icon: <DeleteIcon size={14} className="lucide-custom" />,
      onClick: () => onDeleteTopic(topic)
    })
  }

  return menus
}
