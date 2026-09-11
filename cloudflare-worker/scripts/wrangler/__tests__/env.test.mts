import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, describe, expect, it, vi } from 'vitest'

import { loadStartWranglerEnv, readInspectorPort } from '../env.mts'

describe('start-wrangler env', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('loads CI startup env without INSPECTOR_PORT', () => {
    const tempRoot = mkdtempSync(join(tmpdir(), 'voucha-wrangler-env-'))
    try {
      const workerDir = join(tempRoot, 'cloudflare-worker')
      mkdirSync(join(workerDir, 'dist'), { recursive: true })
      mkdirSync(join(workerDir, 'scripts', 'wrangler'), { recursive: true })
      mkdirSync(join(workerDir, 'node_modules', 'workerd'), { recursive: true })
      mkdirSync(join(workerDir, 'node_modules', 'wrangler'), { recursive: true })
      writeFileSync(join(workerDir, 'dist', 'index.js'), '')
      writeFileSync(
        join(workerDir, 'node_modules', 'workerd', 'package.json'),
        '{"version":"1.2.3"}',
      )
      writeFileSync(
        join(workerDir, 'node_modules', 'wrangler', 'package.json'),
        '{"version":"4.5.6"}',
      )

      const env = loadStartWranglerEnv(
        {
          CI: 'true',
          GITHUB_RUN_ATTEMPT: '3',
          TMPDIR: tempRoot,
          WORKER_PORT: '3902',
        },
        join(workerDir, 'scripts', 'wrangler'),
      )

      expect(env.isCi).toBe(true)
      expect(env.inspectorPort).toBe('0')
      expect(env.wranglerArgs.args).toContain('--inspector-port')
      expect(env.wranglerArgs.args).toContain('0')
    } finally {
      rmSync(tempRoot, { force: true, recursive: true })
    }
  })

  it('falls back to TMPDIR when CI RUNNER_TEMP is blank', () => {
    const tempRoot = mkdtempSync(join(tmpdir(), 'voucha-wrangler-env-'))
    try {
      const workerDir = join(tempRoot, 'cloudflare-worker')
      mkdirSync(join(workerDir, 'dist'), { recursive: true })
      mkdirSync(join(workerDir, 'scripts', 'wrangler'), { recursive: true })
      mkdirSync(join(workerDir, 'node_modules', 'workerd'), { recursive: true })
      mkdirSync(join(workerDir, 'node_modules', 'wrangler'), { recursive: true })
      writeFileSync(join(workerDir, 'dist', 'index.js'), '')
      writeFileSync(
        join(workerDir, 'node_modules', 'workerd', 'package.json'),
        '{"version":"1.2.3"}',
      )
      writeFileSync(
        join(workerDir, 'node_modules', 'wrangler', 'package.json'),
        '{"version":"4.5.6"}',
      )

      const env = loadStartWranglerEnv(
        {
          CI: 'true',
          GITHUB_RUN_ATTEMPT: '3',
          RUNNER_TEMP: '',
          TMPDIR: tempRoot,
          WORKER_PORT: '3902',
        },
        join(workerDir, 'scripts', 'wrangler'),
      )

      expect(env.wranglerRuntimePaths.root).toBe(
        join(tempRoot, 'voucha-wrangler/worker-3902-attempt-3'),
      )
    } finally {
      rmSync(tempRoot, { force: true, recursive: true })
    }
  })

  it('requires INSPECTOR_PORT outside CI', () => {
    const stderrSpy = vi.spyOn(process.stderr, 'write').mockReturnValue(true)
    const exitSpy = vi.spyOn(process, 'exit').mockReturnValue(undefined as never)

    expect(() => readInspectorPort(false, {})).toThrow('unreachable: process.exit returned')
    expect(stderrSpy).toHaveBeenCalledWith('start-wrangler: INSPECTOR_PORT is required\n')
    expect(exitSpy).toHaveBeenCalledWith(1)
  })
})
