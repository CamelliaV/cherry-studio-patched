import { beforeEach, describe, expect, it, vi } from 'vitest'

const { mockDispatch, mockNavigate, mockRemoveTab, mockSetActiveTab, getMockState, setMockState } = vi.hoisted(() => {
  let mockState = {
    tabs: {
      tabs: [
        { id: 'home', path: '/' },
        { id: 'notes', path: '/notes' }
      ],
      activeTabId: 'notes'
    }
  }

  return {
    mockDispatch: vi.fn(),
    mockNavigate: vi.fn(),
    mockRemoveTab: vi.fn((tabId: string) => ({ type: 'tabs/removeTab', payload: tabId })),
    mockSetActiveTab: vi.fn((tabId: string) => ({ type: 'tabs/setActiveTab', payload: tabId })),
    getMockState: () => mockState,
    setMockState: (nextState: typeof mockState) => {
      mockState = nextState
    }
  }
})

vi.mock('@logger', () => ({
  loggerService: {
    withContext: () => ({
      debug: vi.fn(),
      info: vi.fn(),
      warn: vi.fn()
    })
  }
}))

vi.mock('@renderer/store', () => ({
  default: {
    getState: () => getMockState(),
    dispatch: mockDispatch
  }
}))

vi.mock('@renderer/store/tabs', () => ({
  removeTab: mockRemoveTab,
  setActiveTab: mockSetActiveTab
}))

vi.mock('@renderer/utils/webviewStateManager', () => ({
  clearWebviewState: vi.fn()
}))

vi.mock('../NavigationService', () => ({
  default: {
    navigate: mockNavigate
  }
}))

import TabsService from '../TabsService'

describe('TabsService.closeActiveTab', () => {
  beforeEach(() => {
    setMockState({
      tabs: {
        tabs: [
          { id: 'home', path: '/' },
          { id: 'notes', path: '/notes' }
        ],
        activeTabId: 'notes'
      }
    })

    mockDispatch.mockClear()
    mockNavigate.mockClear()
    mockRemoveTab.mockClear()
    mockSetActiveTab.mockClear()
  })

  it('closes the active tab and navigates to the previous remaining tab', () => {
    expect(TabsService.closeActiveTab()).toBe(true)

    expect(mockSetActiveTab).toHaveBeenCalledWith('home')
    expect(mockRemoveTab).toHaveBeenCalledWith('notes')
    expect(mockNavigate).toHaveBeenCalledWith('/')
    expect(mockDispatch).toHaveBeenCalledTimes(2)
  })

  it('does not close the last remaining tab', () => {
    setMockState({
      tabs: {
        tabs: [{ id: 'home', path: '/' }],
        activeTabId: 'home'
      }
    })

    expect(TabsService.closeActiveTab()).toBe(false)

    expect(mockSetActiveTab).not.toHaveBeenCalled()
    expect(mockRemoveTab).not.toHaveBeenCalled()
    expect(mockNavigate).not.toHaveBeenCalled()
    expect(mockDispatch).not.toHaveBeenCalled()
  })
})
