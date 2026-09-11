import { describe, expect, it } from 'vitest'

import {
  HOST_STORAGE_MINIMUM_FREE_BYTES,
  inspectHostStorage,
  runHostStoragePreflightCli,
  type HostStorageDependencies,
} from './host-storage-preflight.mts'

type FakeFilesystem = {
  availableBytes: bigint
  device: bigint
}

function makeDependencies({
  commandResults = new Map<string, Error | string>(),
  filesystems = new Map<string, FakeFilesystem>(),
  home = '/home/developer',
  platform = 'linux',
  realpathFailures = new Set<string>(),
  statFailures = new Set<string>(),
  statfsFailures = new Set<string>(),
  temporaryDirectory = '/tmp',
}: {
  commandResults?: Map<string, Error | string>
  filesystems?: Map<string, FakeFilesystem>
  home?: string
  platform?: NodeJS.Platform
  realpathFailures?: Set<string>
  statFailures?: Set<string>
  statfsFailures?: Set<string>
  temporaryDirectory?: string
} = {}) {
  const commandCalls: { args: string[]; command: string; timeout: number | undefined }[] = []
  const statfsCalls: string[] = []

  const dependencies: HostStorageDependencies = {
    execFile: async (command, args, options) => {
      commandCalls.push({ args, command, timeout: options.timeout })
      const result = commandResults.get(`${command} ${args.join(' ')}`)
      if (result instanceof Error) {
        throw result
      }
      if (result === undefined) {
        throw new Error(`unexpected command: ${command} ${args.join(' ')}`)
      }
      return { stdout: result }
    },
    homedir: () => home,
    platform,
    realpath: async path => {
      if (realpathFailures.has(path)) {
        throw new Error(`cannot resolve ${path}`)
      }
      return path
    },
    stat: async path => {
      if (statFailures.has(path)) {
        throw new Error(`cannot stat ${path}`)
      }
      const filesystem = filesystems.get(path)
      if (!filesystem) {
        throw new Error(`missing fake filesystem for ${path}`)
      }
      return { dev: filesystem.device }
    },
    statfs: async path => {
      statfsCalls.push(path)
      if (statfsFailures.has(path)) {
        throw new Error(`cannot statfs ${path}`)
      }
      const filesystem = filesystems.get(path)
      if (!filesystem) {
        throw new Error(`missing fake filesystem for ${path}`)
      }
      return { bavail: filesystem.availableBytes, bsize: 1n }
    },
    tmpdir: () => temporaryDirectory,
  }

  return { commandCalls, dependencies, statfsCalls }
}

describe('host storage preflight', () => {
  it('uses a fixed 5 GiB floor and accepts exact equality', async () => {
    expect(HOST_STORAGE_MINIMUM_FREE_BYTES).toBe(5n * 1024n ** 3n)
    const filesystems = new Map([
      ['/repo', { availableBytes: HOST_STORAGE_MINIMUM_FREE_BYTES, device: 1n }],
      ['/home/developer', { availableBytes: HOST_STORAGE_MINIMUM_FREE_BYTES, device: 2n }],
      ['/tmp', { availableBytes: HOST_STORAGE_MINIMUM_FREE_BYTES, device: 2n }],
    ])
    const { dependencies } = makeDependencies({ filesystems })

    const result = await inspectHostStorage({ worktreePath: '/repo' }, dependencies)

    expect(result.ok).toBe(true)
    expect(result.issues).toEqual([])
  })

  it('checks the worktree, home, and temporary paths and deduplicates by device', async () => {
    const availableBytes = HOST_STORAGE_MINIMUM_FREE_BYTES + 1n
    const filesystems = new Map([
      ['/repo', { availableBytes, device: 1n }],
      ['/home/developer', { availableBytes, device: 2n }],
      ['/tmp', { availableBytes, device: 2n }],
    ])
    const { dependencies, statfsCalls } = makeDependencies({ filesystems })

    const result = await inspectHostStorage({ worktreePath: '/repo' }, dependencies)

    expect(result.ok).toBe(true)
    expect(statfsCalls).toEqual(['/repo', '/home/developer'])
    expect(result.filesystems).toHaveLength(2)
    expect(result.filesystems[1]?.labels).toEqual(['home directory', 'temporary directory'])
  })

  it('deduplicates recovery guidance for candidates on the same low filesystem', async () => {
    const low = HOST_STORAGE_MINIMUM_FREE_BYTES - 1n
    const filesystems = new Map([
      ['/repo', { availableBytes: HOST_STORAGE_MINIMUM_FREE_BYTES, device: 1n }],
      ['/home/developer', { availableBytes: low, device: 2n }],
      ['/tmp', { availableBytes: low, device: 2n }],
    ])
    const { dependencies } = makeDependencies({ filesystems })

    const result = await inspectHostStorage({ worktreePath: '/repo' }, dependencies)
    const message = result.issues.find(issue => issue.type === 'low-space')?.message ?? ''

    expect(message.match(/Free host storage, then retry/g)).toHaveLength(1)
  })

  it('blocks when a required path cannot be resolved or probed', async () => {
    const availableBytes = HOST_STORAGE_MINIMUM_FREE_BYTES + 1n
    const filesystems = new Map([
      ['/repo', { availableBytes, device: 1n }],
      ['/tmp', { availableBytes, device: 2n }],
    ])
    const { dependencies } = makeDependencies({
      filesystems,
      realpathFailures: new Set(['/home/developer']),
      statfsFailures: new Set(['/tmp']),
    })

    const result = await inspectHostStorage({ worktreePath: '/repo' }, dependencies)

    expect(result.ok).toBe(false)
    expect(result.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ label: 'home directory', severity: 'error', type: 'resolution' }),
        expect.objectContaining({
          label: 'temporary directory',
          severity: 'error',
          type: 'probe',
        }),
      ]),
    )
  })

  it('warns when optional pnpm and Docker paths cannot be discovered', async () => {
    const availableBytes = HOST_STORAGE_MINIMUM_FREE_BYTES + 1n
    const filesystems = new Map([
      ['/repo', { availableBytes, device: 1n }],
      ['/home/developer', { availableBytes, device: 2n }],
      ['/tmp', { availableBytes, device: 2n }],
    ])
    const commandResults = new Map<string, Error | string>([
      ['pnpm store path', new Error('pnpm unavailable')],
      ['docker info --format {{.DockerRootDir}}', new Error('daemon unavailable')],
    ])
    const { commandCalls, dependencies } = makeDependencies({ commandResults, filesystems })

    const result = await inspectHostStorage(
      { discoverDockerRoot: true, discoverPnpmStore: true, worktreePath: '/repo' },
      dependencies,
    )

    expect(result.ok).toBe(true)
    expect(result.issues).toEqual([
      expect.objectContaining({ label: 'pnpm store', severity: 'warning', type: 'resolution' }),
      expect.objectContaining({ label: 'Docker root', severity: 'warning', type: 'resolution' }),
    ])
    expect(commandCalls).toEqual([
      { args: ['store', 'path'], command: 'pnpm', timeout: 5_000 },
      {
        args: ['info', '--format', '{{.DockerRootDir}}'],
        command: 'docker',
        timeout: 5_000,
      },
    ])
  })

  it('warns on optional probe failures but blocks when a discovered optional filesystem is low', async () => {
    const enough = HOST_STORAGE_MINIMUM_FREE_BYTES + 1n
    const low = HOST_STORAGE_MINIMUM_FREE_BYTES - 1n
    const filesystems = new Map([
      ['/repo', { availableBytes: enough, device: 1n }],
      ['/home/developer', { availableBytes: enough, device: 2n }],
      ['/tmp', { availableBytes: enough, device: 2n }],
      ['/pnpm/store', { availableBytes: enough, device: 3n }],
      ['/var/lib/docker', { availableBytes: low, device: 4n }],
    ])
    const commandResults = new Map<string, Error | string>([
      ['pnpm store path', '/pnpm/store\n'],
      ['docker info --format {{.DockerRootDir}}', '/var/lib/docker\n'],
    ])
    const { dependencies } = makeDependencies({
      commandResults,
      filesystems,
      statfsFailures: new Set(['/pnpm/store']),
    })

    const result = await inspectHostStorage(
      { discoverDockerRoot: true, discoverPnpmStore: true, worktreePath: '/repo' },
      dependencies,
    )

    expect(result.ok).toBe(false)
    expect(result.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ label: 'pnpm store', severity: 'warning', type: 'probe' }),
        expect.objectContaining({ label: 'Docker root', severity: 'error', type: 'low-space' }),
      ]),
    )
  })

  it('uses the existing Docker Desktop backing file on macOS', async () => {
    const dockerRaw =
      '/Users/developer/Library/Containers/com.docker.docker/Data/vms/0/data/Docker.raw'
    const enough = HOST_STORAGE_MINIMUM_FREE_BYTES + 1n
    const filesystems = new Map([
      ['/repo', { availableBytes: enough, device: 1n }],
      ['/Users/developer', { availableBytes: enough, device: 2n }],
      ['/tmp', { availableBytes: enough, device: 2n }],
      [dockerRaw, { availableBytes: enough, device: 2n }],
    ])
    const { commandCalls, dependencies } = makeDependencies({
      filesystems,
      home: '/Users/developer',
      platform: 'darwin',
    })

    const result = await inspectHostStorage(
      { discoverDockerRoot: true, worktreePath: '/repo' },
      dependencies,
    )

    expect(result.ok).toBe(true)
    expect(result.filesystems[1]?.labels).toContain('Docker Desktop storage')
    expect(commandCalls).toEqual([])
  })

  it('quotes diagnostic paths and offers target-specific recovery without deleting data', async () => {
    const low = HOST_STORAGE_MINIMUM_FREE_BYTES - 1n
    const filesystems = new Map([
      ["/repo/it's here", { availableBytes: low, device: 1n }],
      ['/home/developer', { availableBytes: HOST_STORAGE_MINIMUM_FREE_BYTES, device: 2n }],
      ['/tmp', { availableBytes: HOST_STORAGE_MINIMUM_FREE_BYTES, device: 2n }],
    ])
    const { dependencies } = makeDependencies({ filesystems })

    const result = await inspectHostStorage({ worktreePath: "/repo/it's here" }, dependencies)
    const message = result.issues[0]?.message ?? ''

    expect(message).toContain(`df -h '/repo/it'"'"'s here'`)
    expect(message).toContain('Free host storage, then retry')
    expect(message).not.toMatch(/\brm\b/)
  })

  it('distinguishes CLI usage errors from unexpected runtime failures', async () => {
    const messages: string[] = []
    const output = {
      error: (message: string) => messages.push(message),
      log: (message: string) => messages.push(message),
    }
    const { dependencies } = makeDependencies()

    await expect(runHostStoragePreflightCli(['--unknown'], dependencies, output)).resolves.toBe(2)
    expect(messages).toEqual([expect.stringContaining('Host storage preflight usage error')])

    messages.length = 0
    await expect(
      runHostStoragePreflightCli(
        ['--worktree', '/repo'],
        {
          ...dependencies,
          homedir: () => {
            throw new Error('synthetic runtime failure')
          },
        },
        output,
      ),
    ).resolves.toBe(1)
    expect(messages).toEqual([expect.stringContaining('Host storage preflight failed')])
    expect(messages[0]).not.toContain('usage error')
  })
})
