import { isDev } from '@renderer/config/constant'
import { rendererPerfService } from '@renderer/services/perf/RendererPerfService'
import { useEffect } from 'react'

export const useRendererPerfMonitor = (enabled = isDev) => {
  useEffect(() => {
    if (!enabled) {
      return
    }

    rendererPerfService.start()

    return () => {
      rendererPerfService.stop()
    }
  }, [enabled])

  return rendererPerfService
}
