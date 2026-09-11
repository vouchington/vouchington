import { EventEmitter } from 'node:events'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

interface SpawnSyncCall {
  args: string[]
}

type MockSpawn = (
  command: string,
  args?: readonly string[],
) => ReturnType<typeof import('node:child_process').spawn>

type MockSpawnSync = (
  command: string,
  args?: readonly string[],
) => ReturnType<typeof import('node:child_process').spawnSync>

interface MockChildProcess extends EventEmitter {
  stdout: EventEmitter
  stderr: EventEmitter
}

const spawnSyncCalls: SpawnSyncCall[] = []
// Both the pre-dispatch capture and the lock-acquisition re-capture now go through
// captureHostPressureSnapshotAsync(), which spawns (not spawnSync's) the packaged helper --
// counted here and merged into hostPressureCaptureCount() below so the two call sites share one
// ordered `pressure-reading-N` sequence. spawnSyncCalls is kept only for run-pnpm-command.mts's
// unrelated `hasCommand()` preflight check, which still calls the real spawnSync.
let asyncPressureCaptureCount = 0

// Read from `process.env` at call time (set by a test before importing the module) instead of a
// shared module-scope variable, so each test configures the mocked `--dir web build` spawn's
// stderr chatter -- simulating with-host-lock.sh's own output -- from inside its own `it()` body
// without reassigning state another test could observe.
function readMockNextBuildStderrLines(): string[] {
  const raw = process.env.FILAMENTS_MOCK_NEXT_BUILD_STDERR_LINES
  return raw ? (JSON.parse(raw) as string[]) : []
}

// Same env-at-call-time approach as readMockNextBuildStderrLines() above -- lets a single test
// simulate the locked `next build` command failing (e.g. the watchdog timeout this instrumentation
// targets) without any module-scope state another test could observe.
function readMockNextBuildExitCode(): number {
  const raw = process.env.FILAMENTS_MOCK_NEXT_BUILD_EXIT_CODE
  return raw ? Number(raw) : 0
}

// Real `captureHostPressureSnapshotAsync()` runs unmocked here, backed only by the already-mocked
// `node:child_process.spawn` boundary above -- each captured diagnostics-script invocation
// gets a distinct, ordered `pressure-reading-N` payload so tests can tell captures apart.
function hostPressureCaptureCount(): number {
  return (
    spawnSyncCalls.filter(call =>
      call.args.some(arg => arg.includes('host-pressure-diagnostics.sh')),
    ).length + asyncPressureCaptureCount
  )
}

vi.mock<typeof import('node:fs')>(
  import('node:fs'),
  () =>
    ({
      cpSync: vi.fn<typeof import('node:fs').cpSync>(),
      existsSync: vi.fn<typeof import('node:fs').existsSync>(() => true),
      mkdirSync: vi.fn<typeof import('node:fs').mkdirSync>(),
      renameSync: vi.fn<typeof import('node:fs').renameSync>(),
      rmSync: vi.fn<typeof import('node:fs').rmSync>(),
      writeFileSync: vi.fn<typeof import('node:fs').writeFileSync>(),
    }) as unknown as typeof import('node:fs'),
)

vi.mock<typeof import('node:child_process')>(
  import('node:child_process'),
  () =>
    ({
      spawn: vi.fn<MockSpawn>((_command, args) => {
        const argsList = Array.isArray(args) ? args.map(String) : []
        const buildName = argsList.join(' ')
        const isPressureCapture = argsList.some(arg => arg.includes('host-pressure-diagnostics.sh'))
        const child = new EventEmitter() as unknown as MockChildProcess
        child.stdout = new EventEmitter()
        child.stderr = new EventEmitter()
        if (isPressureCapture) {
          // A real captureHostPressureSnapshotAsync() spawns a genuine child process that resolves
          // via an I/O 'close' event -- a macrotask, always strictly later than any microtask,
          // including the `--dir web build' mock's close below. Modeling it with setImmediate (not
          // another queueMicrotask) is what actually exercises the await-before-write ordering the
          // production fix relies on: a same-microtask mock would pass even without that await.
          setImmediate(() => {
            // captureHostPressureSnapshotAsync()'s spawn-based path -- mirrors the spawnSync mock's
            // numbering below so the two entry points share one ordered `pressure-reading-N` label.
            asyncPressureCaptureCount += 1
            child.stdout.emit('data', Buffer.from(`pressure-reading-${hostPressureCaptureCount()}`))
            child.emit('close', 0)
          })
          return child as unknown as ReturnType<typeof import('node:child_process').spawn>
        }
        queueMicrotask(() => {
          if (buildName === '--dir web build') {
            for (const line of readMockNextBuildStderrLines()) {
              child.stderr.emit('data', Buffer.from(`${line}\n`))
            }
            // 'close' matches run-pnpm-command.mts's contract: it fires only after every stdio
            // 'data' event (emitted synchronously above) has already been delivered.
            child.emit('close', readMockNextBuildExitCode())
            return
          }
          // The cloudflare-worker-build step runs before next-build and isn't wired to the mock
          // next-build stderr/exit-code env vars above -- it always succeeds instantly.
          child.emit('close', 0)
        })
        return child as unknown as ReturnType<typeof import('node:child_process').spawn>
      }),
      spawnSync: vi.fn<MockSpawnSync>((_command, args) => {
        const callArgs = Array.isArray(args) ? args.map(String) : []
        spawnSyncCalls.push({ args: callArgs })
        const isPressureCapture = callArgs.some(arg => arg.includes('host-pressure-diagnostics.sh'))
        return {
          error: undefined,
          output: [],
          pid: 0,
          signal: null,
          status: 0,
          stderr: Buffer.alloc(0),
          stdout: isPressureCapture
            ? Buffer.from(`pressure-reading-${hostPressureCaptureCount()}`)
            : Buffer.alloc(0),
        }
      }),
    }) as unknown as typeof import('node:child_process'),
)

describe('setup-web-integration lock-wait and host-pressure recapture (issue #10937)', () => {
  const originalEnv = { ...process.env }

  beforeEach(async () => {
    vi.resetModules()
    const fs = await import('node:fs')

    spawnSyncCalls.length = 0
    asyncPressureCaptureCount = 0
    vi.mocked(fs.writeFileSync).mockClear()
    process.env = { ...originalEnv }
    delete process.env.FILAMENTS_SETUP_WEB_TIMINGS_JSON
    delete process.env.FILAMENTS_MOCK_NEXT_BUILD_STDERR_LINES
    delete process.env.FILAMENTS_MOCK_NEXT_BUILD_EXIT_CODE
  })

  afterEach(() => {
    process.env = { ...originalEnv }
  })

  it('records next-build-lock-wait and re-captures pressure once the lock queues the build', async () => {
    const fs = await import('node:fs')
    process.env.FILAMENTS_MOCK_NEXT_BUILD_STDERR_LINES = JSON.stringify([
      'with-host-lock: expensive-build acquired after 42s',
    ])
    process.env.FILAMENTS_SETUP_WEB_TIMINGS_JSON = '/tmp/setup-web-timings-lock-wait.json'

    const modulePath = './setup-web-integration.mts?next-build-lock-wait'
    await import(modulePath)

    const calls = vi.mocked(fs.writeFileSync).mock.calls
    const [, reportJson] = calls[calls.length - 1]!
    const report = JSON.parse(String(reportJson)) as {
      timings: Record<string, number>
      hostPressureAtBuildStart: { output: string }
    }
    expect(report.timings['next-build-lock-wait']).toBeGreaterThanOrEqual(0)
    // Two captures: the pre-dispatch fallback, then the re-capture once the acquisition line
    // arrived -- the report must carry the fresher (second) one, not the stale pre-queue one.
    expect(hostPressureCaptureCount()).toBe(2)
    expect(report.hostPressureAtBuildStart.output).toBe('pressure-reading-2')
  })

  it('omits next-build-lock-wait and keeps the pre-dispatch pressure snapshot when the build runs unlocked', async () => {
    const fs = await import('node:fs')
    process.env.FILAMENTS_SETUP_WEB_TIMINGS_JSON = '/tmp/setup-web-timings-no-lock-wait.json'

    const modulePath = './setup-web-integration.mts?next-build-no-lock-wait'
    await import(modulePath)

    const calls = vi.mocked(fs.writeFileSync).mock.calls
    const [, reportJson] = calls[calls.length - 1]!
    const report = JSON.parse(String(reportJson)) as {
      timings: Record<string, number>
      hostPressureAtBuildStart: { output: string }
    }
    expect(report.timings['next-build-lock-wait']).toBeUndefined()
    expect(hostPressureCaptureCount()).toBe(1)
    expect(report.hostPressureAtBuildStart.output).toBe('pressure-reading-1')
  })

  it('ignores an acquisition line naming a different lock', async () => {
    const fs = await import('node:fs')
    process.env.FILAMENTS_MOCK_NEXT_BUILD_STDERR_LINES = JSON.stringify([
      'with-host-lock: memory-heavy acquired after 9s',
    ])
    process.env.FILAMENTS_SETUP_WEB_TIMINGS_JSON = '/tmp/setup-web-timings-other-lock.json'

    const modulePath = './setup-web-integration.mts?next-build-other-lock-name'
    await import(modulePath)

    const calls = vi.mocked(fs.writeFileSync).mock.calls
    const [, reportJson] = calls[calls.length - 1]!
    const report = JSON.parse(String(reportJson)) as { timings: Record<string, number> }
    expect(report.timings['next-build-lock-wait']).toBeUndefined()
    expect(hostPressureCaptureCount()).toBe(1)
  })

  it('forwards next-build stderr output live while watching for the lock-acquired line', async () => {
    const writeSpy = vi.spyOn(process.stderr, 'write').mockReturnValue(true)
    process.env.FILAMENTS_MOCK_NEXT_BUILD_STDERR_LINES = JSON.stringify([
      'with-host-lock: expensive-build acquired after 3s',
      'compiling web build...',
    ])

    try {
      const modulePath = './setup-web-integration.mts?next-build-stderr-forwarding'
      await import(modulePath)

      expect(
        writeSpy.mock.calls.some(([chunk]) => String(chunk).includes('compiling web build...')),
      ).toBe(true)
    } finally {
      writeSpy.mockRestore()
    }
  })

  it('persists next-build-lock-wait in the partial report when the locked build then fails', async () => {
    const fs = await import('node:fs')
    process.env.FILAMENTS_MOCK_NEXT_BUILD_STDERR_LINES = JSON.stringify([
      'with-host-lock: expensive-build acquired after 7s',
    ])
    // Simulates the watchdog remapping a SIGKILL termination to exit 124, per with-host-lock.sh.
    process.env.FILAMENTS_MOCK_NEXT_BUILD_EXIT_CODE = '124'
    process.env.FILAMENTS_SETUP_WEB_TIMINGS_JSON = '/tmp/setup-web-timings-lock-wait-failure.json'

    const modulePath = './setup-web-integration.mts?next-build-lock-wait-failure'
    await expect(import(modulePath)).rejects.toThrow('exit code 124')

    const calls = vi.mocked(fs.writeFileSync).mock.calls
    const [, reportJson] = calls[calls.length - 1]!
    const report = JSON.parse(String(reportJson)) as { timings: Record<string, number> }
    expect(report.timings['next-build-lock-wait']).toBeGreaterThanOrEqual(0)
  })

  it('marks nextBuildLockAcquisitionFailed and skips the lock-wait sample when acquisition times out (issue #10937)', async () => {
    const fs = await import('node:fs')
    process.env.FILAMENTS_MOCK_NEXT_BUILD_STDERR_LINES = JSON.stringify([
      'with-host-lock: expensive-build lock not acquired within 300s',
    ])
    // Mirrors with-host-lock.sh's real fail-closed behavior: a lock-acquisition timeout exits
    // before the wrapped `next build` command ever starts.
    process.env.FILAMENTS_MOCK_NEXT_BUILD_EXIT_CODE = '1'
    process.env.FILAMENTS_SETUP_WEB_TIMINGS_JSON =
      '/tmp/setup-web-timings-lock-acquisition-timeout.json'

    const modulePath = './setup-web-integration.mts?next-build-lock-acquisition-timeout'
    await expect(import(modulePath)).rejects.toThrow('exit code 1')

    const calls = vi.mocked(fs.writeFileSync).mock.calls
    const [, reportJson] = calls[calls.length - 1]!
    const report = JSON.parse(String(reportJson)) as {
      timings: Record<string, number>
      nextBuildLockAcquisitionFailed: boolean
    }
    expect(report.nextBuildLockAcquisitionFailed).toBe(true)
    expect(report.timings['next-build-lock-wait']).toBeUndefined()
    // No re-capture: the acquired-line pattern never matched, only the pre-dispatch capture ran.
    expect(hostPressureCaptureCount()).toBe(1)
  })
})
