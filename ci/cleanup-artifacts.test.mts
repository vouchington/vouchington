import { afterEach, describe, expect, it, vi } from 'vitest'
import { main } from './cleanup-artifacts.mts'

const ENV = { GITHUB_TOKEN: 'test-token', GITHUB_REPOSITORY: 'voucha/filaments' }

describe('main', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('prints usage and returns 2 for an unknown subcommand', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    await expect(main(['bogus'], ENV)).resolves.toBe(2)
  })

  it('returns 0 without calling the API when the token is missing', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    vi.stubGlobal('fetch', vi.fn<typeof fetch>())
    await expect(
      main(['run', '--run-id', '1'], { GITHUB_REPOSITORY: 'voucha/filaments' }),
    ).resolves.toBe(0)
    expect(fetch).not.toHaveBeenCalled()
  })

  it('returns 0 without calling the API when the repository is missing', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    vi.stubGlobal('fetch', vi.fn<typeof fetch>())
    await expect(main(['run', '--run-id', '1'], { GITHUB_TOKEN: 'test-token' })).resolves.toBe(0)
    expect(fetch).not.toHaveBeenCalled()
  })

  it('accepts GH_TOKEN as a fallback for GITHUB_TOKEN', async () => {
    vi.spyOn(console, 'log').mockImplementation(() => {})
    vi.stubGlobal(
      'fetch',
      vi.fn<typeof fetch>().mockResolvedValue(new Response(null, { status: 500 })),
    )
    await expect(
      main(['run', '--run-id', '1'], {
        GH_TOKEN: 'gh-token',
        GITHUB_REPOSITORY: 'voucha/filaments',
      }),
    ).resolves.toBe(0)
    expect(fetch).toHaveBeenCalled()
  })

  it('requires --run-id for the run subcommand', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    await expect(main(['run'], ENV)).resolves.toBe(2)
  })

  it('runs the run subcommand end-to-end against a stubbed fetch', async () => {
    vi.spyOn(console, 'log').mockImplementation(() => {})
    vi.stubGlobal(
      'fetch',
      vi
        .fn<typeof fetch>()
        .mockResolvedValue(new Response(JSON.stringify({ artifacts: [] }), { status: 200 })),
    )

    await expect(main(['run', '--run-id', '42'], ENV)).resolves.toBe(0)
  })

  it('requires a numeric --older-than-hours for the sweep subcommand', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    await expect(main(['sweep'], ENV)).resolves.toBe(2)
    await expect(main(['sweep', '--older-than-hours', 'nope'], ENV)).resolves.toBe(2)
    await expect(main(['sweep', '--older-than-hours', '-1'], ENV)).resolves.toBe(2)
    // Number('   ') is 0 — a whitespace value must not become "sweep everything now".
    await expect(main(['sweep', '--older-than-hours', '   '], ENV)).resolves.toBe(2)
  })

  it('runs the sweep subcommand end-to-end against a stubbed fetch', async () => {
    vi.spyOn(console, 'log').mockImplementation(() => {})
    vi.stubGlobal(
      'fetch',
      vi
        .fn<typeof fetch>()
        .mockResolvedValue(new Response(JSON.stringify({ artifacts: [] }), { status: 200 })),
    )

    await expect(main(['sweep', '--older-than-hours', '6'], ENV)).resolves.toBe(0)
  })
})
