import { IpcChannel } from '@shared/IpcChannel'
import { renderHook } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const {
  mockCloseActiveTab,
  mockRemoveListener,
  mockOn,
  mockUseHotkeys,
  getLastIpcCallback,
  setLastIpcCallback,
  getLastHotkeyCallback,
  setLastHotkeyCallback
} = vi.hoisted(() => {
  let lastIpcCallback: (() => void) | undefined
  let lastHotkeyCallback: ((event: KeyboardEvent) => void) | undefined

  return {
    mockCloseActiveTab: vi.fn(),
    mockRemoveListener: vi.fn(),
    mockOn: vi.fn((_channel: string, callback: () => void) => {
      lastIpcCallback = callback
      return vi.fn()
    }),
    mockUseHotkeys: vi.fn((_keys: string, callback: (event: KeyboardEvent) => void) => {
      lastHotkeyCallback = callback
    }),
    getLastIpcCallback: () => lastIpcCallback,
    setLastIpcCallback: (callback: (() => void) | undefined) => {
      lastIpcCallback = callback
    },
    getLastHotkeyCallback: () => lastHotkeyCallback,
    setLastHotkeyCallback: (callback: ((event: KeyboardEvent) => void) | undefined) => {
      lastHotkeyCallback = callback
    }
  }
})

vi.mock('@renderer/config/constant', () => ({
  isMac: false
}))

vi.mock('react-hotkeys-hook', () => ({
  useHotkeys: mockUseHotkeys
}))

vi.mock('@renderer/services/TabsService', () => ({
  default: {
    closeActiveTab: mockCloseActiveTab
  }
}))

import { useCloseCurrentTabShortcut } from '../useCloseCurrentTabShortcut'

describe('useCloseCurrentTabShortcut', () => {
  beforeEach(() => {
    mockCloseActiveTab.mockClear()
    mockRemoveListener.mockClear()
    mockOn.mockClear()
    mockUseHotkeys.mockClear()
    setLastIpcCallback(undefined)
    setLastHotkeyCallback(undefined)

    mockOn.mockImplementation((_channel: string, callback: () => void) => {
      setLastIpcCallback(callback)
      return mockRemoveListener
    })

    mockUseHotkeys.mockImplementation((_keys: string, callback: (event: KeyboardEvent) => void) => {
      setLastHotkeyCallback(callback)
    })

    Object.defineProperty(window, 'electron', {
      configurable: true,
      value: {
        ipcRenderer: {
          on: mockOn
        },
        process: {
          platform: 'linux'
        }
      }
    })
  })

  it('registers the Ctrl+W hotkey and closes the active tab', () => {
    renderHook(() => useCloseCurrentTabShortcut())

    expect(mockUseHotkeys).toHaveBeenCalledWith(
      'ctrl+w',
      expect.any(Function),
      expect.objectContaining({ enabled: true, preventDefault: true, enableOnFormTags: true })
    )

    const event = { preventDefault: vi.fn() } as unknown as KeyboardEvent
    getLastHotkeyCallback()?.(event)

    expect(event.preventDefault).toHaveBeenCalledTimes(1)
    expect(mockCloseActiveTab).toHaveBeenCalledTimes(1)
  })

  it('subscribes to the close-current-tab IPC event and closes the active tab', () => {
    const { unmount } = renderHook(() => useCloseCurrentTabShortcut())

    expect(mockOn).toHaveBeenCalledWith(IpcChannel.Windows_CloseCurrentTab, expect.any(Function))

    getLastIpcCallback()?.()
    expect(mockCloseActiveTab).toHaveBeenCalledTimes(1)

    unmount()
    expect(mockRemoveListener).toHaveBeenCalledTimes(1)
  })
})
