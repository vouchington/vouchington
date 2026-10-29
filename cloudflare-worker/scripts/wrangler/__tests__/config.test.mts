import { join } from 'node:path'

import { tmpdir } from 'node:os'

import { describe, expect, it } from 'vitest'

import { buildWranglerArgs, getStaleWranglerCachePaths } from '../config.mts'

import { getWranglerPersistToPath, getWranglerRuntimePaths } from '../runtime.mts'

import { resolveCloudflareWorkerDir } from '../env.mts'

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

  it('resolves the worker root from the nested wrangler script directory', () => {
    expect(resolveCloudflareWorkerDir('/repo/cloudflare-worker/scripts/wrangler')).toBe(
      '/repo/cloudflare-worker',
    )
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
})
