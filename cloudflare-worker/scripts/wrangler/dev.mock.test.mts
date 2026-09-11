import { EventEmitter } from 'node:events'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const { spawnMock } = vi.hoisted(() => ({ spawnMock: vi.fn<VitestLooseMock>() }))

vi.mock<typeof import('node:child_process')>(import('node:child_process'), () => ({
  spawn: spawnMock,
}))

const originalArgv = [...process.argv]
let runtimeRoot: string

describe('wrangler dev entrypoint', () => {
  beforeEach(() => {
    runtimeRoot = mkdtempSync(join(tmpdir(), 'voucha-wrangler-dev-test-'))
    process.argv = ['node', 'dev.mts', '--persist-to=/tmp/test-persist']
    vi.stubEnv('CI', 'true')
    vi.stubEnv('RUNNER_TEMP', runtimeRoot)
    spawnMock.mockReset()
    spawnMock.mockReturnValue(new EventEmitter())
    vi.resetModules()
  })

  afterEach(() => {
    process.argv = [...originalArgv]
    vi.unstubAllEnvs()
    rmSync(runtimeRoot, { force: true, recursive: true })
  })

  it('starts Wrangler with the explicit local configuration', async () => {
    await import('./dev.mts')

    expect(spawnMock).toHaveBeenCalledOnce()
    expect(spawnMock.mock.calls[0]?.[1]).toEqual([
      'dev',
      '--config',
      'wrangler.local.jsonc',
      '--persist-to=/tmp/test-persist',
    ])
  })
})
