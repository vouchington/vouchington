import { describe, expect, it, vi } from 'vitest'

import { knipJson } from '../test-helpers/knip-production-exports/knip-json.mts'
import { serializeBaseline } from './baseline.mts'
import { UPDATE_COMMAND } from './config.mts'
import type { ProcessResult } from './process.mts'
import { run, type RunDeps } from './run.mts'

const ok = (stdout: string): ProcessResult => ({ signal: null, status: 0, stderr: '', stdout })
const finding = (file: string, symbol: string) => ({ file, symbol, type: 'exports' as const })

function makeDeps(result: ProcessResult, baseline = serializeBaseline([]), abort?: AbortSignal) {
  const removed = vi.fn<() => void>()
  const deps = {
    abort: abort ?? new AbortController().signal,
    error: vi.fn<RunDeps['error']>(),
    formatBaseline: vi.fn<RunDeps['formatBaseline']>(async text => `formatted:${text}`),
    info: vi.fn<RunDeps['info']>(),
    readBaseline: vi.fn<RunDeps['readBaseline']>(async () => baseline),
    runKnip: vi.fn<RunDeps['runKnip']>(async () => result),
    withTestFilesRemoved: vi.fn<RunDeps['withTestFilesRemoved']>(async fn => {
      removed()
      return fn()
    }),
    writeBaseline: vi.fn<RunDeps['writeBaseline']>(async () => undefined),
  } satisfies RunDeps
  return { deps, removed }
}

const oneExport = knipJson({ exports: ['fresh'], file: 'backend/a.mts' })

describe('run in check mode', () => {
  it('passes when the findings match the baseline', async () => {
    const { deps, removed } = makeDeps(
      ok(oneExport),
      serializeBaseline([finding('backend/a.mts', 'fresh')]),
    )
    await expect(run('check', deps)).resolves.toBe(0)
    expect(removed).toHaveBeenCalledOnce()
    expect(deps.info).toHaveBeenCalledWith(expect.stringContaining('1 known findings'))
    expect(deps.error).not.toHaveBeenCalled()
    expect(deps.writeBaseline).not.toHaveBeenCalled()
  })

  it('fails with fix advice and the update command for a new finding', async () => {
    const { deps } = makeDeps(ok(oneExport))
    await expect(run('check', deps)).resolves.toBe(1)
    const message = deps.error.mock.calls[0]?.[0]
    expect(message).toContain('New findings (1)')
    expect(message).toContain('fresh')
    expect(message).toContain(UPDATE_COMMAND)
  })

  it('fails when a baseline entry is no longer reported', async () => {
    const { deps } = makeDeps(ok(knipJson()), serializeBaseline([finding('backend/a.mts', 'gone')]))
    await expect(run('check', deps)).resolves.toBe(1)
    expect(deps.error.mock.calls[0]?.[0]).toContain('Stale baseline entries (1)')
  })

  it('rejects rather than mismatching when the baseline cannot be read', async () => {
    const { deps } = makeDeps(ok(oneExport))
    deps.readBaseline.mockRejectedValueOnce(new Error('baseline is missing'))
    await expect(run('check', deps)).rejects.toThrow('baseline is missing')
    deps.readBaseline.mockResolvedValueOnce('not json')
    await expect(run('check', deps)).rejects.toThrow('not valid JSON')
  })
})

describe('run in update mode', () => {
  it('writes the formatted baseline without reading the old one', async () => {
    const { deps } = makeDeps(ok(oneExport))
    await expect(run('update', deps)).resolves.toBe(0)
    expect(deps.readBaseline).not.toHaveBeenCalled()
    const written = deps.writeBaseline.mock.calls[0]?.[0]
    expect(written).toBe(`formatted:${serializeBaseline([finding('backend/a.mts', 'fresh')])}`)
    expect(deps.info).toHaveBeenCalledWith(expect.stringContaining('1 findings in 1 files'))
  })
})

describe('run when knip does not produce a report', () => {
  it.each<[string, ProcessResult, string]>([
    [
      'crashes with a config error',
      { ...ok(''), status: 2, stderr: 'ERROR: Invalid input' },
      'ERROR: Invalid input',
    ],
    [
      'exits 1 when its configuration does not load',
      { ...ok(''), status: 1, stderr: 'Error: worktree not initialized.' },
      'knip exited with status 1.\nknip output:\nError: worktree not initialized.',
    ],
    [
      'is killed by a signal',
      { ...ok(''), signal: 'SIGKILL', status: null },
      'terminated by SIGKILL',
    ],
    ['cannot start', { ...ok(''), error: new Error('spawn ENOENT') }, 'could not be started'],
    ['prints nothing', ok(''), 'printed nothing'],
    ['prints invalid JSON', { ...ok('oops'), stderr: 'warning: partial' }, 'warning: partial'],
    [
      'reports other issue types',
      ok(knipJson({ file: 'a.mts', others: { files: [{}] } })),
      'files in a.mts',
    ],
    ['fails with only stdout', { ...ok('half a report'), status: 3 }, 'half a report'],
  ])('rejects when knip %s', async (_name, result, message) => {
    const { deps } = makeDeps(result)
    await expect(run('check', deps)).rejects.toThrow(message)
    await expect(run('update', deps)).rejects.toThrow(message)
    expect(deps.error).not.toHaveBeenCalled()
    expect(deps.writeBaseline).not.toHaveBeenCalled()
  })

  it('never reports a crash as a baseline mismatch', async () => {
    const { deps } = makeDeps({ ...ok(''), status: 2 })
    const failure = await run('check', deps).catch((error: Error) => error.message)
    expect(failure).toContain('knip exited with status 2')
    expect(failure).not.toContain('differ from')
    expect(deps.error).not.toHaveBeenCalled()
  })

  it('keeps only the tail of very long knip output', async () => {
    const { deps } = makeDeps({ ...ok(''), status: 2, stderr: `${'x'.repeat(9000)}END` })
    const failure = await run('check', deps).catch((error: Error) => error.message)
    expect(failure).toContain('END')
    expect(failure).toContain('...xxx')
    expect(String(failure).length).toBeLessThan(4300)
  })
})

describe('run when the caller can stop it', () => {
  it('refuses to start when the test files cannot be removed', async () => {
    const { deps } = makeDeps(ok(oneExport))
    deps.withTestFilesRemoved.mockRejectedValueOnce(new Error('Refusing to run'))
    await expect(run('check', deps)).rejects.toThrow('Refusing to run')
    expect(deps.runKnip).not.toHaveBeenCalled()
  })

  it('returns the signal exit code and writes nothing after an interrupt', async () => {
    const controller = new AbortController()
    const { deps } = makeDeps(ok(oneExport), undefined, controller.signal)
    deps.runKnip.mockImplementationOnce(async () => {
      controller.abort('SIGINT')
      return ok(oneExport)
    })
    await expect(run('update', deps)).resolves.toBe(130)
    expect(deps.writeBaseline).not.toHaveBeenCalled()
    expect(deps.error).toHaveBeenCalledWith(expect.stringContaining('interrupted by SIGINT'))
  })
})
