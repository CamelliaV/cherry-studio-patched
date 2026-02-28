import type { WheelEvent as ReactWheelEvent } from 'react'
import { useCallback, useEffect, useRef } from 'react'

const LINE_DELTA_PX = 16
const ANIMATION_EASING = 0.22
const STOP_THRESHOLD = 0.35
const WHEEL_DELTA_MULTIPLIER = 1.05

const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value))

const canElementScroll = (element: HTMLElement) => {
  const style = window.getComputedStyle(element)
  if (style.overflowY !== 'auto' && style.overflowY !== 'scroll' && style.overflowY !== 'overlay') {
    return false
  }
  return element.scrollHeight > element.clientHeight
}

const hasScrollableAncestor = (target: EventTarget | null, container: HTMLElement) => {
  if (!(target instanceof HTMLElement)) {
    return false
  }

  let current: HTMLElement | null = target
  while (current && current !== container) {
    if (canElementScroll(current)) {
      return true
    }
    current = current.parentElement
  }

  return false
}

const isEditableTarget = (target: EventTarget | null) => {
  if (!(target instanceof HTMLElement)) {
    return false
  }

  if (target.isContentEditable) {
    return true
  }

  const editable = target.closest('textarea, input, [contenteditable="true"]')
  return !!editable
}

const toPixelDelta = (event: ReactWheelEvent<HTMLElement>, containerHeight: number) => {
  if (event.deltaMode === 1) {
    return event.deltaY * LINE_DELTA_PX
  }
  if (event.deltaMode === 2) {
    return event.deltaY * containerHeight
  }
  return event.deltaY
}

export default function useSmoothWheelScroll(
  containerRef: React.RefObject<HTMLElement | null>,
  enabled: boolean = true,
  invertDelta: boolean = false
) {
  const frameRef = useRef<number | null>(null)
  const targetScrollTopRef = useRef<number | null>(null)

  const cancelSmoothScroll = useCallback(() => {
    if (frameRef.current !== null) {
      cancelAnimationFrame(frameRef.current)
      frameRef.current = null
    }
    targetScrollTopRef.current = null
  }, [])

  const animate = useCallback(() => {
    const container = containerRef.current
    if (!container) {
      frameRef.current = null
      return
    }

    const maxScrollTop = Math.max(0, container.scrollHeight - container.clientHeight)
    const targetScrollTop = clamp(targetScrollTopRef.current ?? container.scrollTop, 0, maxScrollTop)
    targetScrollTopRef.current = targetScrollTop

    const delta = targetScrollTop - container.scrollTop
    if (Math.abs(delta) <= STOP_THRESHOLD) {
      container.scrollTop = targetScrollTop
      frameRef.current = null
      return
    }

    container.scrollTop += delta * ANIMATION_EASING
    frameRef.current = requestAnimationFrame(animate)
  }, [containerRef])

  const scheduleAnimation = useCallback(() => {
    if (frameRef.current !== null) {
      return
    }
    frameRef.current = requestAnimationFrame(animate)
  }, [animate])

  const handleWheel = useCallback(
    (event: ReactWheelEvent<HTMLElement>) => {
      if (!enabled || event.defaultPrevented || event.ctrlKey || event.metaKey) {
        return
      }

      const container = containerRef.current
      if (!container || !container.contains(event.target as Node)) {
        return
      }

      if (isEditableTarget(event.target) || hasScrollableAncestor(event.target, container)) {
        return
      }

      if (Math.abs(event.deltaY) <= Math.abs(event.deltaX)) {
        return
      }

      const maxScrollTop = Math.max(0, container.scrollHeight - container.clientHeight)
      if (maxScrollTop <= 0) {
        return
      }

      const baseDelta = toPixelDelta(event, container.clientHeight)
      const wheelDelta = (invertDelta ? -baseDelta : baseDelta) * WHEEL_DELTA_MULTIPLIER
      if (Math.abs(wheelDelta) < 0.1) {
        return
      }

      const currentTarget = targetScrollTopRef.current ?? container.scrollTop
      const nextTarget = clamp(currentTarget + wheelDelta, 0, maxScrollTop)

      if (nextTarget === currentTarget) {
        return
      }

      event.preventDefault()
      targetScrollTopRef.current = nextTarget
      scheduleAnimation()
    },
    [containerRef, enabled, invertDelta, scheduleAnimation]
  )

  useEffect(() => {
    return () => {
      cancelSmoothScroll()
    }
  }, [cancelSmoothScroll])

  return {
    handleWheel,
    cancelSmoothScroll
  }
}
