import { EventEmitter } from 'node:events'

import { describe, expect, it, vi } from 'vitest'

import {
  normalizeForwardedVitestArgs,
  projectsForVitestGroup,
  propagateVitestChildCompletion,
  runVitestProjectGroup,
  vitestProjectGroupCommand,
} from './run-vitest-project-group.mts'

describe('runVitestProjectGroup', () => {
  it('composes Docker-free and Docker-backed backend groups without overlap', () => {
    const modules = projectsForVitestGroup('backend-modules')
    const docker = projectsForVitestGroup('backend-docker')

    expect(modules).toEqual([
      'backend/data-stores/analytics',
      'backend/services/analytics',
      'backend-modules',
      'backend-no-data-mocks',
      'backend-test-helpers',
      'backend-email-templates',
    ])
    expect(docker).toEqual([
      'backend/analytics-integration',
      'backend-data-stores',
      'backend-mocks',
      'backend-real-glide-mq',
    ])
    expect(modules.filter(project => docker.includes(project as never))).toEqual([])
    expect(projectsForVitestGroup('backend-default')).toEqual(['ts-shared', ...modules, ...docker])
  })

  it('removes exactly one leading pnpm separator and preserves every later argument', () => {
    expect(normalizeForwardedVitestArgs(['--', 'path1', 'path2', '--', 'path3'])).toEqual([
      'path1',
      'path2',
      '--',
      'path3',
    ])
    expect(normalizeForwardedVitestArgs(['--', '--', 'path1'])).toEqual(['--', 'path1'])
  })

  it('turns pnpm run test:backend:default -- path1 path2 path3 into positional filters', () => {
    expect(vitestProjectGroupCommand('backend-default', ['--', 'path1', 'path2', 'path3'])).toEqual(
      {
        command: './ci/with-node-test-options',
        args: [
          'vitest',
          'run',
          '--project',
          'ts-shared',
          '--project',
          'backend/data-stores/analytics',
          '--project',
          'backend/services/analytics',
          '--project',
          'backend-modules',
          '--project',
          'backend-no-data-mocks',
          '--project',
          'backend-test-helpers',
          '--project',
          'backend-email-templates',
          '--project',
          'backend/analytics-integration',
          '--project',
          'backend-data-stores',
          '--project',
          'backend-mocks',
          '--project',
          'backend-real-glide-mq',
          'path1',
          'path2',
          'path3',
        ],
      },
    )
  })

  it('spawns exactly one child with inherited stdio and environment', async () => {
    const child = new EventEmitter()
    const spawn = vi.fn<(...args: never[]) => never>(() => child as never)
    const env = { CONTRACT_TEST: 'present' }

    const resultPromise = runVitestProjectGroup('backend-analytics', ['--bail', '1'], {
      env,
      spawn: spawn as never,
    })
    child.emit('close', 7, null)

    await expect(resultPromise).resolves.toEqual({ code: 7, signal: null })
    expect(spawn).toHaveBeenCalledOnce()
    expect(spawn).toHaveBeenCalledWith(
      './ci/with-node-test-options',
      [
        'vitest',
        'run',
        '--project',
        'backend/data-stores/analytics',
        '--project',
        'backend/services/analytics',
        '--project',
        'backend/analytics-integration',
        '--bail',
        '1',
      ],
      { env, stdio: 'inherit' },
    )
  })

  it('process-wide serializes every group containing the destructive capacity project', async () => {
    const child = new EventEmitter()
    const spawn = vi.fn<(...args: never[]) => never>(() => child as never)
    const resultPromise = runVitestProjectGroup('backend-postgres-schema', [], {
      env: { VITEST_MAX_WORKERS: '4' },
      spawn: spawn as never,
    })
    child.emit('close', 0, null)

    await expect(resultPromise).resolves.toEqual({ code: 0, signal: null })
    expect(spawn).toHaveBeenCalledWith(
      './ci/with-node-test-options',
      [
        'vitest',
        'run',
        '--project',
        'backend-postgres-schema',
        '--project',
        'backend-activitypub-capacity',
        '--no-file-parallelism',
      ],
      { env: { VITEST_MAX_WORKERS: '1' }, stdio: 'inherit' },
    )
  })

  it('rejects child spawn errors and reports terminating signals', async () => {
    const erroredChild = new EventEmitter()
    const errorPromise = runVitestProjectGroup('web', [], {
      spawn: (() => erroredChild) as never,
    })
    erroredChild.emit('error', new Error('spawn failed'))
    await expect(errorPromise).rejects.toThrow('spawn failed')

    const signaledChild = new EventEmitter()
    const signalPromise = runVitestProjectGroup('web', [], {
      spawn: (() => signaledChild) as never,
    })
    signaledChild.emit('close', null, 'SIGTERM')
    await expect(signalPromise).resolves.toEqual({ code: null, signal: 'SIGTERM' })
  })

  it('re-emits a child signal instead of converting it to a normal exit code', () => {
    const kill = vi.fn<(pid: number, signal: NodeJS.Signals) => boolean>(() => true)
    const setExitCode = vi.fn<(code: number) => void>()

    propagateVitestChildCompletion(
      { code: null, signal: 'SIGTERM' },
      { kill, pid: 42, setExitCode },
    )

    expect(kill).toHaveBeenCalledWith(42, 'SIGTERM')
    expect(setExitCode).not.toHaveBeenCalled()
  })

  it('propagates a child exit code when no signal terminated it', () => {
    const setExitCode = vi.fn<(code: number) => void>()

    propagateVitestChildCompletion({ code: 7, signal: null }, { setExitCode })

    expect(setExitCode).toHaveBeenCalledWith(7)
  })

  it('rejects unknown project groups before spawning', async () => {
    await expect(runVitestProjectGroup('missing', [])).rejects.toThrow(
      'Unknown Vitest project group: missing',
    )
  })
})
