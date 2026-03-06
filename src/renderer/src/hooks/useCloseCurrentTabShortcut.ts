import { isMac } from '@renderer/config/constant'
import TabsService from '@renderer/services/TabsService'
import { IpcChannel } from '@shared/IpcChannel'
import { useEffect } from 'react'
import { useHotkeys } from 'react-hotkeys-hook'

export function useCloseCurrentTabShortcut() {
  useHotkeys(
    isMac ? 'none' : 'ctrl+w',
    (event) => {
      if (event.defaultPrevented) {
        return
      }

      event.preventDefault()
      TabsService.closeActiveTab()
    },
    {
      enableOnFormTags: true,
      enableOnContentEditable: true,
      preventDefault: true,
      enabled: !isMac
    }
  )

  useEffect(() => {
    const removeListener = window.electron.ipcRenderer.on(IpcChannel.Windows_CloseCurrentTab, () => {
      TabsService.closeActiveTab()
    })

    return () => {
      removeListener()
    }
  }, [])
}
