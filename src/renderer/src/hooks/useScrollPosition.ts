import { throttle } from 'lodash'
import { useCallback, useEffect, useMemo, useRef } from 'react'

import { useTimer } from './useTimer'

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
  const { clearTimeoutTimer, setTimeoutTimer } = useTimer()

  useEffect(() => {
    scrollKeyRef.current = scrollKey
  }, [scrollKey])

  const persistScrollPosition = useCallback(() => {
    const position = containerRef.current?.scrollTop ?? 0
    window.keyv.set(scrollKeyRef.current, position)
  }, [])

  const handleScroll = useMemo(
    () =>
      throttle(
        () => {
          const position = containerRef.current?.scrollTop ?? 0
          window.requestAnimationFrame(() => {
            window.keyv.set(scrollKeyRef.current, position)
          })
        },
        throttleWait ?? 100,
        { leading: true, trailing: true }
      ),
    [throttleWait]
  )

  const restoreScrollPosition = useCallback(() => {
    const storedPosition = Number(window.keyv.get(scrollKey) || 0)
    const nextTop = Number.isFinite(storedPosition) ? storedPosition : 0
    containerRef.current?.scrollTo({ top: nextTop })
  }, [scrollKey])

  useEffect(() => {
    if (!isActive) {
      return
    }

    // For keep-alive panels (e.g., conversation tabs), restoring on every re-activation can
    // overwrite the already-preserved runtime scroll position with stale persisted values.
    if (restoredScrollKeyRef.current === scrollKey) {
      return
    }
    restoredScrollKeyRef.current = scrollKey

    restoreScrollPosition()
    window.requestAnimationFrame(restoreScrollPosition)
    setTimeoutTimer(`scrollEffect:${scrollKey}`, restoreScrollPosition, 50)
    setTimeoutTimer(`scrollEffect:settle:${scrollKey}`, restoreScrollPosition, 180)
    setTimeoutTimer(`scrollEffect:late:${scrollKey}`, restoreScrollPosition, 420)

    return () => {
      clearTimeoutTimer(`scrollEffect:${scrollKey}`)
      clearTimeoutTimer(`scrollEffect:settle:${scrollKey}`)
      clearTimeoutTimer(`scrollEffect:late:${scrollKey}`)
    }
  }, [clearTimeoutTimer, isActive, restoreScrollPosition, scrollKey, setTimeoutTimer])

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
