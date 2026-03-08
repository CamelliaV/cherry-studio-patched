type DirectoryRipgrepOptions = {
  recursive: boolean
  maxDepth: number
  includeHidden: boolean
  followSymlinks: boolean
}

export function buildDirectoryListRipgrepArgs(options: DirectoryRipgrepOptions, resolvedPath: string): string[] {
  const args: string[] = ['--files']

  if (options.followSymlinks) {
    args.push('-L')
  }

  if (!options.includeHidden) {
    args.push('--glob', '!.*')
  }

  args.push('-g', '!**/node_modules/**')
  args.push('-g', '!**/.git/**')
  args.push('-g', '!**/.idea/**')
  args.push('-g', '!**/.vscode/**')
  args.push('-g', '!**/.DS_Store')
  args.push('-g', '!**/dist/**')
  args.push('-g', '!**/build/**')
  args.push('-g', '!**/.next/**')
  args.push('-g', '!**/.nuxt/**')
  args.push('-g', '!**/coverage/**')
  args.push('-g', '!**/.cache/**')

  if (!options.recursive) {
    args.push('--max-depth', '1')
  } else if (options.maxDepth > 0) {
    args.push('--max-depth', options.maxDepth.toString())
  }

  args.push(resolvedPath)

  return args
}

type FilenameSearchRipgrepOptions = DirectoryRipgrepOptions & {
  searchPattern: string
}

export function buildFilenameSearchRipgrepArgs(
  options: FilenameSearchRipgrepOptions,
  resolvedPath: string
): string[] {
  const args = buildDirectoryListRipgrepArgs(options, resolvedPath)

  if (options.searchPattern && options.searchPattern !== '.') {
    args.splice(args.length - 1, 0, '--iglob', `*${options.searchPattern}*`)
  }

  return args
}
