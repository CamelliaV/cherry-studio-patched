import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

type ObserverCallback = (list: { getEntries: () => PerformanceEntry[] }) => void

const mocks = vi.hoisted(() => ({
  observe: vi.fn(),
  disconnect: vi.fn(),
  callback: null as ObserverCallback | null
}))

describe('RendererPerfService', () => {
  beforeEach(() => {
    mocks.observe.mockClear()
    mocks.disconnect.mockClear()
    mocks.callback = null

    class MockPerformanceObserver {
      static supportedEntryTypes = ['longtask']

      constructor(callback: ObserverCallback) {
        mocks.callback = callback
      }

      observe = mocks.observe
      disconnect = mocks.disconnect
    }

    vi.stubGlobal('PerformanceObserver', MockPerformanceObserver)
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('records timings and long tasks into a snapshot', async () => {
    const { rendererPerfService } = await import('../RendererPerfService')

    rendererPerfService.reset()
    rendererPerfService.start()
    rendererPerfService.recordTiming('tab-switch', 18)

    mocks.callback?.({
      getEntries: () =>
        [
          {
            name: 'self',
            entryType: 'longtask',
            startTime: 120,
            duration: 48
          } as PerformanceEntry
        ]
    })

    const snapshot = rendererPerfService.getSnapshot()

    expect(mocks.observe).toHaveBeenCalledWith({ entryTypes: ['longtask'] })
    expect(snapshot.timings).toEqual([
      expect.objectContaining({
        name: 'tab-switch',
        duration: 18
      })
    ])
    expect(snapshot.longTasks).toEqual([
      expect.objectContaining({
        duration: 48,
        startTime: 120
      })
    ])
  })

  it('returns a snapshot even when performance memory is unavailable', async () => {
    const { rendererPerfService } = await import('../RendererPerfService')

    rendererPerfService.reset()

    const snapshot = rendererPerfService.getSnapshot()

    expect(snapshot.memory).toBeUndefined()
    expect(snapshot.timings).toEqual([])
    expect(snapshot.longTasks).toEqual([])
  })
})
