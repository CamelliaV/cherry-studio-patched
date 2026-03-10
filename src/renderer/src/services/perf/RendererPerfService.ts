type TimingSample = {
  name: string
  duration: number
  timestamp: number
}

type LongTaskSample = {
  name: string
  duration: number
  startTime: number
}

type MemorySnapshot = {
  usedJSHeapSize: number
  totalJSHeapSize: number
  jsHeapSizeLimit: number
}

export interface RendererPerfSnapshot {
  timings: TimingSample[]
  longTasks: LongTaskSample[]
  memory?: MemorySnapshot
}

const MAX_TIMINGS = 100
const MAX_LONG_TASKS = 100

const supportsLongTaskObserver = () =>
  typeof PerformanceObserver === 'function' &&
  Array.isArray((PerformanceObserver as typeof PerformanceObserver & { supportedEntryTypes?: string[] }).supportedEntryTypes) &&
  ((PerformanceObserver as typeof PerformanceObserver & { supportedEntryTypes?: string[] }).supportedEntryTypes || []).includes(
    'longtask'
  )

const getPerformanceMemory = (): MemorySnapshot | undefined => {
  const memory = (performance as Performance & {
    memory?: MemorySnapshot
  }).memory

  if (!memory) {
    return undefined
  }

  return {
    usedJSHeapSize: memory.usedJSHeapSize,
    totalJSHeapSize: memory.totalJSHeapSize,
    jsHeapSizeLimit: memory.jsHeapSizeLimit
  }
}

class RendererPerfService {
  private static instance: RendererPerfService | null = null

  private readonly timings: TimingSample[] = []
  private readonly longTasks: LongTaskSample[] = []
  private observer: PerformanceObserver | null = null

  static getInstance() {
    if (!RendererPerfService.instance) {
      RendererPerfService.instance = new RendererPerfService()
    }

    return RendererPerfService.instance
  }

  start() {
    if (this.observer || !supportsLongTaskObserver()) {
      return
    }

    this.observer = new PerformanceObserver((list) => {
      list.getEntries().forEach((entry) => {
        this.longTasks.push({
          name: entry.name,
          duration: entry.duration,
          startTime: entry.startTime
        })

        if (this.longTasks.length > MAX_LONG_TASKS) {
          this.longTasks.splice(0, this.longTasks.length - MAX_LONG_TASKS)
        }
      })
    })

    this.observer.observe({ entryTypes: ['longtask'] })
  }

  stop() {
    this.observer?.disconnect()
    this.observer = null
  }

  reset() {
    this.stop()
    this.timings.length = 0
    this.longTasks.length = 0
  }

  recordTiming(name: string, duration: number) {
    this.timings.push({
      name,
      duration,
      timestamp: Date.now()
    })

    if (this.timings.length > MAX_TIMINGS) {
      this.timings.splice(0, this.timings.length - MAX_TIMINGS)
    }
  }

  getSnapshot(): RendererPerfSnapshot {
    return {
      timings: [...this.timings],
      longTasks: [...this.longTasks],
      memory: getPerformanceMemory()
    }
  }
}

export const rendererPerfService = RendererPerfService.getInstance()
