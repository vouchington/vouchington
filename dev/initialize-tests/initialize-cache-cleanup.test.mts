import { execFile } from 'node:child_process'
import { mkdir, mkdtemp, rm, stat, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { promisify } from 'node:util'
import { afterEach, describe, expect, it } from 'vitest'

import { initializeBashArgs } from '../test-helpers/initialize.mts'

const execFileAsync = promisify(execFile)

const testDirs: string[] = []

async function makeWorktreeDir(...parts: string[]) {
  const root = await mkdtemp(join(tmpdir(), 'voucha-dev-initialize-'))
  const dir = join(root, ...parts)
  await mkdir(dir, { recursive: true })
  testDirs.push(root)
  return dir
}

async function runHelper({ cwd, script, home }: { cwd: string; script: string; home?: string }) {
  const result = await execFileAsync('bash', initializeBashArgs(script), {
    cwd,
    env: {
      ...process.env,
      HOME: home ?? dirname(cwd),
    },
  })

  return result.stdout.trim()
}

async function runHelperStatus({
  cwd,
  script,
  home,
}: {
  cwd: string
  script: string
  home?: string
}): Promise<{ exitCode: number; stderr: string; stdout: string }> {
  try {
    const result = await execFileAsync('bash', initializeBashArgs(script), {
      cwd,
      env: {
        ...process.env,
        HOME: home ?? dirname(cwd),
      },
    })

    return { exitCode: 0, stderr: result.stderr.trim(), stdout: result.stdout.trim() }
  } catch (err: unknown) {
    const e = err as { code?: number; stderr?: string; stdout?: string }
    return {
      exitCode: typeof e.code === 'number' ? e.code : 1,
      stderr: (e.stderr ?? '').trim(),
      stdout: (e.stdout ?? '').trim(),
    }
  }
}

async function fileExists(filePath: string): Promise<boolean> {
  try {
    await stat(filePath)
    return true
  } catch {
    return false
  }
}

describe('initialize cache cleanup helpers', () => {
  afterEach(async () => {
    await Promise.all(testDirs.splice(0).map(dir => rm(dir, { force: true, recursive: true })))
  })

  describe('clear_dev_caches', () => {
    it('removes the Wrangler state, Wrangler runtime, and Next.js cache directories when present', async () => {
      const cwd = await makeWorktreeDir('feature-clear-dev-caches')
      const wranglerState = join(cwd, 'cloudflare-worker', '.wrangler', 'state')
      const wranglerRuntime = join(cwd, 'cloudflare-worker', '.wrangler', 'runtime')
      const nextCache = join(cwd, 'web', '.next')
      await mkdir(wranglerState, { recursive: true })
      await writeFile(join(wranglerState, 'sentinel'), '1')
      await mkdir(wranglerRuntime, { recursive: true })
      await writeFile(join(wranglerRuntime, 'sentinel'), '1')
      await mkdir(nextCache, { recursive: true })
      await writeFile(join(nextCache, 'sentinel'), '1')

      await runHelper({
        cwd,
        script: `clear_dev_caches "cloudflare-worker/.wrangler/state" "cloudflare-worker/.wrangler/runtime" "web/.next"`,
      })

      expect(await fileExists(wranglerState)).toBe(false)
      expect(await fileExists(wranglerRuntime)).toBe(false)
      expect(await fileExists(nextCache)).toBe(false)
    })

    it('is a no-op when the cache directories are absent', async () => {
      const cwd = await makeWorktreeDir('feature-clear-dev-caches-absent')

      const result = await runHelperStatus({
        cwd,
        script: `clear_dev_caches "cloudflare-worker/.wrangler/state" "cloudflare-worker/.wrangler/runtime" "web/.next"`,
      })

      expect(result.exitCode).toBe(0)
      expect(await fileExists(join(cwd, 'cloudflare-worker'))).toBe(false)
      expect(await fileExists(join(cwd, 'web'))).toBe(false)
    })

    it('skips a path that exists as a file rather than a directory', async () => {
      const cwd = await makeWorktreeDir('feature-clear-dev-caches-file')
      await mkdir(join(cwd, 'web'), { recursive: true })
      const filePath = join(cwd, 'web', '.next')
      await writeFile(filePath, 'not-a-directory')

      await runHelper({
        cwd,
        script: `clear_dev_caches "web/.next"`,
      })

      expect(await fileExists(filePath)).toBe(true)
    })
  })

  describe('clear_stale_index_lock', () => {
    it('removes a 0-byte index.lock', async () => {
      const cwd = await makeWorktreeDir('feature-lock-stale')
      const lockPath = join(cwd, 'index.lock')
      await writeFile(lockPath, '')

      await runHelper({
        cwd,
        script: `clear_stale_index_lock '${cwd}'`,
      })

      expect(await fileExists(lockPath)).toBe(false)
    })

    it('does not remove a non-empty index.lock', async () => {
      const cwd = await makeWorktreeDir('feature-lock-nonfatal')
      const lockPath = join(cwd, 'index.lock')
      await writeFile(lockPath, 'real-lock-content')

      await runHelper({
        cwd,
        script: `clear_stale_index_lock '${cwd}'`,
      })

      expect(await fileExists(lockPath)).toBe(true)
    })

    it('is a no-op when index.lock is absent', async () => {
      const cwd = await makeWorktreeDir('feature-lock-absent')

      await runHelper({
        cwd,
        script: `clear_stale_index_lock '${cwd}'`,
      })

      expect(await fileExists(join(cwd, 'index.lock'))).toBe(false)
    })
  })
})
