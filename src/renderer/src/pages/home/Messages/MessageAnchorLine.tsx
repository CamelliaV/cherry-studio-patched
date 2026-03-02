import type { Message } from '@renderer/types/newMessage'
import { scrollIntoView } from '@renderer/utils/dom'
import { getMainTextContent } from '@renderer/utils/messageUtils/find'
import { type FC, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useHotkeys } from 'react-hotkeys-hook'
import { useTranslation } from 'react-i18next'
import styled from 'styled-components'

interface MessageLineProps {
  messages: Message[]
  persistKey?: string
  containerId?: string
  isActive?: boolean
}

interface TimelineAnchor {
  id: string
  userPreview: string
  assistantPreview: string
}

interface AnchorPosition {
  index: number
  top: number
}

const MAX_USER_PREVIEW_LENGTH = 44
const MAX_ASSISTANT_PREVIEW_LENGTH = 56
const MAX_RENDERED_ANCHORS = 220
const PREVIEW_ANCHOR_LIMIT = 260
// Keep active marker logic aligned with ChatNavigation's visible-threshold behavior.
const ACTIVE_TARGET_RATIO = 0.1
// Prevent first/last node clipping at rounded track edges.
const TIMELINE_EDGE_INSET_RATIO = 0.03
const TIMELINE_INDEX_STORAGE_PREFIX = 'timeline-anchor-index:'

const parseTimelineIndex = (value: unknown) => {
  const parsed = typeof value === 'string' ? Number(value) : Number(value)
  if (!Number.isFinite(parsed)) {
    return undefined
  }
  return Math.max(0, Math.floor(parsed))
}

const getStoredTimelineIndex = (storageKey: string) => {
  const keyvValue = window.keyv?.get(storageKey)
  const parsedKeyvValue = parseTimelineIndex(keyvValue)
  if (parsedKeyvValue !== undefined) {
    return parsedKeyvValue
  }

  const localStorageValue = window.localStorage.getItem(storageKey)
  return parseTimelineIndex(localStorageValue)
}

const setStoredTimelineIndex = (storageKey: string, index: number) => {
  window.keyv?.set(storageKey, index)
  window.localStorage.setItem(storageKey, String(index))
}

const normalizePreview = (content: string) => content.replace(/\s+/g, ' ').trim()

const truncatePreview = (content: string, maxLength: number) =>
  content.length > maxLength ? `${content.slice(0, maxLength)}…` : content

const getMessagePreview = (message: Message | undefined, maxLength: number) => {
  if (!message) return ''
  const content = normalizePreview(getMainTextContent(message))
  if (!content) return ''
  return truncatePreview(content, maxLength)
}

const MessageAnchorLine: FC<MessageLineProps> = ({
  messages,
  persistKey,
  containerId = 'messages',
  isActive = true
}) => {
  const { t } = useTranslation()
  const [activeAnchorId, setActiveAnchorId] = useState<string>()
  const [hoveredAnchorId, setHoveredAnchorId] = useState<string>()
  const updateRafIdRef = useRef<number | null>(null)
  const restoreTimerRef = useRef<number | null>(null)
  const hasRestoredRef = useRef(false)
  const activeAnchorIndexRef = useRef(-1)
  const anchorPositionsRef = useRef<AnchorPosition[]>([])
  const storageKey = useMemo(
    () => (persistKey ? `${TIMELINE_INDEX_STORAGE_PREFIX}${persistKey}` : undefined),
    [persistKey]
  )

  const timelineAnchors = useMemo<TimelineAnchor[]>(() => {
    const nonClearMessages = messages.filter((message) => message.type !== 'clear').toReversed()
    const userMessages = nonClearMessages.filter((message) => message.role === 'user')

    const assistantPreviewByAskId = new Map<string, string>()
    nonClearMessages.forEach((message) => {
      if (message.role !== 'assistant' || !message.askId) {
        return
      }
      const assistantPreview = getMessagePreview(message, MAX_ASSISTANT_PREVIEW_LENGTH)
      if (assistantPreview) {
        assistantPreviewByAskId.set(message.askId, assistantPreview)
      }
    })

    if (userMessages.length > 0) {
      return userMessages.map((userMessage) => ({
        id: userMessage.id,
        userPreview: getMessagePreview(userMessage, MAX_USER_PREVIEW_LENGTH),
        assistantPreview: assistantPreviewByAskId.get(userMessage.id) || ''
      }))
    }

    return nonClearMessages.map((message) => ({
      id: message.id,
      userPreview: message.role === 'user' ? getMessagePreview(message, MAX_USER_PREVIEW_LENGTH) : '',
      assistantPreview: message.role === 'assistant' ? getMessagePreview(message, MAX_ASSISTANT_PREVIEW_LENGTH) : ''
    }))
  }, [messages])

  const refreshAnchorPositions = useCallback(() => {
    const messagesContainer = document.getElementById(containerId)
    if (!messagesContainer || timelineAnchors.length === 0) {
      anchorPositionsRef.current = []
      return
    }

    const containerRect = messagesContainer.getBoundingClientRect()
    const containerScrollTop = messagesContainer.scrollTop
    const nextPositions: AnchorPosition[] = []

    for (let i = 0; i < timelineAnchors.length; i++) {
      const anchor = timelineAnchors[i]
      if (!anchor) continue

      const messageElement = document.getElementById(`message-${anchor.id}`)
      if (!messageElement) continue

      const messageRect = messageElement.getBoundingClientRect()
      nextPositions.push({
        index: i,
        top: messageRect.top - containerRect.top + containerScrollTop
      })
    }

    nextPositions.sort((a, b) => a.top - b.top)
    anchorPositionsRef.current = nextPositions
  }, [containerId, timelineAnchors])

  const findNearestAnchorIndex = useCallback((targetTop: number) => {
    const anchorPositions = anchorPositionsRef.current
    if (anchorPositions.length === 0) {
      return -1
    }

    let left = 0
    let right = anchorPositions.length - 1

    while (left < right) {
      const mid = Math.floor((left + right) / 2)
      if (anchorPositions[mid].top < targetTop) {
        left = mid + 1
      } else {
        right = mid
      }
    }

    const candidateIndices = [left, left - 1]
      .filter((index) => index >= 0 && index < anchorPositions.length)
      .map((index) => ({
        distance: Math.abs(anchorPositions[index].top - targetTop),
        timelineIndex: anchorPositions[index].index
      }))

    if (candidateIndices.length === 0) {
      return -1
    }

    candidateIndices.sort((a, b) => a.distance - b.distance)
    return candidateIndices[0].timelineIndex
  }, [])

  const getNearestAnchorIndex = useCallback(() => {
    const messagesContainer = document.getElementById(containerId)
    if (!messagesContainer || timelineAnchors.length === 0) {
      return -1
    }

    const targetTop = messagesContainer.scrollTop + messagesContainer.clientHeight * ACTIVE_TARGET_RATIO
    let nearestAnchorIndex = findNearestAnchorIndex(targetTop)

    if (nearestAnchorIndex === -1) {
      refreshAnchorPositions()
      nearestAnchorIndex = findNearestAnchorIndex(targetTop)
    }

    return nearestAnchorIndex
  }, [containerId, findNearestAnchorIndex, refreshAnchorPositions, timelineAnchors.length])

  const persistTimelineIndex = useCallback(
    (index: number) => {
      if (!storageKey) {
        return
      }
      setStoredTimelineIndex(storageKey, index)
    },
    [storageKey]
  )

  const updateActiveAnchor = useCallback(() => {
    const nearestAnchorIndex = getNearestAnchorIndex()
    if (nearestAnchorIndex === -1) {
      if (activeAnchorIndexRef.current !== -1) {
        activeAnchorIndexRef.current = -1
        setActiveAnchorId(undefined)
      }
      return
    }

    const nearestAnchorId = timelineAnchors[nearestAnchorIndex]?.id
    if (!nearestAnchorId) {
      return
    }

    if (nearestAnchorIndex === activeAnchorIndexRef.current && nearestAnchorId === activeAnchorId) {
      return
    }

    activeAnchorIndexRef.current = nearestAnchorIndex
    setActiveAnchorId(nearestAnchorId)
    persistTimelineIndex(nearestAnchorIndex)
  }, [activeAnchorId, getNearestAnchorIndex, persistTimelineIndex, timelineAnchors])

  const jumpTimelineAnchor = useCallback(
    (direction: 'previous' | 'next') => {
      const nearestAnchorIndex = getNearestAnchorIndex()
      if (nearestAnchorIndex === -1 || timelineAnchors.length === 0) {
        return
      }

      const targetIndex =
        direction === 'previous'
          ? Math.max(0, nearestAnchorIndex - 1)
          : Math.min(timelineAnchors.length - 1, nearestAnchorIndex + 1)

      const targetAnchor = timelineAnchors[targetIndex]
      if (!targetAnchor) {
        return
      }

      setActiveAnchorId(targetAnchor.id)
      activeAnchorIndexRef.current = targetIndex
      persistTimelineIndex(targetIndex)
      const messageElement = document.getElementById(`message-${targetAnchor.id}`)
      if (!messageElement) {
        return
      }

      scrollIntoView(messageElement, { behavior: 'smooth', block: 'start', container: 'nearest' })
    },
    [getNearestAnchorIndex, persistTimelineIndex, timelineAnchors]
  )

  const jumpToTimelineEdge = useCallback(
    (edge: 'first' | 'last') => {
      if (timelineAnchors.length === 0) {
        return
      }

      const targetAnchor = edge === 'first' ? timelineAnchors[0] : timelineAnchors[timelineAnchors.length - 1]
      if (!targetAnchor) {
        return
      }

      setActiveAnchorId(targetAnchor.id)
      const targetIndex = edge === 'first' ? 0 : timelineAnchors.length - 1
      activeAnchorIndexRef.current = targetIndex
      persistTimelineIndex(targetIndex)
      const messageElement = document.getElementById(`message-${targetAnchor.id}`)
      if (!messageElement) {
        return
      }

      scrollIntoView(messageElement, { behavior: 'smooth', block: 'start', container: 'nearest' })
    },
    [persistTimelineIndex, timelineAnchors]
  )

  useHotkeys(
    'alt+arrowup',
    (event) => {
      event.preventDefault()
      jumpTimelineAnchor('previous')
    },
    {
      enableOnFormTags: true,
      enabled: isActive && timelineAnchors.length > 0
    },
    [isActive, jumpTimelineAnchor, timelineAnchors.length]
  )

  useHotkeys(
    'alt+arrowdown',
    (event) => {
      event.preventDefault()
      jumpTimelineAnchor('next')
    },
    {
      enableOnFormTags: true,
      enabled: isActive && timelineAnchors.length > 0
    },
    [isActive, jumpTimelineAnchor, timelineAnchors.length]
  )

  useHotkeys(
    'alt+shift+arrowup',
    (event) => {
      event.preventDefault()
      jumpToTimelineEdge('first')
    },
    {
      enableOnFormTags: true,
      enabled: isActive && timelineAnchors.length > 0
    },
    [isActive, jumpToTimelineEdge, timelineAnchors.length]
  )

  useHotkeys(
    'alt+shift+arrowdown',
    (event) => {
      event.preventDefault()
      jumpToTimelineEdge('last')
    },
    {
      enableOnFormTags: true,
      enabled: isActive && timelineAnchors.length > 0
    },
    [isActive, jumpToTimelineEdge, timelineAnchors.length]
  )

  const scheduleActiveAnchorUpdate = useCallback(() => {
    if (updateRafIdRef.current !== null) return
    updateRafIdRef.current = requestAnimationFrame(() => {
      updateRafIdRef.current = null
      updateActiveAnchor()
    })
  }, [updateActiveAnchor])

  useEffect(() => {
    hasRestoredRef.current = false
    activeAnchorIndexRef.current = -1
    anchorPositionsRef.current = []
  }, [storageKey])

  const restorePersistedAnchor = useCallback(
    (attempt = 0) => {
      if (!isActive || !storageKey || hasRestoredRef.current || timelineAnchors.length === 0) {
        return
      }

      const storedIndex = getStoredTimelineIndex(storageKey)
      if (storedIndex === undefined) {
        hasRestoredRef.current = true
        return
      }

      const clampedIndex = Math.min(storedIndex, timelineAnchors.length - 1)
      const targetAnchor = timelineAnchors[clampedIndex]
      if (!targetAnchor) {
        hasRestoredRef.current = true
        return
      }

      const messageElement = document.getElementById(`message-${targetAnchor.id}`)
      if (!messageElement) {
        if (attempt >= 8) {
          hasRestoredRef.current = true
          return
        }

        restoreTimerRef.current = window.setTimeout(() => {
          restorePersistedAnchor(attempt + 1)
        }, 80)
        return
      }

      hasRestoredRef.current = true
      activeAnchorIndexRef.current = clampedIndex
      setActiveAnchorId(targetAnchor.id)
      scrollIntoView(messageElement, { behavior: 'auto', block: 'start', container: 'nearest' })
    },
    [isActive, storageKey, timelineAnchors]
  )

  useEffect(() => {
    if (!isActive) {
      return
    }

    restorePersistedAnchor()

    return () => {
      if (restoreTimerRef.current !== null) {
        window.clearTimeout(restoreTimerRef.current)
        restoreTimerRef.current = null
      }
    }
  }, [isActive, restorePersistedAnchor])

  useEffect(() => {
    if (!isActive) {
      return
    }

    const messagesContainer = document.getElementById(containerId)
    if (!messagesContainer) {
      return
    }

    const initialUpdateTimer = window.setTimeout(() => {
      refreshAnchorPositions()
      scheduleActiveAnchorUpdate()
    }, 80)
    const handleResize = () => {
      refreshAnchorPositions()
      scheduleActiveAnchorUpdate()
    }
    messagesContainer.addEventListener('scroll', scheduleActiveAnchorUpdate, { passive: true })
    window.addEventListener('resize', handleResize)

    return () => {
      window.clearTimeout(initialUpdateTimer)
      messagesContainer.removeEventListener('scroll', scheduleActiveAnchorUpdate)
      window.removeEventListener('resize', handleResize)
      if (updateRafIdRef.current !== null) {
        cancelAnimationFrame(updateRafIdRef.current)
        updateRafIdRef.current = null
      }
    }
  }, [containerId, isActive, refreshAnchorPositions, scheduleActiveAnchorUpdate])

  useEffect(() => {
    if (!isActive) {
      return
    }

    const refreshTimer = window.setTimeout(() => {
      refreshAnchorPositions()
      scheduleActiveAnchorUpdate()
    }, 0)

    return () => window.clearTimeout(refreshTimer)
  }, [isActive, timelineAnchors, refreshAnchorPositions, scheduleActiveAnchorUpdate])

  const scrollToAnchor = useCallback((anchor: TimelineAnchor) => {
    const messageElement = document.getElementById(`message-${anchor.id}`)
    if (!messageElement) return
    scrollIntoView(messageElement, { behavior: 'smooth', block: 'start', container: 'nearest' })
  }, [])

  const shouldShowIndex = (index: number, active: boolean) => {
    if (active) return true
    if (timelineAnchors.length <= 28) return true
    return index % 5 === 0
  }

  const renderedAnchorIndices = useMemo(() => {
    if (timelineAnchors.length <= MAX_RENDERED_ANCHORS) {
      return timelineAnchors.map((_, index) => index)
    }

    const indexSet = new Set<number>()
    const stride = Math.max(1, Math.ceil(timelineAnchors.length / MAX_RENDERED_ANCHORS))
    for (let index = 0; index < timelineAnchors.length; index += stride) {
      indexSet.add(index)
    }

    indexSet.add(0)
    indexSet.add(timelineAnchors.length - 1)

    if (activeAnchorId) {
      const activeIndex = timelineAnchors.findIndex((anchor) => anchor.id === activeAnchorId)
      if (activeIndex >= 0) {
        indexSet.add(activeIndex)
      }
    }

    if (hoveredAnchorId) {
      const hoveredIndex = timelineAnchors.findIndex((anchor) => anchor.id === hoveredAnchorId)
      if (hoveredIndex >= 0) {
        indexSet.add(hoveredIndex)
      }
    }

    return [...indexSet].sort((a, b) => a - b)
  }, [activeAnchorId, hoveredAnchorId, timelineAnchors])

  if (timelineAnchors.length === 0) {
    return null
  }

  return (
    <MessageLineContainer aria-label={t('chat.navigation.history')}>
      <MessageLineSurface>
        <AnchorTrack />
      </MessageLineSurface>
      {renderedAnchorIndices.map((index) => {
        const anchor = timelineAnchors[index]
        if (!anchor) {
          return null
        }
        const positionRatio =
          timelineAnchors.length === 1
            ? 0.5
            : TIMELINE_EDGE_INSET_RATIO + (index / (timelineAnchors.length - 1)) * (1 - TIMELINE_EDGE_INSET_RATIO * 2)
        const top = `${positionRatio * 100}%`
        const active = anchor.id === activeAnchorId
        const showPreview = timelineAnchors.length <= PREVIEW_ANCHOR_LIMIT && hoveredAnchorId === anchor.id
        const label = `${t('chat.navigation.history')} ${index + 1}`
        const tooltipTitle =
          [
            anchor.userPreview ? `Q: ${anchor.userPreview}` : '',
            anchor.assistantPreview ? `A: ${anchor.assistantPreview}` : ''
          ]
            .filter(Boolean)
            .join('\n') || label

        return (
          <AnchorButton
            key={anchor.id}
            type="button"
            $active={active}
            style={{ top }}
            title={tooltipTitle}
            onMouseEnter={() => setHoveredAnchorId(anchor.id)}
            onMouseLeave={() => setHoveredAnchorId((prev) => (prev === anchor.id ? undefined : prev))}
            onMouseDown={(event) => event.preventDefault()}
            onClick={(event) => {
              event.preventDefault()
              event.stopPropagation()
              activeAnchorIndexRef.current = index
              setActiveAnchorId(anchor.id)
              persistTimelineIndex(index)
              scrollToAnchor(anchor)
            }}
            aria-label={label}>
            {shouldShowIndex(index, active) && <AnchorIndex>{index + 1}</AnchorIndex>}
            {showPreview && (
              <AnchorPreview>
                {anchor.userPreview && (
                  <PreviewLine>
                    <PreviewRole>Q</PreviewRole>
                    <PreviewText>{anchor.userPreview}</PreviewText>
                  </PreviewLine>
                )}
                {anchor.assistantPreview && (
                  <PreviewLine>
                    <PreviewRole>A</PreviewRole>
                    <PreviewText>{anchor.assistantPreview}</PreviewText>
                  </PreviewLine>
                )}
                {!anchor.userPreview && !anchor.assistantPreview && <PreviewFallback>{label}</PreviewFallback>}
              </AnchorPreview>
            )}
          </AnchorButton>
        )
      })}
    </MessageLineContainer>
  )
}

const MessageLineContainer = styled.div`
  position: absolute;
  top: 10px;
  right: 6px;
  bottom: 10px;
  width: 42px;
  z-index: 3;
  user-select: none;
  pointer-events: none;
`

const MessageLineSurface = styled.div`
  position: absolute;
  inset: 0;
  border-radius: 999px;
  overflow: hidden;
  pointer-events: none;
  background: linear-gradient(
    180deg,
    color-mix(in srgb, var(--color-background) 28%, transparent) 0%,
    color-mix(in srgb, var(--color-background-soft) 12%, transparent) 52%,
    color-mix(in srgb, var(--color-background) 22%, transparent) 100%
  );
  border: 1px solid color-mix(in srgb, var(--color-border) 46%, transparent);
`

const AnchorTrack = styled.div`
  position: absolute;
  top: 6px;
  bottom: 6px;
  left: 50%;
  width: 2px;
  transform: translateX(-50%);
  background: linear-gradient(
    180deg,
    color-mix(in srgb, var(--color-primary) 22%, transparent) 0%,
    color-mix(in srgb, var(--color-border) 62%, transparent) 20%,
    color-mix(in srgb, var(--color-border) 62%, transparent) 80%,
    color-mix(in srgb, var(--color-primary) 22%, transparent) 100%
  );
  border-radius: 999px;
`

const AnchorButton = styled.button<{ $active: boolean }>`
  position: absolute;
  left: 50%;
  z-index: 1;
  width: ${(props) => (props.$active ? 16 : 9)}px;
  height: ${(props) => (props.$active ? 16 : 9)}px;
  transform: translate(-50%, -50%);
  border-radius: 999px;
  border: 1px solid
    ${(props) =>
      props.$active
        ? 'color-mix(in srgb, var(--color-primary) 76%, transparent)'
        : 'color-mix(in srgb, var(--color-border) 66%, transparent)'};
  background: ${(props) =>
    props.$active
      ? 'radial-gradient(circle at 35% 30%, #fff 0%, color-mix(in srgb, var(--color-primary) 82%, #fff) 26%, var(--color-primary) 76% 100%)'
      : 'color-mix(in srgb, var(--color-background) 55%, transparent)'};
  box-shadow: ${(props) => (props.$active ? '0 0 0 2px color-mix(in srgb, var(--color-primary) 24%, transparent)' : 'none')};
  color: ${(props) => (props.$active ? '#fff' : 'var(--color-text-3)')};
  cursor: pointer;
  pointer-events: auto;
  display: flex;
  align-items: center;
  justify-content: center;
  transition:
    width 0.12s ease,
    height 0.12s ease,
    transform 0.12s ease,
    background-color 0.12s ease,
    border-color 0.12s ease,
    box-shadow 0.12s ease;

  &:hover {
    transform: translate(-50%, -50%) scale(1.12);
    border-color: color-mix(in srgb, var(--color-primary) 78%, transparent);
    background: color-mix(in srgb, var(--color-primary) 32%, transparent);
    box-shadow: 0 0 0 2px color-mix(in srgb, var(--color-primary) 18%, transparent);
  }
`

const AnchorIndex = styled.span`
  font-size: 7px;
  font-weight: 600;
  line-height: 1;
  text-shadow: 0 1px 2px color-mix(in srgb, #000 35%, transparent);
`

const AnchorPreview = styled.div`
  position: absolute;
  right: calc(100% + 10px);
  top: 50%;
  transform: translateY(-50%);
  width: clamp(150px, 24vw, 220px);
  padding: 6px 8px;
  border-radius: 10px;
  border: 1px solid color-mix(in srgb, var(--color-border) 58%, transparent);
  background: color-mix(in srgb, var(--color-background-soft) 88%, transparent);
  box-shadow: 0 8px 22px -16px color-mix(in srgb, #000 80%, transparent);
  pointer-events: none;
`

const PreviewLine = styled.div`
  display: flex;
  align-items: center;
  gap: 6px;

  & + & {
    margin-top: 4px;
  }
`

const PreviewRole = styled.span`
  min-width: 14px;
  height: 14px;
  border-radius: 999px;
  border: 1px solid color-mix(in srgb, var(--color-primary) 60%, transparent);
  color: color-mix(in srgb, var(--color-primary) 85%, #fff);
  font-size: 9px;
  line-height: 12px;
  text-align: center;
  font-weight: 700;
  flex: 0 0 auto;
`

const PreviewText = styled.span`
  min-width: 0;
  font-size: 11px;
  line-height: 1.2;
  color: color-mix(in srgb, var(--color-text) 90%, transparent);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
`

const PreviewFallback = styled.span`
  display: block;
  font-size: 11px;
  line-height: 1.2;
  color: var(--color-text-2);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
`

export default MessageAnchorLine
