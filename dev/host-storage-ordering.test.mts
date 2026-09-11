import { describe, expect, it } from 'vitest'

import {
  HOST_STORAGE_MINIMUM_FREE_BYTES,
  inspectHostStorage,
  type HostStorageDependencies,
} from './host-storage-preflight.mts'

function makeDependencies(homeAvailable: bigint) {
  const operations: string[] = []
  const filesystems = new Map([
    ['/repo', { available: HOST_STORAGE_MINIMUM_FREE_BYTES + 1n, device: 1n }],
    ['/home/developer', { available: homeAvailable, device: 2n }],
    ['/tmp', { available: HOST_STORAGE_MINIMUM_FREE_BYTES + 1n, device: 3n }],
    ['/pnpm/store', { available: HOST_STORAGE_MINIMUM_FREE_BYTES + 1n, device: 4n }],
  ])
  const dependencies: HostStorageDependencies = {
    execFile: async (command, args) => {
      operations.push(`command:${command} ${args.join(' ')}`)
      return { stdout: command === 'pnpm' ? '/pnpm/store\n' : '/var/lib/docker\n' }
    },
    homedir: () => '/home/developer',
    platform: 'linux',
    realpath: async path => path,
    stat: async path => {
      const filesystem = filesystems.get(path)
      if (!filesystem) throw new Error(`missing filesystem: ${path}`)
      return { dev: filesystem.device }
    },
    statfs: async path => {
      operations.push(`statfs:${path}`)
      const filesystem = filesystems.get(path)
      if (!filesystem) throw new Error(`missing filesystem: ${path}`)
      return { bavail: filesystem.available, bsize: 1n }
    },
    tmpdir: () => '/tmp',
  }
  return { dependencies, operations }
}

describe('host storage discovery ordering', () => {
  it('finishes required probes before optional discovery can invoke commands', async () => {
    const { dependencies, operations } = makeDependencies(HOST_STORAGE_MINIMUM_FREE_BYTES + 1n)

    const result = await inspectHostStorage(
      { discoverPnpmStore: true, worktreePath: '/repo' },
      dependencies,
    )

    expect(result.ok).toBe(true)
    expect(operations.slice(0, 3)).toEqual([
      'statfs:/repo',
      'statfs:/home/developer',
      'statfs:/tmp',
    ])
    expect(operations[3]).toBe('command:pnpm store path')
  })

  it('does not run optional discovery when a required filesystem fails', async () => {
    const { dependencies, operations } = makeDependencies(HOST_STORAGE_MINIMUM_FREE_BYTES - 1n)

    const result = await inspectHostStorage(
      { discoverDockerRoot: true, discoverPnpmStore: true, worktreePath: '/repo' },
      dependencies,
    )

    expect(result.ok).toBe(false)
    expect(operations).not.toContain('command:pnpm store path')
    expect(operations).not.toContain('command:docker info --format {{.DockerRootDir}}')
  })
})
