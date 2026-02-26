import { loggerService } from '@logger'

const logger = loggerService.withContext('BackgroundSlideshowService')

const IMAGE_EXTENSIONS = new Set([
  '.jpg',
  '.jpeg',
  '.png',
  '.gif',
  '.webp',
  '.bmp',
  '.svg',
  '.avif',
  '.ico',
  '.tif',
  '.tiff',
  '.jfif',
  '.heic',
  '.heif'
])

const MIN_INTERVAL_SECONDS = 5
const DEFAULT_INTERVAL_SECONDS = 60
const MAX_DIRECTORY_ENTRIES = 200000
const MAX_DIRECTORY_DEPTH = 100

type BackgroundSlideshowListener = (currentUri: string | null) => void

export interface BackgroundSlideshowConfig {
  enabled: boolean
  intervalSeconds: number
  directories: string[]
  opacity: number
}

const areStringArraysEqual = (left: string[], right: string[]) => {
  if (left.length !== right.length) {
    return false
  }
  for (let index = 0; index < left.length; index++) {
    if (left[index] !== right[index]) {
      return false
    }
  }
  return true
}

class BackgroundSlideshowService {
  private config: BackgroundSlideshowConfig = {
    enabled: false,
    intervalSeconds: DEFAULT_INTERVAL_SECONDS,
    directories: [],
    opacity: 1
  }

  private refreshPromise: Promise<void> | null = null
  private timer: ReturnType<typeof setInterval> | null = null
  private currentImageUri: string | null = null
  private imageCandidates: string[] = []
  private listeners = new Set<BackgroundSlideshowListener>()
  private containerObserver: MutationObserver | null = null

  public async configure(config: BackgroundSlideshowConfig) {
    const normalizedDirectories = [...new Set(config.directories.map((dir) => dir.trim()).filter(Boolean))]
    const normalizedConfig: BackgroundSlideshowConfig = {
      enabled: config.enabled,
      intervalSeconds: Number.isFinite(config.intervalSeconds)
        ? Math.max(MIN_INTERVAL_SECONDS, Math.floor(config.intervalSeconds))
        : DEFAULT_INTERVAL_SECONDS,
      directories: normalizedDirectories,
      opacity: Number.isFinite(config.opacity) ? Math.min(1, Math.max(0, config.opacity)) : 1
    }

    const directoriesChanged = !areStringArraysEqual(this.config.directories, normalizedConfig.directories)
    const enabledChanged = this.config.enabled !== normalizedConfig.enabled
    const intervalChanged = this.config.intervalSeconds !== normalizedConfig.intervalSeconds
    const opacityChanged = this.config.opacity !== normalizedConfig.opacity
    this.config = normalizedConfig

    if (!this.config.enabled || this.config.directories.length === 0) {
      this.stopTimer()
      this.disconnectContainerObserver()
      this.currentImageUri = null
      this.imageCandidates = []
      this.applyCurrentImage()
      this.notifyListeners()
      return
    }

    this.observeContentContainer()

    if (directoriesChanged || enabledChanged || this.imageCandidates.length === 0) {
      await this.refreshImageCandidates()
    }

    if (!this.currentImageUri || !this.imageCandidates.includes(this.currentImageUri)) {
      await this.nextImage()
    } else {
      this.applyCurrentImage()
      this.notifyListeners()
    }

    if (enabledChanged || intervalChanged || directoriesChanged) {
      this.startTimer()
      return
    }

    if (opacityChanged) {
      this.applyCurrentImage()
      this.notifyListeners()
    }
  }

  public getCurrentImageUri() {
    return this.currentImageUri
  }

  public async nextImage() {
    if (!this.config.enabled || this.config.directories.length === 0) {
      return null
    }

    if (this.imageCandidates.length === 0) {
      await this.refreshImageCandidates()
    }

    if (this.imageCandidates.length === 0) {
      this.currentImageUri = null
      this.applyCurrentImage()
      this.notifyListeners()
      return null
    }

    this.currentImageUri = this.pickRandomImageUri()
    this.applyCurrentImage()
    this.notifyListeners()
    return this.currentImageUri
  }

  public subscribe(listener: BackgroundSlideshowListener) {
    this.listeners.add(listener)
    listener(this.currentImageUri)
    return () => {
      this.listeners.delete(listener)
    }
  }

  private startTimer() {
    this.stopTimer()
    this.timer = setInterval(() => {
      void this.nextImage()
    }, this.config.intervalSeconds * 1000)
  }

  private stopTimer() {
    if (this.timer) {
      clearInterval(this.timer)
      this.timer = null
    }
  }

  private observeContentContainer() {
    if (this.containerObserver) {
      return
    }

    this.containerObserver = new MutationObserver(() => {
      this.applyCurrentImage()
    })

    this.containerObserver.observe(document.body, {
      childList: true,
      subtree: true
    })
  }

  private disconnectContainerObserver() {
    if (!this.containerObserver) {
      return
    }
    this.containerObserver.disconnect()
    this.containerObserver = null
  }

  private async refreshImageCandidates() {
    if (this.refreshPromise) {
      await this.refreshPromise
      return
    }

    this.refreshPromise = (async () => {
      const directoryTasks = this.config.directories.map(async (directory) => {
        try {
          return await window.api.file.listDirectory(directory, {
            recursive: true,
            maxDepth: MAX_DIRECTORY_DEPTH,
            includeHidden: false,
            includeFiles: true,
            includeDirectories: false,
            maxEntries: MAX_DIRECTORY_ENTRIES,
            searchPattern: '.'
          })
        } catch (error) {
          logger.warn(`Failed to list directory for slideshow: ${directory}`, error as Error)
          return []
        }
      })

      const results = await Promise.all(directoryTasks)
      const allFilePaths = results.flat()
      const imageCandidates = [
        ...new Set(allFilePaths.filter((path) => this.isImagePath(path)).map((filePath) => this.toFileUri(filePath)))
      ]
      this.imageCandidates = imageCandidates
      logger.info('Background slideshow refreshed image candidates', {
        directories: this.config.directories.length,
        files: allFilePaths.length,
        images: imageCandidates.length
      })
    })()

    try {
      await this.refreshPromise
    } finally {
      this.refreshPromise = null
    }
  }

  private isImagePath(filePath: string) {
    const normalizedPath = filePath.split('?')[0].split('#')[0].toLowerCase()
    const extensionIndex = normalizedPath.lastIndexOf('.')
    if (extensionIndex === -1) {
      return false
    }
    return IMAGE_EXTENSIONS.has(normalizedPath.slice(extensionIndex))
  }

  private toFileUri(filePath: string) {
    if (filePath.startsWith('file://')) {
      return filePath
    }

    const normalizedPath = filePath.replace(/\\/g, '/')
    const isWindowsPath = /^[a-zA-Z]:\//.test(normalizedPath)
    const fileUrl = isWindowsPath ? `file:///${normalizedPath}` : `file://${normalizedPath}`
    return encodeURI(fileUrl)
  }

  private pickRandomImageUri() {
    if (this.imageCandidates.length === 1) {
      return this.imageCandidates[0]
    }

    const candidates = this.imageCandidates.filter((uri) => uri !== this.currentImageUri)
    if (candidates.length === 0) {
      return this.imageCandidates[0]
    }
    const randomIndex = Math.floor(Math.random() * candidates.length)
    return candidates[randomIndex]
  }

  private applyCurrentImage() {
    const containers = document.querySelectorAll<HTMLElement>('#content-container')
    containers.forEach((container) => {
      if (this.currentImageUri) {
        const safeImageUri = this.currentImageUri.replace(/"/g, '\\"')
        const overlayPercent = Math.round((1 - this.config.opacity) * 100)
        const overlayColor = `color-mix(in srgb, var(--color-background) ${overlayPercent}%, transparent)`
        const backgroundImage =
          overlayPercent > 0
            ? `linear-gradient(${overlayColor}, ${overlayColor}), url("${safeImageUri}")`
            : `url("${safeImageUri}")`
        container.style.setProperty('background-image', backgroundImage, 'important')
        container.style.setProperty('background-size', 'cover', 'important')
        container.style.setProperty('background-position', 'center center', 'important')
        container.style.setProperty('background-repeat', 'no-repeat', 'important')
      } else {
        container.style.removeProperty('background-image')
        container.style.removeProperty('background-size')
        container.style.removeProperty('background-position')
        container.style.removeProperty('background-repeat')
      }
    })
  }

  private notifyListeners() {
    this.listeners.forEach((listener) => {
      try {
        listener(this.currentImageUri)
      } catch (error) {
        logger.warn('Failed to notify background slideshow listener', error as Error)
      }
    })
  }
}

export const backgroundSlideshowService = new BackgroundSlideshowService()
