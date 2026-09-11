import { existsSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'

import { join } from 'node:path'

import { tmpdir } from 'node:os'

import { describe, expect, it } from 'vitest'

import {
  buildWranglerArgs,
  getStaleWranglerCachePaths,
  resolveEffectiveInspectorPort,
} from '../config.mts'

import {
  createWranglerRuntimeEnv,
  ensureWranglerRuntimeDirs,
  getWranglerPersistToPath,
  getWranglerRuntimePaths,
} from '../runtime.mts'

import { hasWranglerHttpsCerts, readInspectorPort, resolveCloudflareWorkerDir } from '../env.mts'

const DEFAULT_CI_RUNTIME_ROOT = join(tmpdir(), 'voucha-wrangler/worker-3902-attempt-2')

const baseOptions = {
  certPath: '/repo/dev/certs/localhost.pem',
  hasCerts: false,
  inspectorPort: '3904',
  isCi: true,
  keyPath: '/repo/dev/certs/localhost-key.pem',
  persistTo: getWranglerPersistToPath('3902', '2'),
  workerPort: '3902',
}

describe('start-wrangler config', () => {
  it('builds CI wrangler args with dist bundle, persist-to, and error logging', () => {
    const result = buildWranglerArgs(baseOptions)

    expect(result.persistTo).toBe(join(DEFAULT_CI_RUNTIME_ROOT, 'persist'))
    expect(result.logLevel).toBe('error')
    expect(result.args).toEqual([
      'dev',
      'dist/index.js',
      '--no-bundle',
      '--config',
      'wrangler.local.jsonc',
      '--local',
      '--port',
      '3902',
      '--inspector-port',
      '0',
      '--ip',
      '0.0.0.0',
      '--persist-to',
      join(DEFAULT_CI_RUNTIME_ROOT, 'persist'),
      '--log-level=error',
    ])
  })

  it('builds local wrangler args with dist bundle, workspace persist-to, and no logging', () => {
    const result = buildWranglerArgs({
      ...baseOptions,
      isCi: false,
      persistTo: '/repo/cloudflare-worker/.wrangler/runtime/persist',
    })

    expect(result.persistTo).toBe('/repo/cloudflare-worker/.wrangler/runtime/persist')
    expect(result.logLevel).toBe('none')
    expect(result.args).toEqual([
      'dev',
      'dist/index.js',
      '--no-bundle',
      '--config',
      'wrangler.local.jsonc',
      '--local',
      '--port',
      '3902',
      '--inspector-port',
      '3904',
      '--ip',
      '0.0.0.0',
      '--persist-to',
      '/repo/cloudflare-worker/.wrangler/runtime/persist',
      '--log-level=none',
    ])
  })

  it('targets the configured runtime directory for CI stale cache cleanup', () => {
    const runtimePaths = getWranglerRuntimePaths({
      isCi: true,
      runAttempt: '2',
      workerDir: '/repo/cloudflare-worker',
      workerPort: '3902',
    })

    expect(
      getStaleWranglerCachePaths({
        isCi: true,
        persistTo: runtimePaths.persistTo,
        runtimePaths,
        workerDir: '/repo/cloudflare-worker',
      }),
    ).toEqual([DEFAULT_CI_RUNTIME_ROOT])
  })

  it('targets local Wrangler state for local stale cache cleanup', () => {
    expect(
      getStaleWranglerCachePaths({
        isCi: false,
        runtimePaths: getWranglerRuntimePaths({
          isCi: false,
          runAttempt: '2',
          workerDir: '/repo/cloudflare-worker',
          workerPort: '3902',
        }),
        workerDir: '/repo/cloudflare-worker',
      }),
    ).toEqual([
      '/repo/cloudflare-worker/.wrangler/runtime',
      '/repo/cloudflare-worker/.wrangler/state',
    ])
  })

  it('builds runtime paths under temp in CI and the worker workspace locally', () => {
    expect(
      getWranglerRuntimePaths({
        isCi: true,
        runAttempt: '4',
        tempRoot: '/runner/tmp',
        workerDir: '/repo/cloudflare-worker',
        workerPort: '3902',
      }).root,
    ).toBe('/runner/tmp/voucha-wrangler/worker-3902-attempt-4')

    expect(
      getWranglerRuntimePaths({
        isCi: false,
        runAttempt: '4',
        workerDir: '/repo/cloudflare-worker',
        workerPort: '3902',
      }).root,
    ).toBe('/repo/cloudflare-worker/.wrangler/runtime')
  })

  it('creates the explicit Wrangler persist directory before startup', () => {
    const tempRoot = mkdtempSync(join(tmpdir(), 'voucha-wrangler-runtime-'))
    try {
      const paths = getWranglerRuntimePaths({
        isCi: true,
        runAttempt: '1',
        tempRoot,
        workerDir: '/repo/cloudflare-worker',
        workerPort: '3902',
      })

      ensureWranglerRuntimeDirs(paths)

      expect(existsSync(paths.persistTo)).toBe(true)
    } finally {
      rmSync(tempRoot, { force: true, recursive: true })
    }
  })

  it('resolves the worker root from the nested wrangler script directory', () => {
    expect(resolveCloudflareWorkerDir('/repo/cloudflare-worker/scripts/wrangler')).toBe(
      '/repo/cloudflare-worker',
    )
  })

  it('allows smoke tests to force HTTP even when local certs exist', () => {
    const tempRoot = mkdtempSync(join(tmpdir(), 'voucha-wrangler-certs-'))
    try {
      const certPath = join(tempRoot, 'localhost.pem')
      const keyPath = join(tempRoot, 'localhost-key.pem')
      writeFileSync(certPath, 'cert')
      writeFileSync(keyPath, 'key')

      expect(hasWranglerHttpsCerts(certPath, keyPath, {})).toBe(true)
      const forceHttpEnv = { WRANGLER_LOCAL_PROTOCOL: 'http' }
      expect(hasWranglerHttpsCerts(certPath, keyPath, forceHttpEnv)).toBe(false)
      expect(hasWranglerHttpsCerts(certPath, keyPath, { WRANGLER_FORCE_HTTP: '1' })).toBe(false)
    } finally {
      rmSync(tempRoot, { force: true, recursive: true })
    }
  })

  it('overrides user-home Wrangler runtime env paths', () => {
    const runtimePaths = getWranglerRuntimePaths({
      isCi: false,
      runAttempt: '2',
      workerDir: '/repo/cloudflare-worker',
      workerPort: '3902',
    })
    const env = createWranglerRuntimeEnv(
      {
        HOME: '/Users/jong',
        TMPDIR: '/var/folders/system-temp',
        WRANGLER_LOG_PATH: '/Users/jong/Library/Preferences/.wrangler/logs',
      },
      runtimePaths,
    )

    expect(env.HOME).toBe('/repo/cloudflare-worker/.wrangler/runtime/home')
    expect(env.TMPDIR).toBe('/repo/cloudflare-worker/.wrangler/runtime/tmp')
    expect(env.WRANGLER_LOG_PATH).toBe('/repo/cloudflare-worker/.wrangler/runtime/logs')
    expect(env.WRANGLER_REGISTRY_PATH).toBe('/repo/cloudflare-worker/.wrangler/runtime/registry')
    expect(env.WRANGLER_CACHE_DIR).toBe('/repo/cloudflare-worker/.wrangler/runtime/cache')
    expect(env.MINIFLARE_CACHE_DIR).toBe(
      '/repo/cloudflare-worker/.wrangler/runtime/miniflare-cache',
    )
    expect(env.CLOUDFLARE_CF_FETCH_PATH).toBe('/repo/cloudflare-worker/.wrangler/runtime/cf-fetch')
  })

  it('adds local HTTPS cert args when certs are present', () => {
    const result = buildWranglerArgs({ ...baseOptions, hasCerts: true, isCi: false })

    expect(result.args).toContain('--local-protocol')
    expect(result.args).toContain('https')
    expect(result.args).toContain('--https-cert-path')
    expect(result.args).toContain('/repo/dev/certs/localhost.pem')
    expect(result.args).toContain('--https-key-path')
    expect(result.args).toContain('/repo/dev/certs/localhost-key.pem')
  })

  it('uses WRANGLER_LOG_LEVEL override for CI and local args', () => {
    const ci = buildWranglerArgs({ ...baseOptions, logLevelOverride: 'debug' })
    const local = buildWranglerArgs({ ...baseOptions, isCi: false, logLevelOverride: 'warn' })

    expect(ci.logLevel).toBe('debug')
    expect(ci.args.at(-1)).toBe('--log-level=debug')
    expect(local.logLevel).toBe('warn')
    expect(local.args.at(-1)).toBe('--log-level=warn')
  })

  it('resolves inspector port to 0 in CI so the OS picks a free port atomically', () => {
    expect(resolveEffectiveInspectorPort(true, '46867')).toBe('0')
  })

  it('preserves the configured inspector port for local dev', () => {
    expect(resolveEffectiveInspectorPort(false, '3904')).toBe('3904')
  })

  it('does not require INSPECTOR_PORT in CI startup env', () => {
    expect(readInspectorPort(true, {})).toBe('0')
    expect(readInspectorPort(true, { INSPECTOR_PORT: '3904' })).toBe('3904')
  })
})
