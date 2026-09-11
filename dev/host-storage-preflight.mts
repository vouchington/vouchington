#!/usr/bin/env node

import { execFile } from 'node:child_process'
import { realpath, stat, statfs } from 'node:fs/promises'
import { homedir, platform, tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import {
  errorMessage,
  makeResolutionIssue,
  probeHostStorage,
  type HostStorageProbeDependencies,
  type HostStorageResult,
  type StorageCandidate,
} from './lib/host-storage-check.mts'
import {
  parseHostStorageCliArguments,
  type HostStorageOptions,
  type HostStorageOutput,
} from './lib/host-storage-cli.mts'

export { HOST_STORAGE_MINIMUM_FREE_BYTES } from './lib/host-storage-check.mts'
export type { HostStorageResult } from './lib/host-storage-check.mts'

const DISCOVERY_TIMEOUT_MS = 5_000

export interface HostStorageDependencies extends HostStorageProbeDependencies {
  execFile(
    command: string,
    args: string[],
    options: { timeout?: number },
  ): Promise<{ stdout: string }>
  homedir(): string
  platform: NodeJS.Platform
  tmpdir(): string
}

const defaultDependencies: HostStorageDependencies = {
  execFile: (command, args, options) =>
    new Promise((resolveCommand, rejectCommand) => {
      execFile(
        command,
        args,
        { encoding: 'utf8', maxBuffer: 1024 * 1024, timeout: options.timeout },
        (error, stdout) => {
          if (error) {
            rejectCommand(error)
            return
          }
          resolveCommand({ stdout })
        },
      )
    }),
  homedir,
  platform: platform(),
  realpath,
  stat: async path => ({ dev: (await stat(path, { bigint: true })).dev }),
  statfs: async path => {
    const result = await statfs(path, { bigint: true })
    return { bavail: result.bavail, bsize: result.bsize }
  },
  tmpdir,
}

async function discoverCommandPath(
  command: string,
  args: string[],
  label: string,
  recovery: string,
  dependencies: HostStorageDependencies,
): Promise<{ candidate?: StorageCandidate; issue?: HostStorageResult['issues'][number] }> {
  const fallback = { label, path: `${command} ${args.join(' ')}`, recovery, required: false }
  try {
    const { stdout } = await dependencies.execFile(command, args, {
      timeout: DISCOVERY_TIMEOUT_MS,
    })
    const path = stdout.trim()
    if (!path) throw new Error('command returned an empty path')
    return { candidate: { ...fallback, path } }
  } catch (error) {
    return { issue: makeResolutionIssue(fallback, errorMessage(error)) }
  }
}

async function optionalStorage(
  options: HostStorageOptions,
  dependencies: HostStorageDependencies,
): Promise<{ candidates: StorageCandidate[]; issues: HostStorageResult['issues'] }> {
  const candidates: StorageCandidate[] = []
  const issues: HostStorageResult['issues'] = []
  if (options.discoverPnpmStore) {
    const result = await discoverCommandPath(
      'pnpm',
      ['store', 'path'],
      'pnpm store',
      'Confirm pnpm is installed; after reviewing its contents, `pnpm store prune` can remove unused packages.',
      dependencies,
    )
    if (result.candidate) candidates.push(result.candidate)
    if (result.issue) issues.push(result.issue)
  }
  if (!options.discoverDockerRoot) return { candidates, issues }

  if (dependencies.platform === 'darwin') {
    candidates.push({
      label: 'Docker Desktop storage',
      path: join(
        dependencies.homedir(),
        'Library/Containers/com.docker.docker/Data/vms/0/data/Docker.raw',
      ),
      recovery:
        'Review Docker Desktop disk usage and reclaim unused images, containers, or volumes intentionally.',
      required: false,
    })
  } else if (dependencies.platform === 'linux') {
    const result = await discoverCommandPath(
      'docker',
      ['info', '--format', '{{.DockerRootDir}}'],
      'Docker root',
      'Run `docker system df`, then reclaim only Docker images, containers, or volumes you have confirmed are unused.',
      dependencies,
    )
    if (result.candidate) candidates.push(result.candidate)
    if (result.issue) issues.push(result.issue)
  } else {
    issues.push(
      makeResolutionIssue(
        {
          label: 'Docker root',
          path: 'Docker host storage',
          recovery: 'Inspect Docker storage using the platform-specific Docker tooling.',
          required: false,
        },
        `unsupported host platform ${dependencies.platform}`,
      ),
    )
  }
  return { candidates, issues }
}

export async function inspectHostStorage(
  options: HostStorageOptions,
  dependencies: HostStorageDependencies = defaultDependencies,
): Promise<HostStorageResult> {
  const requiredCandidates = [
    storageCandidate('worktree', options.worktreePath),
    storageCandidate('home directory', dependencies.homedir()),
    storageCandidate('temporary directory', dependencies.tmpdir()),
  ]
  const required = await probeHostStorage(requiredCandidates, dependencies)
  if (!required.ok) return required

  const optional = await optionalStorage(options, dependencies)
  const result =
    optional.candidates.length === 0
      ? required
      : await probeHostStorage([...requiredCandidates, ...optional.candidates], dependencies)
  result.issues.unshift(...optional.issues)
  result.ok = !result.issues.some(issue => issue.severity === 'error')
  return result
}

function storageCandidate(label: string, path: string): StorageCandidate {
  return { label, path, recovery: 'Free host storage, then retry.', required: true }
}

export async function runHostStoragePreflightCli(
  args: string[],
  dependencies: HostStorageDependencies = defaultDependencies,
  output: HostStorageOutput = console,
): Promise<number> {
  let options: HostStorageOptions
  try {
    options = parseHostStorageCliArguments(args)
  } catch (error) {
    output.error(`Host storage preflight usage error: ${errorMessage(error)}`)
    return 2
  }

  try {
    const result = await inspectHostStorage(options, dependencies)
    result.issues.forEach(issue =>
      output.error(`${issue.severity === 'error' ? 'Error' : 'Warning'}: ${issue.message}`),
    )
    if (!result.ok) return 1
    output.log('Host storage preflight passed: 5.00 GiB minimum free.')
    return 0
  } catch (error) {
    output.error(`Host storage preflight failed: ${errorMessage(error)}`)
    return 1
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url))
  process.exitCode = await runHostStoragePreflightCli(process.argv.slice(2))
