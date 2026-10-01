import { spawnSync } from 'node:child_process'
import { cpSync, existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, describe, expect, it, vi } from 'vitest'

import { chromiumLaunchProbeExitCode } from './chromium-launch-probe.mts'

describe('chromiumLaunchProbeExitCode', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('closes the browser it launched and reports success', async () => {
    const close = vi.fn<() => Promise<void>>().mockResolvedValue()

    await expect(chromiumLaunchProbeExitCode(async () => ({ close }))).resolves.toBe(0)
    expect(close).toHaveBeenCalledOnce()
  })

  it('reports failure and the cause when Chromium cannot launch', async () => {
    const stderr = vi.spyOn(process.stderr, 'write').mockReturnValue(true)

    const exitCode = await chromiumLaunchProbeExitCode(async () => {
      throw new Error('missing shared library')
    })

    expect(exitCode).toBe(1)
    expect(stderr).toHaveBeenCalledWith(expect.stringContaining('missing shared library'))
  })

  it('reports failure when the launched browser cannot close', async () => {
    vi.spyOn(process.stderr, 'write').mockReturnValue(true)
    const close = vi.fn<() => Promise<void>>().mockRejectedValue(new Error('already gone'))

    await expect(chromiumLaunchProbeExitCode(async () => ({ close }))).resolves.toBe(1)
  })
})

// Runs a copy of the real entrypoint beside a fake `playwright` package, so the exit status is the
// one the workflow step sees without downloading or starting a browser.
function runProbe(fakePlaywright?: string) {
  const directory = mkdtempSync(join(tmpdir(), 'chromium-launch-probe-'))
  const script = join(directory, 'ci/playwright/chromium-launch-probe.mts')
  mkdirSync(join(directory, 'ci/playwright'), { recursive: true })
  cpSync('ci/playwright/chromium-launch-probe.mts', script)
  if (fakePlaywright !== undefined) {
    const packageDirectory = join(directory, 'node_modules/playwright')
    mkdirSync(packageDirectory, { recursive: true })
    writeFileSync(join(packageDirectory, 'package.json'), '{"name":"playwright","main":"index.js"}')
    writeFileSync(join(packageDirectory, 'index.js'), fakePlaywright)
  }
  try {
    const result = spawnSync(process.execPath, [script], { cwd: directory, encoding: 'utf8' })
    return { ...result, closed: existsSync(join(directory, 'node_modules/playwright/closed')) }
  } finally {
    rmSync(directory, { recursive: true })
  }
}

describe('chromium-launch-probe.mts process contract', () => {
  it('exits 0 after launching and closing Chromium', () => {
    const result = runProbe(`
      const { writeFileSync } = require('node:fs')
      exports.chromium = {
        launch: async () => ({ close: async () => writeFileSync(__dirname + '/closed', '') }),
      }
    `)

    expect(result.status).toBe(0)
    expect(result.closed).toBe(true)
  })

  it('exits non-zero and names the cause when Chromium cannot launch', () => {
    const result = runProbe(`
      exports.chromium = { launch: async () => { throw new Error('missing shared library') } }
    `)

    expect(result.status).not.toBe(0)
    expect(result.stderr).toContain('missing shared library')
  })

  it('exits non-zero when Playwright cannot be resolved', () => {
    const result = runProbe()

    expect(result.status).not.toBe(0)
  })
})
