export type HostStorageOptions = {
  discoverDockerRoot?: boolean
  discoverPnpmStore?: boolean
  worktreePath: string
}

export type HostStorageOutput = {
  error(message: string): void
  log(message: string): void
}

export function parseHostStorageCliArguments(args: string[]) {
  const worktreeIndex = args.indexOf('--worktree')
  const worktreePath = worktreeIndex < 0 ? '' : (args[worktreeIndex + 1] ?? '')
  const valid = new Set(['--worktree', '--pnpm-store', '--docker-root'])
  const unknown = args.find((arg, index) => index !== worktreeIndex + 1 && !valid.has(arg))
  if (unknown) throw new Error(`unknown argument: ${unknown}`)
  if (!worktreePath || worktreePath.startsWith('--')) throw new Error('--worktree requires a path')
  return {
    discoverDockerRoot: args.includes('--docker-root'),
    discoverPnpmStore: args.includes('--pnpm-store'),
    worktreePath,
  }
}
