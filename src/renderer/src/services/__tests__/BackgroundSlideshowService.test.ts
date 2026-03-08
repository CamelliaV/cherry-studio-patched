import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { backgroundSlideshowService } from '../BackgroundSlideshowService'

const mocks = vi.hoisted(() => ({
  listDirectory: vi.fn()
}))

describe('BackgroundSlideshowService', () => {
  beforeEach(async () => {
    mocks.listDirectory.mockReset().mockResolvedValue([])

    window.api = {
      ...(window.api ?? {}),
      file: {
        ...(window.api?.file ?? {}),
        listDirectory: mocks.listDirectory
      }
    } as any

    await backgroundSlideshowService.configure({
      enabled: false,
      intervalSeconds: 60,
      directories: [],
      opacity: 1
    })
  })

  afterEach(async () => {
    await backgroundSlideshowService.configure({
      enabled: false,
      intervalSeconds: 60,
      directories: [],
      opacity: 1
    })
  })

  it('requests slideshow directories with symlink traversal enabled', async () => {
    await backgroundSlideshowService.configure({
      enabled: true,
      intervalSeconds: 60,
      directories: ['/images'],
      opacity: 1
    })

    expect(mocks.listDirectory).toHaveBeenCalledWith(
      '/images',
      expect.objectContaining({
        recursive: true,
        maxDepth: 100,
        includeHidden: false,
        includeFiles: true,
        includeDirectories: false,
        maxEntries: 200000,
        searchPattern: '.',
        followSymlinks: true
      })
    )
  })
})
