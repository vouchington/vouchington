import { EventEmitter } from 'node:events'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const { spawnMock } = vi.hoisted(() => ({ spawnMock: vi.fn<VitestLooseMock>() }))

vi.mock<typeof import('node:child_process')>(import('node:child_process'), () => ({
  spawn: spawnMock,
}))

// The real bundlePath/cert existsSync checks in env.mts would fail in CI, where this unit test
// runs before cloudflare-worker is built (build-web/build-backend depend on the `tests` job, see
// .github/workflows/ci.yml). Only existsSync needs stubbing -- mkdirSync/rmSync/createWriteStream
// stay real against the mkdtempSync root below, matching dev.mock.test.mts's approach.
vi.mock<typeof import('node:fs')>(import('node:fs'), async importOriginal => {
  const actual = await importOriginal<typeof import('node:fs')>()
  return {
    ...actual,
    existsSync: vi.fn<VitestLooseMock>(() => true),
  }
})

type MockWranglerProcess = EventEmitter & { stderr: EventEmitter; stdout: EventEmitter }

function createMockWranglerProcess(): MockWranglerProcess {
  const proc = new EventEmitter() as MockWranglerProcess
  proc.stdout = new EventEmitter()
  proc.stderr = new EventEmitter()
  return proc
}

let runtimeRoot: string

describe('wrangler dev supervised restart', () => {
  beforeEach(() => {
    runtimeRoot = mkdtempSync(join(tmpdir(), 'voucha-wrangler-start-test-'))
    vi.stubEnv('CI', 'true')
    vi.stubEnv('INSPECTOR_PORT', '0')
    vi.stubEnv('RUNNER_TEMP', runtimeRoot)
    vi.stubEnv('WORKER_LOG_DIR', '')
    vi.stubEnv('WORKER_PORT', '18787')
    vi.stubEnv('WRANGLER_LOCAL_PROTOCOL', 'http')
    spawnMock.mockReset()
    vi.resetModules()
  })

  afterEach(() => {
    vi.unstubAllEnvs()
    rmSync(runtimeRoot, { force: true, recursive: true })
  })

  it('restarts wrangler after an unexpected crash mid-suite, within the burst-window budget', async () => {
    const processes: MockWranglerProcess[] = []
    spawnMock.mockImplementation(() => {
      const proc = createMockWranglerProcess()
      processes.push(proc)
      return proc
    })
    const stderrWrites: string[] = []
    const stderrSpy = vi
      .spyOn(process.stderr, 'write')
      .mockImplementation((chunk: unknown): boolean => {
        stderrWrites.push(String(chunk))
        return true
      })

    await import('./start.mts')
    expect(spawnMock).toHaveBeenCalledTimes(1)

    // signal: null means the child died on its own (a crash), not an external kill -- the case
    // start.mts's close handler must restart, computing burst-relative uptime and attempt.
    processes[0]!.emit('close', 1, null)

    await vi.waitFor(() => {
      expect(spawnMock).toHaveBeenCalledTimes(2)
    })

    expect(stderrWrites.some(line => line.includes('restarting wrangler (attempt 1/5)'))).toBe(true)

    stderrSpy.mockRestore()
  })
})
