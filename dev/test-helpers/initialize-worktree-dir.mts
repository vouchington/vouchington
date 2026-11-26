import { execFile } from 'node:child_process'

import { mkdir, mkdtemp, rm } from 'node:fs/promises'

import { tmpdir } from 'node:os'

import { dirname, join } from 'node:path'

import { promisify } from 'node:util'

import { initializeBashArgs } from './initialize.mts'

const execFileAsync = promisify(execFile)

const testDirs: string[] = []

export async function makeWorktreeDir(...parts: string[]) {
  const root = await mkdtemp(join(tmpdir(), 'voucha-dev-initialize-'))
  const dir = join(root, ...parts)
  await mkdir(dir, { recursive: true })
  testDirs.push(root)
  return dir
}

export async function runHelper({
  cwd,
  script,
  home,
}: {
  cwd: string
  script: string
  home?: string
}) {
  const result = await execFileAsync('bash', initializeBashArgs(script), {
    cwd,
    env: {
      ...process.env,
      HOME: home ?? dirname(cwd),
    },
  })

  return result.stdout.trim()
}

export async function removeWorktreeDirs() {
  await Promise.all(testDirs.splice(0).map(dir => rm(dir, { force: true, recursive: true })))
}
