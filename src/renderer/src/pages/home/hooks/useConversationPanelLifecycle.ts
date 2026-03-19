import { loggerService } from '@logger'
import { useEffect, useMemo, useState } from 'react'

const logger = loggerService.withContext('useConversationPanelLifecycle')

const DEFAULT_COOLING_THRESHOLD_RATIO = 0.1
const DEFAULT_WARMING_THRESHOLD_RATIO = 0.15
const DEFAULT_POLL_INTERVAL_MS = 10_000

export type ConversationPanelLifecycleState = 'active' | 'warm' | 'cold'

export interface ConversationPanelLifecycleInput {
  id: string
  isActive: boolean
}

export interface ConversationPanelLifecyclePanel extends ConversationPanelLifecycleInput {
  lifecycle: ConversationPanelLifecycleState
  shouldMount: boolean
  isInteractive: boolean
}

export interface SystemMemorySnapshot {
  totalBytes: number
  availableBytes: number
  availableRatio: number
}

interface UseConversationPanelLifecycleOptions<T extends ConversationPanelLifecycleInput> {
  panels: T[]
  enabled?: boolean
  coolingThresholdRatio?: number
  warmingThresholdRatio?: number
  pollIntervalMs?: number
  getSystemMemorySnapshot?: () => Promise<SystemMemorySnapshot | null | undefined>
}

interface UseConversationPanelLifecycleResult<T extends ConversationPanelLifecycleInput> {
  isCooling: boolean
  memorySnapshot?: SystemMemorySnapshot
  panels: Array<T & ConversationPanelLifecyclePanel>
}

const getDefaultSystemMemorySnapshot = async (): Promise<SystemMemorySnapshot | null> => {
  const getMemoryInfo = window.api?.system?.getMemoryInfo
  if (typeof getMemoryInfo !== 'function') {
    return null
  }

  return getMemoryInfo()
}

const resolveCoolingState = (
  currentValue: boolean,
  availableRatio: number,
  coolingThresholdRatio: number,
  warmingThresholdRatio: number
) => {
  if (!Number.isFinite(availableRatio)) {
    return currentValue
  }

  if (currentValue) {
    return availableRatio <= warmingThresholdRatio
  }

  return availableRatio < coolingThresholdRatio
}

export function useConversationPanelLifecycle<T extends ConversationPanelLifecycleInput>({
  panels,
  enabled = true,
  coolingThresholdRatio = DEFAULT_COOLING_THRESHOLD_RATIO,
  warmingThresholdRatio = DEFAULT_WARMING_THRESHOLD_RATIO,
  pollIntervalMs = DEFAULT_POLL_INTERVAL_MS,
  getSystemMemorySnapshot = getDefaultSystemMemorySnapshot
}: UseConversationPanelLifecycleOptions<T>): UseConversationPanelLifecycleResult<T> {
  const [isCooling, setIsCooling] = useState(false)
  const [memorySnapshot, setMemorySnapshot] = useState<SystemMemorySnapshot>()

  useEffect(() => {
    if (!enabled || panels.length <= 1) {
      setIsCooling(false)
      return
    }

    let cancelled = false

    const refreshMemorySnapshot = async () => {
      try {
        const snapshot = await getSystemMemorySnapshot()
        if (cancelled || !snapshot) {
          return
        }

        setMemorySnapshot(snapshot)
        setIsCooling((currentValue) =>
          resolveCoolingState(currentValue, snapshot.availableRatio, coolingThresholdRatio, warmingThresholdRatio)
        )
      } catch (error) {
        if (!cancelled) {
          logger.warn(
            'Failed to refresh system memory snapshot',
            error instanceof Error ? error : { error }
          )
        }
      }
    }

    void refreshMemorySnapshot()

    const intervalId = window.setInterval(() => {
      void refreshMemorySnapshot()
    }, pollIntervalMs)

    return () => {
      cancelled = true
      window.clearInterval(intervalId)
    }
  }, [coolingThresholdRatio, enabled, getSystemMemorySnapshot, panels.length, pollIntervalMs, warmingThresholdRatio])

  const lifecyclePanels = useMemo(
    () =>
      panels.map((panel) => {
        const lifecycle: ConversationPanelLifecycleState = panel.isActive ? 'active' : isCooling ? 'cold' : 'warm'

        return {
          ...panel,
          lifecycle,
          shouldMount: lifecycle !== 'cold',
          isInteractive: lifecycle === 'active'
        }
      }),
    [isCooling, panels]
  )

  return {
    isCooling,
    memorySnapshot,
    panels: lifecyclePanels
  }
}
