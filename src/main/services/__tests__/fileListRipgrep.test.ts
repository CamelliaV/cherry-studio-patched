import { describe, expect, it } from 'vitest'

import { buildDirectoryListRipgrepArgs, buildFilenameSearchRipgrepArgs } from '../fileListRipgrep'

describe('buildDirectoryListRipgrepArgs', () => {
  it('adds the follow-symlinks flag when requested', () => {
    const args = buildDirectoryListRipgrepArgs(
      {
        recursive: true,
        maxDepth: 10,
        includeHidden: false,
        followSymlinks: true
      },
      '/images'
    )

    expect(args).toContain('-L')
  })

  it('does not follow symlinks by default', () => {
    const args = buildDirectoryListRipgrepArgs(
      {
        recursive: true,
        maxDepth: 10,
        includeHidden: false,
        followSymlinks: false
      },
      '/images'
    )

    expect(args).not.toContain('-L')
  })

  it('preserves symlink traversal for filename search args', () => {
    const args = buildFilenameSearchRipgrepArgs(
      {
        recursive: true,
        maxDepth: 10,
        includeHidden: false,
        followSymlinks: true,
        searchPattern: '.'
      },
      '/images'
    )

    expect(args).toContain('-L')
  })

  it('adds an iglob before the search path when filtering filenames', () => {
    const args = buildFilenameSearchRipgrepArgs(
      {
        recursive: true,
        maxDepth: 10,
        includeHidden: false,
        followSymlinks: true,
        searchPattern: 'cat'
      },
      '/images'
    )

    expect(args).toContain('--iglob')
    expect(args).toContain('*cat*')
    expect(args.at(-1)).toBe('/images')
  })
})
