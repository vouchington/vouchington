import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock<typeof import('node:fs')>(
  import('node:fs'),
  () =>
    ({
      existsSync: vi.fn<typeof import('node:fs').existsSync>(() => true),
      mkdirSync: vi.fn<typeof import('node:fs').mkdirSync>(),
      renameSync: vi.fn<typeof import('node:fs').renameSync>(),
      rmSync: vi.fn<typeof import('node:fs').rmSync>(),
    }) as unknown as typeof import('node:fs'),
)

describe('stale-test-cache-cleanup', () => {
  beforeEach(async () => {
    vi.resetModules()
    const fs = await import('node:fs')
    vi.mocked(fs.mkdirSync).mockClear()
    vi.mocked(fs.renameSync).mockClear()
    vi.mocked(fs.rmSync).mockClear()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('clears Next.js output and Wrangler state for local tests', async () => {
    const fs = await import('node:fs')
    const { clearStaleTestCaches } = await import('./stale-test-cache-cleanup.mts')

    clearStaleTestCaches({ rootDir: '/repo' })

    expect(fs.rmSync).toHaveBeenCalledWith('/repo/web/.next', {
      force: true,
      recursive: true,
    })
    expect(fs.rmSync).toHaveBeenCalledWith('/repo/cloudflare-worker/.wrangler/state', {
      force: true,
      recursive: true,
    })
    expect(fs.rmSync).toHaveBeenCalledWith('/repo/cloudflare-worker/.wrangler/runtime', {
      force: true,
      recursive: true,
    })
  })

  it('clears CI Wrangler runtime directories with the shared key format', async () => {
    const fs = await import('node:fs')
    const { clearStaleTestCaches, getWranglerPersistToPath, getWranglerRuntimeRoot } =
      await import('./stale-test-cache-cleanup.mts')
    const persistDir = getWranglerPersistToPath('3902', '7')
    const runtimeDir = getWranglerRuntimeRoot('3902', '7')

    clearStaleTestCaches({
      rootDir: '/repo',
      clearNextRuntime: false,
      clearWranglerLocalState: false,
      wranglerRuntimeDirs: [runtimeDir],
      wranglerPersistDirs: [persistDir],
    })

    expect(fs.rmSync).toHaveBeenCalledWith(runtimeDir, { force: true, recursive: true })
    expect(fs.rmSync).toHaveBeenCalledWith(persistDir, { force: true, recursive: true })
  })
})
