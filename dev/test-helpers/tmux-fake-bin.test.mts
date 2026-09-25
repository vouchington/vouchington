import { execFile } from 'node:child_process'
import { lstat, readFile, realpath, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { promisify } from 'node:util'
import { describe, expect, it } from 'vitest'
import { registerTmuxFakeHooks } from './tmux-fake-bin.mts'

const execFileAsync = promisify(execFile)

const SCRIPTED_NAMES = ['tmux', 'pgrep', 'docker', 'node', 'bash', 'claude', 'codex', 'pnpm']
const PASSTHROUGH_NAMES: Record<string, string> = {
  basename: '/usr/bin/basename',
  dirname: '/usr/bin/dirname',
  openssl: '/usr/bin/openssl',
  grep: '/usr/bin/grep',
  tr: '/usr/bin/tr',
  sleep: '/bin/sleep',
}

describe('tmux-fake-bin', () => {
  const { makeFakeBin } = registerTmuxFakeHooks()

  // Captured at collection time, before this describe's own beforeAll has run, so the promise is
  // already rejected by the time the assertion below awaits it.
  const earlyCallOutcome = Promise.allSettled([makeFakeBin()])

  it('rejects a makeFakeBin() call made before registerTmuxFakeHooks() has warmed its template', async () => {
    const [outcome] = await earlyCallOutcome
    expect(outcome.status).toBe('rejected')
    const reason = outcome.status === 'rejected' ? outcome.reason : undefined
    expect(reason).toBeInstanceOf(Error)
    expect((reason as Error).name).toBe('TmuxFakeBinNotWarmedError')
  })

  it('links every scripted fake in two bin dirs to the same warmed template file', async () => {
    const [dirA, dirB] = await Promise.all([makeFakeBin(), makeFakeBin()])
    await Promise.all(
      SCRIPTED_NAMES.map(async name => {
        const stat = await lstat(join(dirA, name))
        expect(stat.isSymbolicLink()).toBe(true)
        const [realA, realB] = await Promise.all([
          realpath(join(dirA, name)),
          realpath(join(dirB, name)),
        ])
        expect(realA).toBe(realB)
      }),
    )
  })

  it('symlinks pass-through tools straight to the real system binaries', async () => {
    const dir = await makeFakeBin()
    await Promise.all(
      Object.entries(PASSTHROUGH_NAMES).map(async ([name, target]) => {
        expect(await realpath(join(dir, name))).toBe(await realpath(target))
      }),
    )
    const { stdout } = await execFileAsync(join(dir, 'dirname'), ['a/b'])
    expect(stdout.trim()).toBe('a')
  })

  it('rejects a write through a linked scripted fake and leaves the template unchanged', async () => {
    const dir = await makeFakeBin()
    const linked = join(dir, 'tmux')
    const templateTarget = await realpath(linked)
    const before = await readFile(templateTarget, 'utf8')

    await expect(writeFile(linked, 'corrupted')).rejects.toMatchObject({ code: 'EACCES' })

    expect(await readFile(templateTarget, 'utf8')).toBe(before)
  })

  it('writes overrides as regular executable files without touching the template', async () => {
    const templateDir = await makeFakeBin()
    const templateTarget = await realpath(join(templateDir, 'tmux'))
    const before = await readFile(templateTarget, 'utf8')

    const overridden = await makeFakeBin({
      overrides: { tmux: '#!/bin/bash\nprintf override\n' },
    })
    const overriddenPath = join(overridden, 'tmux')
    expect((await lstat(overriddenPath)).isSymbolicLink()).toBe(false)
    const { stdout } = await execFileAsync(overriddenPath)
    expect(stdout).toBe('override')

    const other = await makeFakeBin()
    expect(await realpath(join(other, 'tmux'))).toBe(templateTarget)
    expect(await readFile(templateTarget, 'utf8')).toBe(before)
  })

  it('honors the tmux/claude/codex/cursor selection flags', async () => {
    const dir = await makeFakeBin({ tmux: false, claude: false, codex: false, cursor: true })

    await Promise.all(
      ['tmux', 'pgrep', 'claude', 'codex'].map(name =>
        expect(lstat(join(dir, name))).rejects.toMatchObject({ code: 'ENOENT' }),
      ),
    )
    expect((await lstat(join(dir, 'cursor-agent'))).isSymbolicLink()).toBe(true)

    const defaults = await makeFakeBin()
    expect((await lstat(join(defaults, 'tmux'))).isSymbolicLink()).toBe(true)
    await expect(lstat(join(defaults, 'cursor-agent'))).rejects.toMatchObject({ code: 'ENOENT' })
  })
})
