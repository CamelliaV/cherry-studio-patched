import { throttle } from 'lodash'
import { useCallback, useEffect, useMemo, useRef } from 'react'

import { useTimer } from './useTimer'

const parseScrollPosition = (value: unknown): number | null => {
  if (value === null || value === undefined || value === '') {
    return null
  }
  const parsed = typeof value === 'number' ? value : Number(value)
  return Number.isFinite(parsed) ? parsed : null
}

/**
 * A custom hook that manages scroll position persistence for a container element
 * @param key - A unique identifier used to store/retrieve the scroll position
 * @returns An object containing:
 *  - containerRef: React ref for the scrollable container
 *  - handleScroll: Throttled scroll event handler that saves scroll position
 */
export default function useScrollPosition(key: string, throttleWait?: number, isActive: boolean = true) {
  const containerRef = useRef<HTMLDivElement>(null)
  const scrollKey = useMemo(() => `scroll:${key}`, [key])
  const scrollKeyRef = useRef(scrollKey)
  const restoredScrollKeyRef = useRef<string | null>(null)
  const userInteractedRef = useRef(false)
  const { clearTimeoutTimer, setTimeoutTimer } = useTimer()

  const restoreTimerKeys = useMemo(() => [`scrollEffect:${scrollKey}`], [scrollKey])

  useEffect(() => {
    scrollKeyRef.current = scrollKey
  }, [scrollKey])

  const clearRestoreTimers = useCallback(() => {
    restoreTimerKeys.forEach((timerKey) => clearTimeoutTimer(timerKey))
  }, [clearTimeoutTimer, restoreTimerKeys])

  const readSavedScrollPosition = useCallback(() => {
    const savedFromKeyv = parseScrollPosition(window.keyv.get(scrollKey))
    if (savedFromKeyv !== null) {
      return savedFromKeyv
    }

    return parseScrollPosition(window.localStorage.getItem(scrollKey))
  }, [scrollKey])

  const persistScrollPosition = useCallback(() => {
    const position = containerRef.current?.scrollTop ?? 0
    window.keyv.set(scrollKeyRef.current, position)
    window.localStorage.setItem(scrollKeyRef.current, String(position))
  }, [])

  const handleScroll = useMemo(
    () =>
      throttle(
        () => {
          const position = containerRef.current?.scrollTop ?? 0
          window.requestAnimationFrame(() => {
            window.keyv.set(scrollKeyRef.current, position)
            window.localStorage.setItem(scrollKeyRef.current, String(position))
          })
        },
        throttleWait ?? 100,
        { leading: true, trailing: true }
      ),
    [throttleWait]
  )

  const restoreScrollPosition = useCallback((savedPosition: number) => {
    if (userInteractedRef.current) {
      return
    }
    const nextTop = Number.isFinite(savedPosition) ? savedPosition : 0
    containerRef.current?.scrollTo({ top: nextTop })
  }, [])

  useEffect(() => {
    if (!isActive) {
      return
    }

    userInteractedRef.current = false

    // For keep-alive panels (e.g., conversation tabs), restoring on every re-activation can
    // overwrite the already-preserved runtime scroll position with stale persisted values.
    if (restoredScrollKeyRef.current === scrollKey) {
      return
    }
    restoredScrollKeyRef.current = scrollKey

    const savedPosition = readSavedScrollPosition()
    if (savedPosition === null) {
      return
    }

    restoreScrollPosition(savedPosition)
    window.requestAnimationFrame(() => restoreScrollPosition(savedPosition))
    setTimeoutTimer(restoreTimerKeys[0], () => restoreScrollPosition(savedPosition), 50)

    return () => {
      clearRestoreTimers()
    }
  }, [
    clearRestoreTimers,
    isActive,
    readSavedScrollPosition,
    restoreScrollPosition,
    restoreTimerKeys,
    scrollKey,
    setTimeoutTimer
  ])

  useEffect(() => {
    if (!isActive) {
      return
    }

    const container = containerRef.current
    if (!container) {
      return
    }

    const stopRestoreOnUserInput = () => {
      if (userInteractedRef.current) {
        return
      }
      userInteractedRef.current = true
      clearRestoreTimers()
    }

    container.addEventListener('wheel', stopRestoreOnUserInput, { passive: true })
    container.addEventListener('touchstart', stopRestoreOnUserInput, { passive: true })
    container.addEventListener('pointerdown', stopRestoreOnUserInput)

    return () => {
      container.removeEventListener('wheel', stopRestoreOnUserInput)
      container.removeEventListener('touchstart', stopRestoreOnUserInput)
      container.removeEventListener('pointerdown', stopRestoreOnUserInput)
      clearRestoreTimers()
    }
  }, [clearRestoreTimers, isActive])

  useEffect(() => {
    if (isActive) {
      return
    }

    handleScroll.flush()
    persistScrollPosition()
  }, [handleScroll, isActive, persistScrollPosition])

  useEffect(() => {
    return () => {
      handleScroll.flush()
      handleScroll.cancel()
      persistScrollPosition()
    }
  }, [handleScroll, persistScrollPosition])

  return { containerRef, handleScroll }
}
