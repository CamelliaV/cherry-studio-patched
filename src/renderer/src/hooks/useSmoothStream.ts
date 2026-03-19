import { useCallback, useEffect, useRef } from 'react'

interface UseSmoothStreamOptions {
  onUpdate: (text: string) => void
  streamDone: boolean
  minDelay?: number
  initialText?: string
}

const languages = ['en-US', 'de-DE', 'es-ES', 'zh-CN', 'zh-TW', 'ja-JP', 'ru-RU', 'el-GR', 'fr-FR', 'pt-PT', 'ro-RO']
const segmenter = new Intl.Segmenter(languages)

export const useSmoothStream = ({ onUpdate, streamDone, minDelay = 10, initialText = '' }: UseSmoothStreamOptions) => {
  const chunkQueueRef = useRef<string[]>([])
  const animationFrameRef = useRef<number | null>(null)
  const displayedTextRef = useRef<string>(initialText)
  const lastUpdateTimeRef = useRef<number>(0)

  // Keep mutable refs for values that change frequently so that renderLoop
  // does not need to be recreated (and the useEffect does not restart the
  // rAF chain) on every React re-render.
  const onUpdateRef = useRef(onUpdate)
  onUpdateRef.current = onUpdate
  const streamDoneRef = useRef(streamDone)
  streamDoneRef.current = streamDone
  const minDelayRef = useRef(minDelay)
  minDelayRef.current = minDelay

  const addChunk = useCallback((chunk: string) => {
    const chars = Array.from(segmenter.segment(chunk)).map((s) => s.segment)
    chunkQueueRef.current.push(...chars)
  }, [])

  // renderLoop has no deps that change during streaming, so the useEffect
  // below only sets up a *single* rAF chain for the component's lifetime.
  const renderLoop = useCallback((currentTime: number) => {
    const done = streamDoneRef.current
    const queue = chunkQueueRef.current

    // 1. Queue empty
    if (queue.length === 0) {
      if (done) {
        // Stream finished — flush final text and stop.
        onUpdateRef.current(displayedTextRef.current)
        return
      }
      // Stream still active but nothing queued yet — wait for next frame.
      animationFrameRef.current = requestAnimationFrame(renderLoop)
      return
    }

    // 2. Enforce minimum delay between updates
    if (currentTime - lastUpdateTimeRef.current < minDelayRef.current) {
      animationFrameRef.current = requestAnimationFrame(renderLoop)
      return
    }
    lastUpdateTimeRef.current = currentTime

    // 3. Calculate how many characters to render this frame
    let charsToRenderCount = Math.max(1, Math.floor(queue.length / 5))

    // If stream is done, flush everything at once
    if (done) {
      charsToRenderCount = queue.length
    }

    const charsToRender = queue.slice(0, charsToRenderCount)
    displayedTextRef.current += charsToRender.join('')

    // 4. Update UI
    onUpdateRef.current(displayedTextRef.current)

    // 5. Advance the queue
    chunkQueueRef.current = queue.slice(charsToRenderCount)

    // 6. Continue the loop while content remains or stream is still active
    if (chunkQueueRef.current.length > 0 || !done) {
      animationFrameRef.current = requestAnimationFrame(renderLoop)
    }
  }, [])

  const reset = useCallback((newText = '') => {
    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current)
    }
    chunkQueueRef.current = []
    displayedTextRef.current = newText
    onUpdateRef.current(newText)
  }, [])

  useEffect(() => {
    animationFrameRef.current = requestAnimationFrame(renderLoop)

    return () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current)
      }
    }
  }, [renderLoop])

  return { addChunk, reset }
}
