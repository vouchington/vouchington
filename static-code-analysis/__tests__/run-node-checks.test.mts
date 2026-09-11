import { describe, expect, it } from 'vitest'

describe('run-node-checks', () => {
  it('validates the repo-file-policy worker protocol', async () => {
    const { parseRepoFilePolicyWorkerMessage } =
      await import('../repo-file-policy-worker-client.mts')

    expect(parseRepoFilePolicyWorkerMessage({ errors: ['violation'], type: 'result' })).toEqual({
      errors: ['violation'],
      name: 'repo-file-policy',
    })
    expect(() => parseRepoFilePolicyWorkerMessage({ message: 'failed', type: 'error' })).toThrow(
      'repo-file-policy worker failed: failed',
    )
    expect(() => parseRepoFilePolicyWorkerMessage({ errors: [1], type: 'result' })).toThrow(
      'repo-file-policy worker returned an invalid message',
    )
  })

  it('runs repo-file-policy in an injected worker', async () => {
    const { runNodeChecks } = await import('../run-node-checks.mts')
    const events: string[] = []
    const results = await runNodeChecks({
      checks: ['repo-file-policy'],
      repoRoot: '/repo',
      dependencies: {
        runRepoFilePolicyInWorker: async (repoRoot, isInsideGitRepo, trackedFiles) => {
          events.push(`worker:${repoRoot}:${isInsideGitRepo}:${trackedFiles.length}`)
          return { errors: [], name: 'repo-file-policy' }
        },
      },
    })

    // '/repo' isn't a real git repo, so the parent's buildSharedContext() resolves
    // isInsideGitRepo: false with an empty tracked-file list — this asserts those two fields
    // (not just repoRoot) are threaded through to the worker-launching function.
    expect(events).toEqual(['worker:/repo:false:0'])
    expect(results).toEqual([{ errors: [], name: 'repo-file-policy' }])
  })

  it('propagates an injected repo-file-policy worker failure', async () => {
    const { runNodeChecks } = await import('../run-node-checks.mts')

    await expect(
      runNodeChecks({
        checks: ['repo-file-policy'],
        repoRoot: '/repo',
        dependencies: {
          runRepoFilePolicyInWorker: () => Promise.reject(new Error('worker protocol failure')),
        },
      }),
    ).rejects.toThrow('worker protocol failure')
  })

  it('runs the CLI and preserves annotations, diagnostics, and exit behavior', async () => {
    const { runNodeChecksCli } = await import('../run-node-checks-cli.mts')
    const stdout: string[] = []
    const stderr: string[] = []
    const exits: number[] = []

    await runNodeChecksCli({
      args: ['--checks', 'repo-file-policy'],
      cwd: '/repo',
      error: value => stderr.push(String(value)),
      exit: code => exits.push(code),
      isMain: true,
      log: value => stdout.push(String(value)),
      run: () =>
        Promise.resolve([
          {
            errors: ['ordinary', '::error::annotation'],
            fixes: ['updated'],
            name: 'repo-file-policy',
          },
        ]),
    })

    expect(stdout).toEqual(['[repo-file-policy] fix: updated'])
    expect(stderr).toEqual(['[repo-file-policy] error: ordinary', '::error::annotation'])
    expect(exits).toEqual([1])
  })

  it('formats primitive CLI failures', async () => {
    const { runNodeChecksCli } = await import('../run-node-checks-cli.mts')
    const errors: string[] = []
    const exits: number[] = []
    await runNodeChecksCli({
      args: ['--checks', 'repo-file-policy'],
      cwd: '/repo',
      error: value => errors.push(String(value)),
      exit: code => exits.push(code),
      isMain: true,
      log: () => undefined,
      run: () => Promise.reject('primitive failure'),
    })
    expect(errors).toEqual(['primitive failure'])
    expect(exits).toEqual([2])
  })

  it('reports passing CLI checks and tests canonical entrypoint detection', async () => {
    const { isInvokedAsScript, runNodeChecksCli } = await import('../run-node-checks-cli.mts')
    const stdout: string[] = []
    await runNodeChecksCli({
      args: ['--checks', 'repo-file-policy'],
      cwd: '/repo',
      error: () => undefined,
      exit: () => undefined,
      isMain: true,
      log: value => stdout.push(String(value)),
      run: () => Promise.resolve([{ errors: [], name: 'repo-file-policy' }]),
    })
    expect(stdout).toEqual(['[repo-file-policy] passed.'])
    expect(isInvokedAsScript('/alias', '/real', () => '/same')).toBe(true)
    expect(isInvokedAsScript(undefined, '/real')).toBe(false)
    expect(
      isInvokedAsScript('/missing', '/real', () => {
        throw new Error('missing')
      }),
    ).toBe(false)
  })
})
