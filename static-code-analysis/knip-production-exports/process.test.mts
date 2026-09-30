import { describe, expect, it } from 'vitest'

import { createGit } from './git.mts'
import { runProcess } from './process.mts'

const cwd = process.cwd()
const node = (script: string, options: Partial<Parameters<typeof runProcess>[2]> = {}) =>
  runProcess(process.execPath, ['-e', script], { cwd, ...options })

describe('runProcess', () => {
  it('collects stdout, stderr and the exit status', async () => {
    const result = await node('console.log("out"); console.error("err"); process.exit(3)')
    expect(result).toMatchObject({ signal: null, status: 3, stderr: 'err\n', stdout: 'out\n' })
  })

  it('passes input on stdin', async () => {
    const result = await node('process.stdin.pipe(process.stdout)', { input: 'a\0b' })
    expect(result.stdout).toBe('a\0b')
  })

  it('does not fail when the child exits without reading a large input', async () => {
    const result = await node('process.exit(0)', { input: 'x'.repeat(2_000_000) })
    expect(result.status).toBe(0)
    expect(result.error).toBeUndefined()
  })

  it('reports a command that cannot start', async () => {
    const result = await runProcess('voucha-no-such-command', [], { cwd })
    expect(result.error).toBeInstanceOf(Error)
    expect(result.status).toBeNull()
  })

  it('kills the child with the signal named by the abort reason and waits for it', async () => {
    const controller = new AbortController()
    const pending = node('setInterval(() => {}, 1000)', { abort: controller.signal })
    controller.abort('SIGINT')
    const result = await pending
    expect(result.signal).toBe('SIGINT')
    expect(result.status).toBeNull()
  })

  it('falls back to SIGTERM when the reason is not a signal name', async () => {
    const controller = new AbortController()
    const pending = node('setInterval(() => {}, 1000)', { abort: controller.signal })
    controller.abort()
    expect((await pending).signal).toBe('SIGTERM')
  })

  it('does not spawn at all once the signal is already aborted', async () => {
    const result = await runProcess('voucha-no-such-command', [], {
      abort: AbortSignal.abort('SIGINT'),
      cwd,
    })
    expect(result).toEqual({ signal: null, status: null, stderr: '', stdout: '' })
  })
})

describe('createGit', () => {
  it('returns stdout on success and hands input to git', async () => {
    const git = createGit(cwd)
    expect(await git(['--version'])).toContain('git version')
    expect(await git(['hash-object', '--stdin'], 'hello\n')).toMatch(/^[0-9a-f]{40}\n$/)
  })

  it('throws with the failing command and stderr for a non-zero status', async () => {
    await expect(createGit(cwd)(['rev-parse', '--verify', 'voucha-missing-ref'])).rejects.toThrow(
      /git rev-parse --verify voucha-missing-ref failed \(128\)/,
    )
  })

  it('throws when git cannot start', async () => {
    await expect(createGit('/voucha-no-such-directory')(['status'])).rejects.toThrow(
      'git status could not start',
    )
  })
})
