import { spawnSync } from 'node:child_process'
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const SCRIPT = resolve('ci/web-build-cache-manifest.mts')
const IDENTITY = {
  GITHUB_SHA: 'a'.repeat(40),
  GITHUB_RUN_ID: '12345',
  GITHUB_RUN_ATTEMPT: '1',
  RUNNER_OS: 'Linux',
  RUNNER_ARCH: 'X64',
}

function run(mode: 'write' | 'verify', workspace: string, identity = IDENTITY) {
  return spawnSync(process.execPath, [SCRIPT, mode], {
    cwd: workspace,
    encoding: 'utf8',
    env: { ...process.env, ...identity },
  })
}

function seedRuntime(workspace: string) {
  for (const dir of [
    'web/.next/standalone/web/public',
    'web/.next/standalone/web/.next/static',
    'web/.next/static',
    'cloudflare-worker/dist',
  ]) {
    mkdirSync(join(workspace, dir), { recursive: true })
  }
  for (const file of [
    'web/.next/standalone/web/server.js',
    'web/.next/standalone/web/.next/static/asset.js',
    'web/.next/static/asset.js',
    'cloudflare-worker/dist/index.js',
  ]) {
    writeFileSync(join(workspace, file), 'runtime asset')
  }
}

describe('shared web build cache manifest', () => {
  it('accepts a complete runtime tree from the same workflow attempt', () => {
    const workspace = mkdtempSync(join(tmpdir(), 'web-build-cache-manifest-'))
    try {
      seedRuntime(workspace)
      expect(run('write', workspace).status).toBe(0)
      expect(run('verify', workspace).status).toBe(0)
    } finally {
      rmSync(workspace, { recursive: true, force: true })
    }
  })

  it('rejects incomplete output and an entry from another attempt', () => {
    const workspace = mkdtempSync(join(tmpdir(), 'web-build-cache-manifest-'))
    try {
      seedRuntime(workspace)
      expect(run('write', workspace).status).toBe(0)
      expect(run('verify', workspace, { ...IDENTITY, GITHUB_RUN_ATTEMPT: '2' }).status).not.toBe(0)
      rmSync(join(workspace, 'web/.next/static/asset.js'))
      expect(run('verify', workspace).status).not.toBe(0)
    } finally {
      rmSync(workspace, { recursive: true, force: true })
    }
  })
})
