#!/usr/bin/env node

import { spawnSync } from 'node:child_process'
import { statSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { join, resolve } from 'node:path'

import { validateStorybookArtifact, writeStorybookTombstone } from './storybook-pages-artifact.mts'

export { validateStorybookArtifact, writeStorybookTombstone }

const REPOSITORY_ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)))

function installTrustedStorybookAuthWorker(artifactRoot: string): void {
  const destination = resolve(artifactRoot)
  const cloudflareWorkerRoot = join(REPOSITORY_ROOT, 'cloudflare-worker')
  const output = join(destination, '_worker.js')
  const result = spawnSync(
    'pnpm',
    ['--dir', cloudflareWorkerRoot, 'run', 'build:storybook-auth', `--outfile=${output}`],
    { encoding: 'utf8' },
  )
  if (result.error) throw result.error
  if (result.status !== 0) {
    throw new Error(`Failed to bundle trusted Storybook auth worker: ${result.stderr.trim()}`)
  }
  if (!statSync(output).isFile() || statSync(output).size === 0) {
    throw new Error('Trusted Storybook auth worker bundle is empty')
  }
}

export function protectStorybookArtifact(artifactRoot: string): void {
  validateStorybookArtifact(artifactRoot)
  installTrustedStorybookAuthWorker(artifactRoot)
}

export function writeProtectedStorybookTombstone(destination: string): void {
  writeStorybookTombstone(destination)
  installTrustedStorybookAuthWorker(destination)
}

function usage(): string {
  return [
    'Usage: storybook-pages.mts validate <artifact-root>',
    '       storybook-pages.mts protect <artifact-root>',
    '       storybook-pages.mts tombstone <destination>',
  ].join('\n')
}

export async function main(argv: string[]): Promise<number> {
  const [command, ...args] = argv
  try {
    if (command === 'validate' && args.length === 1) {
      const result = validateStorybookArtifact(args[0]!)
      process.stdout.write(
        `Validated ${result.files} Storybook files (${result.totalBytes} bytes).\n`,
      )
      return 0
    }
    if (command === 'protect' && args.length === 1) {
      protectStorybookArtifact(args[0]!)
      return 0
    }
    if (command === 'tombstone' && args.length === 1) {
      writeProtectedStorybookTombstone(args[0]!)
      return 0
    }
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`)
    return 1
  }
  process.stderr.write(`${usage()}\n`)
  return 2
}

const invokedPath = process.argv[1]
if (invokedPath !== undefined && fileURLToPath(import.meta.url) === resolve(invokedPath)) {
  process.exit(await main(process.argv.slice(2)))
}
