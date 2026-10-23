import { describe, expect, it, vi } from 'vitest'
import type { TmuxRun } from 'vouchington-tooling/tmux'
import { launchServices } from './launch-services.mts'

describe('Voucha service preparation wiring', () => {
  it.each([['--unknown'], ['--no-attach', '--no-attach'], ['--help'], ['-h']])(
    'does not prepare services for %j',
    (...args) => {
      const prepare = vi.fn<() => number>(() => 0)
      const tmux = vi.fn<TmuxRun>(() => ({ status: 0, stdout: '' }))
      launchServices(args, { prepare, tmux, env: {}, out: () => {}, err: () => {} })
      expect(prepare).not.toHaveBeenCalled()
      expect(tmux).not.toHaveBeenCalled()
    },
  )

  it('prepares once before the first session operation when creating the configured windows', () => {
    const operations: string[] = []
    const prepare = vi.fn<() => number>(() => {
      operations.push('prepare')
      return 0
    })
    const tmux: TmuxRun = args => {
      operations.push(args[0]!)
      return { status: args[0] === 'has-session' ? 1 : 0, stdout: '' }
    }
    expect(
      launchServices(['--no-attach'], { prepare, tmux, env: {}, out: () => {}, err: () => {} }),
    ).toBe(0)
    expect(prepare).toHaveBeenCalledOnce()
    expect(operations.slice(0, 3)).toEqual(['-V', 'prepare', 'has-session'])
    expect(operations).toContain('new-session')
    expect(operations).toContain('new-window')
  })

  it('does not mutate a session when product preparation fails', () => {
    const prepare = vi.fn<() => number>(() => 1)
    const tmux = vi.fn<TmuxRun>(() => ({ status: 0, stdout: '' }))
    expect(
      launchServices(['--no-attach'], { prepare, tmux, env: {}, out: () => {}, err: () => {} }),
    ).not.toBe(0)
    expect(prepare).toHaveBeenCalledOnce()
    expect(tmux.mock.calls.map(([args]) => args[0])).toEqual(['-V'])
  })
})
