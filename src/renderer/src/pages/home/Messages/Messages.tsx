import { loggerService } from '@logger'
import ContextMenu from '@renderer/components/ContextMenu'
import { useAssistant } from '@renderer/hooks/useAssistant'
import { useChatContext } from '@renderer/hooks/useChatContext'
import { useMessageOperations, useTopicMessages } from '@renderer/hooks/useMessageOperations'
import useScrollPosition from '@renderer/hooks/useScrollPosition'
import { useSettings } from '@renderer/hooks/useSettings'
import { useShortcut } from '@renderer/hooks/useShortcuts'
import { autoRenameTopic } from '@renderer/hooks/useTopic'
import SelectionBox from '@renderer/pages/home/Messages/SelectionBox'
import { getDefaultTopic } from '@renderer/services/AssistantService'
import { EVENT_NAMES, EventEmitter } from '@renderer/services/EventService'
import { getContextCount, getGroupedMessages, getUserMessage } from '@renderer/services/MessagesService'
import { estimateHistoryTokens } from '@renderer/services/TokenService'
import store, { useAppDispatch } from '@renderer/store'
import { messageBlocksSelectors, updateOneBlock } from '@renderer/store/messageBlock'
import { newMessagesActions } from '@renderer/store/newMessage'
import { saveMessageAndBlocksToDB, updateMessageAndBlocksThunk } from '@renderer/store/thunk/messageThunk'
import type { Assistant, Topic } from '@renderer/types'
import type { MessageBlock } from '@renderer/types/newMessage'
import { type Message, MessageBlockType } from '@renderer/types/newMessage'
import {
  captureScrollableAsBlob,
  captureScrollableAsDataURL,
  removeSpecialCharactersForFileName,
  runAsyncFunction
} from '@renderer/utils'
import { updateCodeBlock } from '@renderer/utils/markdown'
import { getMainTextContent } from '@renderer/utils/messageUtils/find'
import { isTextLikeBlock } from '@renderer/utils/messageUtils/is'
import { last } from 'lodash'
import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'

import MessageAnchorLine from './MessageAnchorLine'
import MessageGroup from './MessageGroup'
import NarrowLayout from './NarrowLayout'
import Prompt from './Prompt'
import { MessagesContainer, MessagesViewport, ScrollContainer } from './shared'

interface MessagesProps {
  assistant: Assistant
  topic: Topic
  setActiveTopic: (topic: Topic) => void
  onComponentUpdate?(): void
  onFirstUpdate?(): void
  isActive?: boolean
  containerId?: string
}

const logger = loggerService.withContext('Messages')
type EstimatedTokenPayload = {
  tokensCount: number
  contextCount: ReturnType<typeof getContextCount>
}

const Messages: React.FC<MessagesProps> = ({
  assistant,
  topic,
  setActiveTopic,
  onComponentUpdate,
  onFirstUpdate,
  isActive = true,
  containerId
}) => {
  const messagesContainerId = containerId || `messages-topic-${topic.id}`
  const { containerRef: scrollContainerRef, handleScroll: handleScrollPosition } = useScrollPosition(
    `topic-${topic.id}`,
    undefined,
    isActive
  )
  const [isProcessingContext, setIsProcessingContext] = useState(false)

  const { addTopic } = useAssistant(assistant.id)
  const { showPrompt } = useSettings()
  const { t } = useTranslation()
  const dispatch = useAppDispatch()
  const messages = useTopicMessages(topic.id)
  const { clearTopicMessages, deleteMessage, createTopicBranch } = useMessageOperations(topic)

  const { isMultiSelectMode, handleSelectMessage } = useChatContext(topic)

  const messageElements = useRef<Map<string, HTMLElement>>(new Map())
  const messagesRef = useRef<Message[]>(messages)
  const latestEstimateRef = useRef<{ key: string; payload: EstimatedTokenPayload } | null>(null)

  useEffect(() => {
    messagesRef.current = messages
  }, [messages])

  const lastMessage = messages[messages.length - 1]
  const tokenEstimateCacheKey = useMemo(
    () =>
      [
        topic.id,
        assistant.id,
        assistant.prompt || '',
        assistant.settings?.contextCount ?? '',
        messages.length,
        lastMessage?.id || '',
        lastMessage?.updatedAt || lastMessage?.createdAt || ''
      ].join('|'),
    [
      assistant.id,
      assistant.prompt,
      assistant.settings?.contextCount,
      lastMessage?.createdAt,
      lastMessage?.id,
      lastMessage?.updatedAt,
      messages.length,
      topic.id
    ]
  )

  const registerMessageElement = useCallback((id: string, element: HTMLElement | null) => {
    if (element) {
      messageElements.current.set(id, element)
    } else {
      messageElements.current.delete(id)
    }
  }, [])
  const displayMessages = useMemo(() => [...messages].reverse(), [messages])

  // NOTE: 如果设置为平滑滚动会导致滚动条无法跟随生成的新消息保持在底部位置
  const scrollToBottom = useCallback(() => {
    if (scrollContainerRef.current) {
      requestAnimationFrame(() => {
        if (scrollContainerRef.current) {
          scrollContainerRef.current.scrollTo({ top: 0 })
        }
      })
    }
  }, [scrollContainerRef])

  const clearTopic = useCallback(
    async (data: Topic) => {
      if (data && data.id !== topic.id) {
        await clearTopicMessages(data.id)
        return
      }

      await clearTopicMessages()
    },
    [clearTopicMessages, topic.id]
  )

  useEffect(() => {
    if (!isActive) {
      return
    }

    const unsubscribes = [
      EventEmitter.on(EVENT_NAMES.SEND_MESSAGE, scrollToBottom),
      EventEmitter.on(EVENT_NAMES.CLEAR_MESSAGES, async (data: Topic) => {
        window.modal.confirm({
          title: t('chat.input.clear.title'),
          content: t('chat.input.clear.content'),
          centered: true,
          onOk: () => clearTopic(data)
        })
      }),
      EventEmitter.on(EVENT_NAMES.COPY_TOPIC_IMAGE, async () => {
        await captureScrollableAsBlob(scrollContainerRef, async (blob) => {
          if (blob) {
            await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })])
          }
        })
      }),
      EventEmitter.on(EVENT_NAMES.EXPORT_TOPIC_IMAGE, async () => {
        const imageData = await captureScrollableAsDataURL(scrollContainerRef)
        if (imageData) {
          window.api.file.saveImage(removeSpecialCharactersForFileName(topic.name), imageData)
        }
      }),
      EventEmitter.on(EVENT_NAMES.NEW_CONTEXT, async () => {
        if (isProcessingContext) return
        setIsProcessingContext(true)

        try {
          const messages = messagesRef.current

          if (messages.length === 0) {
            return
          }

          const lastMessage = last(messages)

          if (lastMessage?.type === 'clear') {
            await deleteMessage(lastMessage.id)
            scrollToBottom()
            return
          }

          const { message: clearMessage } = getUserMessage({ assistant, topic, type: 'clear' })
          dispatch(newMessagesActions.addMessage({ topicId: topic.id, message: clearMessage }))
          await saveMessageAndBlocksToDB(topic.id, clearMessage, [])

          scrollToBottom()
        } finally {
          setIsProcessingContext(false)
        }
      }),
      EventEmitter.on(EVENT_NAMES.NEW_BRANCH, async (index: number) => {
        const newTopic = getDefaultTopic(assistant.id)
        newTopic.name = topic.name
        const currentMessages = messagesRef.current

        if (index < 0 || index > currentMessages.length) {
          logger.error(`[NEW_BRANCH] Invalid branch index: ${index}`)
          return
        }

        // 1. Add the new topic to Redux store FIRST
        addTopic(newTopic)

        // 2. Call the thunk to clone messages and update DB
        const success = await createTopicBranch(topic.id, currentMessages.length - index, newTopic)

        if (success) {
          // 3. Set the new topic as active
          setActiveTopic(newTopic)
          // 4. Trigger auto-rename for the new topic
          autoRenameTopic(assistant, newTopic.id)
        } else {
          // Optional: Handle cloning failure (e.g., show an error message)
          // You might want to remove the added topic if cloning fails
          // removeTopic(newTopic.id); // Assuming you have a removeTopic function
          logger.error(`[NEW_BRANCH] Failed to create topic branch for topic ${newTopic.id}`)
          window.toast.error(t('message.branch.error')) // Example error message
        }
      }),
      EventEmitter.on(
        EVENT_NAMES.EDIT_CODE_BLOCK,
        async (data: { msgBlockId: string; codeBlockId: string; newContent: string }) => {
          const { msgBlockId, codeBlockId, newContent } = data

          const msgBlock = messageBlocksSelectors.selectById(store.getState(), msgBlockId)

          // FIXME: 目前 error block 没有 content
          if (msgBlock && isTextLikeBlock(msgBlock) && msgBlock.type !== MessageBlockType.ERROR) {
            try {
              const updatedRaw = updateCodeBlock(msgBlock.content, codeBlockId, newContent)
              const updatedBlock: MessageBlock = {
                ...msgBlock,
                content: updatedRaw,
                updatedAt: new Date().toISOString()
              }

              dispatch(updateOneBlock({ id: msgBlockId, changes: { content: updatedRaw } }))
              await dispatch(updateMessageAndBlocksThunk(topic.id, null, [updatedBlock]))

              window.toast.success(t('code_block.edit.save.success'))
            } catch (error) {
              logger.error(
                `Failed to save code block ${codeBlockId} content to message block ${msgBlockId}:`,
                error as Error
              )
              window.toast.error(t('code_block.edit.save.failed.label'))
            }
          } else {
            logger.error(
              `Failed to save code block ${codeBlockId} content to message block ${msgBlockId}: no such message block or the block doesn't have a content field`
            )
            window.toast.error(t('code_block.edit.save.failed.label'))
          }
        }
      )
    ]

    return () => unsubscribes.forEach((unsub) => unsub())
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [assistant, dispatch, isActive, scrollToBottom, topic, isProcessingContext])

  useEffect(() => {
    if (!isActive) {
      return
    }

    if (latestEstimateRef.current?.key === tokenEstimateCacheKey) {
      EventEmitter.emit(EVENT_NAMES.ESTIMATED_TOKEN_COUNT, latestEstimateRef.current.payload)
      onFirstUpdate?.()
      return
    }

    let cancelled = false
    let idleCallbackId: number | null = null
    let estimationTimer: number | null = null

    const runEstimation = () => {
      runAsyncFunction(async () => {
        const payload: EstimatedTokenPayload = {
          tokensCount: await estimateHistoryTokens(assistant, messages),
          contextCount: getContextCount(assistant, messages)
        }
        if (cancelled) {
          return
        }
        latestEstimateRef.current = {
          key: tokenEstimateCacheKey,
          payload
        }
        EventEmitter.emit(EVENT_NAMES.ESTIMATED_TOKEN_COUNT, payload)
      }).finally(() => {
        if (!cancelled) {
          onFirstUpdate?.()
        }
      })
    }

    if (typeof window.requestIdleCallback === 'function') {
      idleCallbackId = window.requestIdleCallback(
        () => {
          if (!cancelled) {
            runEstimation()
          }
        },
        { timeout: 280 }
      )
    } else {
      estimationTimer = window.setTimeout(runEstimation, 50)
    }

    return () => {
      cancelled = true
      if (idleCallbackId !== null && typeof window.cancelIdleCallback === 'function') {
        window.cancelIdleCallback(idleCallbackId)
      }
      if (estimationTimer !== null) {
        window.clearTimeout(estimationTimer)
      }
    }
  }, [assistant, isActive, messages, onFirstUpdate, tokenEstimateCacheKey])

  useShortcut(
    'copy_last_message',
    () => {
      const lastMessage = last(messages)
      if (lastMessage) {
        navigator.clipboard.writeText(getMainTextContent(lastMessage))
        window.toast.success(t('message.copy.success'))
      }
    },
    { enabled: isActive }
  )

  useShortcut(
    'edit_last_user_message',
    () => {
      const lastUserMessage = messagesRef.current.findLast((m) => m.role === 'user' && m.type !== 'clear')
      if (lastUserMessage) {
        EventEmitter.emit(EVENT_NAMES.EDIT_MESSAGE, lastUserMessage.id)
      }
    },
    { enabled: isActive }
  )

  useEffect(() => {
    if (!isActive) {
      return
    }

    requestAnimationFrame(() => onComponentUpdate?.())
  }, [isActive, onComponentUpdate])

  // NOTE: 因为displayMessages是倒序的，所以得到的groupedMessages每个group内部也是倒序的，需要再倒一遍
  const groupedMessages = useMemo(() => {
    return Object.entries(getGroupedMessages(displayMessages)).map(
      ([key, group]) =>
        [key, group.toReversed()] as [
          string,
          (Message & {
            index: number
          })[]
        ]
    )
  }, [displayMessages])

  const showMessageAnchor = true

  return (
    <MessagesViewport>
      <MessagesContainer
        id={messagesContainerId}
        className="messages-container"
        ref={scrollContainerRef}
        key={assistant.id}
        onScroll={handleScrollPosition}>
        <NarrowLayout style={{ display: 'flex', flexDirection: 'column-reverse' }}>
          <ContextMenu>
            <ScrollContainer $withAnchor={showMessageAnchor}>
              {groupedMessages.map(([key, groupMessages]) => (
                <MessageGroup
                  key={key}
                  messages={groupMessages}
                  topic={topic}
                  registerMessageElement={registerMessageElement}
                />
              ))}
            </ScrollContainer>
          </ContextMenu>

          {showPrompt && <Prompt assistant={assistant} key={assistant.prompt} topic={topic} />}
        </NarrowLayout>
        {isActive && (
          <SelectionBox
            isMultiSelectMode={isMultiSelectMode}
            scrollContainerRef={scrollContainerRef}
            messageElements={messageElements.current}
            handleSelectMessage={handleSelectMessage}
          />
        )}
      </MessagesContainer>
      {showMessageAnchor && (
        <MessageAnchorLine
          messages={displayMessages}
          persistKey={`topic-${topic.id}`}
          containerId={messagesContainerId}
          isActive={isActive}
        />
      )}
    </MessagesViewport>
  )
}

const areMessagesPropsEqual = (prev: MessagesProps, next: MessagesProps) => {
  return (
    prev.assistant.id === next.assistant.id &&
    prev.assistant.prompt === next.assistant.prompt &&
    prev.assistant.model?.id === next.assistant.model?.id &&
    prev.topic.id === next.topic.id &&
    prev.topic.updatedAt === next.topic.updatedAt &&
    prev.isActive === next.isActive &&
    prev.containerId === next.containerId
  )
}

export default memo(Messages, areMessagesPropsEqual)
