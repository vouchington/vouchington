import { EventEmitter } from 'node:events'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

interface SpawnCall {
  command: string
  args: string[]
  cwd: string | undefined
  env: NodeJS.ProcessEnv
}

interface SpawnSyncCall {
  command: string
  args: string[]
}

type MockSpawn = (
  command: string,
  args?: readonly string[],
  options?: { cwd?: string; env?: NodeJS.ProcessEnv },
) => ReturnType<typeof import('node:child_process').spawn>

type MockSpawnSync = (
  command: string,
  args?: readonly string[],
) => ReturnType<typeof import('node:child_process').spawnSync>

interface MockChildProcess extends EventEmitter {
  stderr: EventEmitter
}

const spawnCalls: SpawnCall[] = []
const spawnSyncCalls: SpawnSyncCall[] = []

// Every knob below is read from `process.env` at call time rather than a shared module-scope
// variable, so each test can configure the mock from inside its own `it()` body without
// reassigning state another test could observe.
function readMockUnavailableCommands(): string[] {
  const raw = process.env.FILAMENTS_MOCK_UNAVAILABLE_COMMANDS
  return raw ? (JSON.parse(raw) as string[]) : []
}

function readMockChildExitCode(): number {
  const raw = process.env.FILAMENTS_MOCK_CHILD_EXIT_CODE
  return raw ? Number(raw) : 0
}

function readMockChildStderrLines(): string[] {
  const raw = process.env.FILAMENTS_MOCK_CHILD_STDERR_LINES
  return raw ? (JSON.parse(raw) as string[]) : []
}

vi.mock<typeof import('node:child_process')>(
  import('node:child_process'),
  () =>
    ({
      spawn: vi.fn<MockSpawn>((command, args, options) => {
        spawnCalls.push({
          command: String(command),
          args: Array.isArray(args) ? args.map(String) : [],
          cwd: typeof options?.cwd === 'string' ? options.cwd : undefined,
          env: options?.env ?? {},
        })
        const child = new EventEmitter() as unknown as MockChildProcess
        child.stderr = new EventEmitter()
        queueMicrotask(() => {
          for (const line of readMockChildStderrLines()) {
            child.stderr.emit('data', Buffer.from(`${line}\n`))
          }
          // 'close' matches the real Node contract the source now relies on: it fires only after
          // all stdio 'data' events (emitted synchronously above) have already been delivered.
          child.emit('close', readMockChildExitCode())
        })
        return child as unknown as ReturnType<typeof import('node:child_process').spawn>
      }),
      spawnSync: vi.fn<MockSpawnSync>((command, args) => {
        spawnSyncCalls.push({
          command: String(command),
          args: Array.isArray(args) ? args.map(String) : [],
        })
        const unavailable = readMockUnavailableCommands().includes(String(command))
        return {
          error: unavailable ? new Error(`${String(command)}: command not found`) : undefined,
          output: [],
          pid: 0,
          signal: null,
          status: unavailable ? null : 0,
          stderr: Buffer.alloc(0),
          stdout: Buffer.alloc(0),
        }
      }),
    }) as unknown as typeof import('node:child_process'),
)

describe('run-pnpm-command', () => {
  const originalEnv = { ...process.env }

  beforeEach(() => {
    vi.resetModules()
    spawnCalls.length = 0
    spawnSyncCalls.length = 0
    process.env = { ...originalEnv }
    delete process.env.FILAMENTS_MOCK_UNAVAILABLE_COMMANDS
    delete process.env.FILAMENTS_MOCK_CHILD_EXIT_CODE
    delete process.env.FILAMENTS_MOCK_CHILD_STDERR_LINES
  })

  afterEach(() => {
    process.env = { ...originalEnv }
  })

  it('runs pnpm directly when the pnpm binary is available', async () => {
    const { runPnpm } = await import('./run-pnpm-command.mts')

    await runPnpm('/repo', ['--dir', 'web', 'build'], { NODE_ENV: 'production' })

    expect(spawnCalls).toEqual([
      expect.objectContaining({ command: 'pnpm', args: ['--dir', 'web', 'build'], cwd: '/repo' }),
    ])
    expect(spawnCalls[0]!.env.NODE_ENV).toBe('production')
  })

  it('falls back to corepack pnpm when the pnpm binary is unavailable', async () => {
    process.env.FILAMENTS_MOCK_UNAVAILABLE_COMMANDS = JSON.stringify(['pnpm'])
    const { runPnpm } = await import('./run-pnpm-command.mts')

    await runPnpm('/repo', ['--dir', 'web', 'build'])

    expect(spawnCalls).toEqual([
      expect.objectContaining({ command: 'corepack', args: ['pnpm', '--dir', 'web', 'build'] }),
    ])
  })

  it('throws when neither pnpm nor corepack is available', async () => {
    process.env.FILAMENTS_MOCK_UNAVAILABLE_COMMANDS = JSON.stringify(['pnpm', 'corepack'])
    const { runPnpm } = await import('./run-pnpm-command.mts')

    await expect(runPnpm('/repo', ['--dir', 'web', 'build'])).rejects.toThrow(
      'pnpm is not available. Install pnpm 11 or enable Corepack before building web.',
    )
    expect(spawnCalls).toEqual([])
  })

  it('rejects when the child process exits non-zero', async () => {
    process.env.FILAMENTS_MOCK_CHILD_EXIT_CODE = '1'
    const { runPnpm } = await import('./run-pnpm-command.mts')

    await expect(runPnpm('/repo', ['--dir', 'web', 'build'])).rejects.toThrow(
      'pnpm --dir web build failed with exit code 1',
    )
  })

  it('forwards stderr line-by-line to onStderrLine while still writing every byte to real stderr', async () => {
    process.env.FILAMENTS_MOCK_CHILD_STDERR_LINES = JSON.stringify(['compiling...', 'done'])
    const writeSpy = vi.spyOn(process.stderr, 'write').mockReturnValue(true)
    const seenLines: string[] = []

    try {
      const { runPnpm } = await import('./run-pnpm-command.mts')

      await runPnpm(
        '/repo',
        ['--dir', 'web', 'build'],
        {},
        { onStderrLine: line => seenLines.push(line) },
      )

      expect(seenLines).toEqual(['compiling...', 'done'])
      expect(writeSpy.mock.calls.some(([chunk]) => String(chunk).includes('compiling...'))).toBe(
        true,
      )
    } finally {
      writeSpy.mockRestore()
    }
  })
})
