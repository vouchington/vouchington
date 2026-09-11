import { EventEmitter } from 'node:events'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

type MockSpawn = () => ReturnType<typeof import('node:child_process').spawn>

interface MockChildProcess extends EventEmitter {
  stdout: EventEmitter
  stderr: EventEmitter
  kill: (signal?: string) => void
  pid?: number
}

function createMockChild(pid?: number): MockChildProcess {
  const child = new EventEmitter() as MockChildProcess
  child.stdout = new EventEmitter()
  child.stderr = new EventEmitter()
  child.kill = vi.fn<(signal?: string) => void>()
  child.pid = pid
  return child
}

const spawnMock = vi.fn<MockSpawn>()

vi.mock<typeof import('node:child_process')>(
  import('node:child_process'),
  () =>
    ({
      spawn: spawnMock,
    }) as unknown as typeof import('node:child_process'),
)

describe('captureHostPressureSnapshotAsync', () => {
  beforeEach(() => {
    vi.resetModules()
    spawnMock.mockReset()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('resolves ok:true with the helper stdout on a normal capture', async () => {
    const child = createMockChild()
    spawnMock.mockReturnValue(
      child as unknown as ReturnType<typeof import('node:child_process').spawn>,
    )

    const { captureHostPressureSnapshotAsync } = await import('./host-pressure-snapshot.mts')
    const pending = captureHostPressureSnapshotAsync()
    child.stdout.emit('data', Buffer.from('== host pressure diagnostics ==\nplatform: Darwin\n'))
    child.emit('close', 0)

    const snapshot = await pending
    expect(snapshot.ok).toBe(true)
    expect(snapshot.output).toContain('platform: Darwin')
  })

  it('resolves ok:false with the stderr message when stdout is empty', async () => {
    const child = createMockChild()
    spawnMock.mockReturnValue(
      child as unknown as ReturnType<typeof import('node:child_process').spawn>,
    )

    const { captureHostPressureSnapshotAsync } = await import('./host-pressure-snapshot.mts')
    const pending = captureHostPressureSnapshotAsync()
    child.stderr.emit('data', Buffer.from('host-pressure-diagnostics: packaged helper missing\n'))
    child.emit('close', 1)

    const snapshot = await pending
    expect(snapshot.ok).toBe(false)
    expect(snapshot.output).toContain('packaged helper missing')
  })

  it('resolves ok:false when spawn itself throws synchronously', async () => {
    spawnMock.mockImplementation(() => {
      throw new Error('spawn bash ENOENT')
    })

    const { captureHostPressureSnapshotAsync } = await import('./host-pressure-snapshot.mts')
    const snapshot = await captureHostPressureSnapshotAsync()

    expect(snapshot.ok).toBe(false)
    expect(snapshot.output).toBe('host-pressure-snapshot: spawn bash ENOENT')
  })

  it('resolves ok:false when the child process emits an error event', async () => {
    const child = createMockChild()
    spawnMock.mockReturnValue(
      child as unknown as ReturnType<typeof import('node:child_process').spawn>,
    )

    const { captureHostPressureSnapshotAsync } = await import('./host-pressure-snapshot.mts')
    const pending = captureHostPressureSnapshotAsync()
    child.emit('error', new Error('spawn bash EACCES'))

    const snapshot = await pending
    expect(snapshot.ok).toBe(false)
    expect(snapshot.output).toBe('host-pressure-snapshot: spawn bash EACCES')
  })

  it('falls back to killing the direct child when it has no pid to form a process group from', async () => {
    vi.useFakeTimers()
    const child = createMockChild()
    spawnMock.mockReturnValue(
      child as unknown as ReturnType<typeof import('node:child_process').spawn>,
    )

    const { captureHostPressureSnapshotAsync } = await import('./host-pressure-snapshot.mts')
    const pending = captureHostPressureSnapshotAsync()
    await vi.advanceTimersByTimeAsync(10_000)

    const snapshot = await pending
    expect(snapshot.ok).toBe(false)
    expect(snapshot.output).toBe('host-pressure-snapshot: timed out')
    expect(child.kill).toHaveBeenCalledWith('SIGKILL')
  })

  it('SIGKILLs the whole process group via the negative pid on timeout, not just the direct child', async () => {
    // Regression coverage for the bug this behavior fixes: a plain `child.kill()` only signals
    // the direct shell, so a descendant the packaged helper forks (e.g. a `ps`/pipe stage) can
    // survive as an orphan holding stdout/stderr open, stalling this Node process's own exit past
    // the advertised timeout even though the returned promise already resolved.
    vi.useFakeTimers()
    const processKillSpy = vi.spyOn(process, 'kill').mockReturnValue(true)
    const child = createMockChild(4242)
    spawnMock.mockReturnValue(
      child as unknown as ReturnType<typeof import('node:child_process').spawn>,
    )

    const { captureHostPressureSnapshotAsync } = await import('./host-pressure-snapshot.mts')
    const pending = captureHostPressureSnapshotAsync()
    await vi.advanceTimersByTimeAsync(10_000)

    const snapshot = await pending
    expect(snapshot.ok).toBe(false)
    expect(processKillSpy).toHaveBeenCalledWith(-4242, 'SIGKILL')
    expect(child.kill).not.toHaveBeenCalled()
    processKillSpy.mockRestore()
  })

  it('falls back to killing the direct child when the process group no longer exists', async () => {
    vi.useFakeTimers()
    const processKillSpy = vi.spyOn(process, 'kill').mockImplementation(() => {
      throw Object.assign(new Error('kill ESRCH'), { code: 'ESRCH' })
    })
    const child = createMockChild(4242)
    spawnMock.mockReturnValue(
      child as unknown as ReturnType<typeof import('node:child_process').spawn>,
    )

    const { captureHostPressureSnapshotAsync } = await import('./host-pressure-snapshot.mts')
    const pending = captureHostPressureSnapshotAsync()
    await vi.advanceTimersByTimeAsync(10_000)

    const snapshot = await pending
    expect(snapshot.ok).toBe(false)
    expect(child.kill).toHaveBeenCalledWith('SIGKILL')
    processKillSpy.mockRestore()
  })
})
