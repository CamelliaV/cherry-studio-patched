import { act, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import {
  type ConversationPanelLifecycleInput,
  type SystemMemorySnapshot,
  useConversationPanelLifecycle
} from '../useConversationPanelLifecycle'

describe('useConversationPanelLifecycle', () => {
  const panels: ConversationPanelLifecycleInput[] = [
    { id: 'assistant-1:topic-1', isActive: true },
    { id: 'assistant-1:topic-2', isActive: false },
    { id: 'assistant-1:topic-3', isActive: false }
  ]

  let memorySnapshot: SystemMemorySnapshot
  const getSystemMemorySnapshot = vi.fn(async () => memorySnapshot)

  beforeEach(() => {
    vi.useFakeTimers()
    memorySnapshot = {
      totalBytes: 100,
      availableBytes: 32,
      availableRatio: 0.32
    }
    getSystemMemorySnapshot.mockClear()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('keeps the active panel active and inactive panels warm by default', async () => {
    const { result } = renderHook(() =>
      useConversationPanelLifecycle({
        panels,
        getSystemMemorySnapshot,
        pollIntervalMs: 1_000
      })
    )

    await act(async () => {
      await Promise.resolve()
    })

    expect(result.current.panels).toEqual([
      expect.objectContaining({ id: 'assistant-1:topic-1', lifecycle: 'active', shouldMount: true }),
      expect.objectContaining({ id: 'assistant-1:topic-2', lifecycle: 'warm', shouldMount: true }),
      expect.objectContaining({ id: 'assistant-1:topic-3', lifecycle: 'warm', shouldMount: true })
    ])
  })

  it('starts cooling inactive panels only below the memory-pressure threshold', async () => {
    memorySnapshot = {
      totalBytes: 100,
      availableBytes: 12,
      availableRatio: 0.12
    }

    const { result } = renderHook(() =>
      useConversationPanelLifecycle({
        panels,
        getSystemMemorySnapshot,
        pollIntervalMs: 1_000
      })
    )

    await act(async () => {
      await Promise.resolve()
    })

    expect(result.current.isCooling).toBe(false)

    memorySnapshot = {
      totalBytes: 100,
      availableBytes: 9,
      availableRatio: 0.09
    }

    await act(async () => {
      vi.advanceTimersByTime(1_000)
      await Promise.resolve()
    })

    expect(result.current.isCooling).toBe(true)
    expect(result.current.panels).toEqual([
      expect.objectContaining({ id: 'assistant-1:topic-1', lifecycle: 'active', shouldMount: true }),
      expect.objectContaining({ id: 'assistant-1:topic-2', lifecycle: 'cold', shouldMount: false }),
      expect.objectContaining({ id: 'assistant-1:topic-3', lifecycle: 'cold', shouldMount: false })
    ])
  })

  it('keeps panels cold until memory recovers above the warm threshold', async () => {
    memorySnapshot = {
      totalBytes: 100,
      availableBytes: 9,
      availableRatio: 0.09
    }

    const { result } = renderHook(() =>
      useConversationPanelLifecycle({
        panels,
        getSystemMemorySnapshot,
        pollIntervalMs: 1_000
      })
    )

    await act(async () => {
      await Promise.resolve()
    })

    expect(result.current.isCooling).toBe(true)

    memorySnapshot = {
      totalBytes: 100,
      availableBytes: 12,
      availableRatio: 0.12
    }

    await act(async () => {
      vi.advanceTimersByTime(1_000)
      await Promise.resolve()
    })

    expect(result.current.isCooling).toBe(true)
    expect(result.current.panels[1]).toEqual(
      expect.objectContaining({ id: 'assistant-1:topic-2', lifecycle: 'cold', shouldMount: false })
    )

    memorySnapshot = {
      totalBytes: 100,
      availableBytes: 16,
      availableRatio: 0.16
    }

    await act(async () => {
      vi.advanceTimersByTime(1_000)
      await Promise.resolve()
    })

    expect(result.current.isCooling).toBe(false)
    expect(result.current.panels[1]).toEqual(
      expect.objectContaining({ id: 'assistant-1:topic-2', lifecycle: 'warm', shouldMount: true })
    )
  })
})
