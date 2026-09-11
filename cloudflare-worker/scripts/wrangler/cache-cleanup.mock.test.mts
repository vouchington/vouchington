import { beforeEach, describe, expect, it, vi } from 'vitest'

// PathLike (real existsSync/rmSync's parameter type) includes Buffer; these mocks only ever
// receive the string paths this test asserts, so the signatures are intentionally loosened. See
// docs/development/reference-tests-vitest-mock-typing.md § VitestLooseMock.
const mockExistsSync = vi.fn<VitestLooseMock>()
const mockRmSync = vi.fn<VitestLooseMock>()

vi.mock<typeof import('node:fs')>(import('node:fs'), () => ({
  existsSync: mockExistsSync,
  rmSync: mockRmSync,
}))

describe('start-wrangler stale cache cleanup', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('removes the configured CI runtime directory before Wrangler starts', async () => {
    mockExistsSync.mockReturnValue(true)
    const logs: string[] = []
    const { clearStaleWranglerCaches } = await import('./cache-cleanup.mts')

    const cleared = clearStaleWranglerCaches({
      isCi: true,
      log: message => logs.push(message),
      persistTo: '/tmp/voucha-wrangler/worker-3902-attempt-2/persist',
      runtimePaths: {
        cache: '/tmp/voucha-wrangler/worker-3902-attempt-2/cache',
        cfFetchCache: '/tmp/voucha-wrangler/worker-3902-attempt-2/cf-fetch',
        home: '/tmp/voucha-wrangler/worker-3902-attempt-2/home',
        logs: '/tmp/voucha-wrangler/worker-3902-attempt-2/logs',
        miniflareCache: '/tmp/voucha-wrangler/worker-3902-attempt-2/miniflare-cache',
        persistTo: '/tmp/voucha-wrangler/worker-3902-attempt-2/persist',
        registry: '/tmp/voucha-wrangler/worker-3902-attempt-2/registry',
        root: '/tmp/voucha-wrangler/worker-3902-attempt-2',
        tmp: '/tmp/voucha-wrangler/worker-3902-attempt-2/tmp',
        xdgCache: '/tmp/voucha-wrangler/worker-3902-attempt-2/xdg-cache',
        xdgConfig: '/tmp/voucha-wrangler/worker-3902-attempt-2/xdg-config',
        xdgState: '/tmp/voucha-wrangler/worker-3902-attempt-2/xdg-state',
      },
      workerDir: '/repo/cloudflare-worker',
    })

    expect(cleared).toEqual(['/tmp/voucha-wrangler/worker-3902-attempt-2'])
    expect(mockRmSync).toHaveBeenCalledWith('/tmp/voucha-wrangler/worker-3902-attempt-2', {
      force: true,
      recursive: true,
    })
    expect(logs).toEqual(['Cleared stale test caches: /tmp/voucha-wrangler/worker-3902-attempt-2'])
  })

  it('does not remove missing cache directories', async () => {
    mockExistsSync.mockReturnValue(false)
    const { clearStaleWranglerCaches } = await import('./cache-cleanup.mts')

    const cleared = clearStaleWranglerCaches({
      isCi: false,
      persistTo: undefined,
      workerDir: '/repo/cloudflare-worker',
    })

    expect(cleared).toEqual([])
    expect(mockRmSync).not.toHaveBeenCalled()
  })
})
