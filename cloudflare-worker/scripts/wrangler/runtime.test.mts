import { existsSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  createWranglerRuntimeEnv,
  ensureWranglerRuntimeDirs,
  getWranglerRuntimePaths,
} from './runtime.mts'

describe('wrangler runtime paths', () => {
  it('redirects user-level Wrangler runtime env paths into the runtime root', () => {
    const paths = getWranglerRuntimePaths({
      isCi: false,
      runAttempt: '1',
      workerDir: '/repo/cloudflare-worker',
      workerPort: '8787',
    })

    expect(
      createWranglerRuntimeEnv(
        {
          CUSTOM_SETTING: 'preserved',
          HOME: '/Users/dev',
          TMPDIR: '/var/folders/system-temp',
          WRANGLER_SEND_ERROR_REPORTS: 'true',
          WRANGLER_SEND_METRICS: 'true',
        },
        paths,
      ),
    ).toMatchObject({
      APPDATA: '/repo/cloudflare-worker/.wrangler/runtime/xdg-config',
      CLOUDFLARE_CF_FETCH_PATH: '/repo/cloudflare-worker/.wrangler/runtime/cf-fetch',
      CUSTOM_SETTING: 'preserved',
      HOME: '/repo/cloudflare-worker/.wrangler/runtime/home',
      LOCALAPPDATA: '/repo/cloudflare-worker/.wrangler/runtime/xdg-cache',
      MINIFLARE_CACHE_DIR: '/repo/cloudflare-worker/.wrangler/runtime/miniflare-cache',
      TMPDIR: '/repo/cloudflare-worker/.wrangler/runtime/tmp',
      WRANGLER_CACHE_DIR: '/repo/cloudflare-worker/.wrangler/runtime/cache',
      WRANGLER_LOG_PATH: '/repo/cloudflare-worker/.wrangler/runtime/logs',
      WRANGLER_REGISTRY_PATH: '/repo/cloudflare-worker/.wrangler/runtime/registry',
      WRANGLER_SEND_ERROR_REPORTS: 'true',
      WRANGLER_SEND_METRICS: 'true',
      XDG_CACHE_HOME: '/repo/cloudflare-worker/.wrangler/runtime/xdg-cache',
      XDG_CONFIG_HOME: '/repo/cloudflare-worker/.wrangler/runtime/xdg-config',
      XDG_STATE_HOME: '/repo/cloudflare-worker/.wrangler/runtime/xdg-state',
    })
  })

  it('disables Wrangler telemetry by default', () => {
    const paths = getWranglerRuntimePaths({
      isCi: false,
      runAttempt: '1',
      workerDir: '/repo/cloudflare-worker',
      workerPort: '8787',
    })
    const env = createWranglerRuntimeEnv({}, paths)
    expect(env.WRANGLER_SEND_ERROR_REPORTS).toBe('false')
    expect(env.WRANGLER_SEND_METRICS).toBe('false')
  })

  it('falls back to os tmpdir for a blank CI temp root', () => {
    const paths = getWranglerRuntimePaths({
      isCi: true,
      runAttempt: '4',
      tempRoot: '',
      workerDir: '/repo/cloudflare-worker',
      workerPort: '8787',
    })

    expect(paths.root).toBe(join(tmpdir(), 'voucha-wrangler/worker-8787-attempt-4'))
  })

  it('creates the Wrangler runtime directories before startup', () => {
    const tempRoot = mkdtempSync(join(tmpdir(), 'voucha-wrangler-runtime-'))
    try {
      const paths = getWranglerRuntimePaths({
        isCi: true,
        runAttempt: '1',
        tempRoot,
        workerDir: '/repo/cloudflare-worker',
        workerPort: '8787',
      })

      ensureWranglerRuntimeDirs(paths)

      expect(existsSync(paths.cache)).toBe(true)
      expect(existsSync(paths.home)).toBe(true)
      expect(existsSync(paths.logs)).toBe(true)
      expect(existsSync(paths.miniflareCache)).toBe(true)
      expect(existsSync(paths.cfFetchCache)).toBe(false)
      expect(existsSync(paths.persistTo)).toBe(true)
      expect(existsSync(paths.registry)).toBe(true)
      expect(existsSync(paths.tmp)).toBe(true)
      expect(existsSync(paths.xdgCache)).toBe(true)
      expect(existsSync(paths.xdgConfig)).toBe(true)
      expect(existsSync(paths.xdgState)).toBe(true)
    } finally {
      rmSync(tempRoot, { force: true, recursive: true })
    }
  })
})
