import { existsSync, readFileSync, rmSync } from 'node:fs'
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  formatExitStatus,
  POST_READY_EXIT_MARKER_PREFIX,
} from '../../integration-tests/web/helpers/exit-diagnostics.mts'
import {
  startManagedProcess,
  type ManagedProcess,
  waitForService,
} from '../../integration-tests/web/helpers/processes.mts'
import { allocateReservedPorts } from '../../integration-tests/web/helpers/ports.mts'

describe('web integration managed processes', () => {
  afterEach(() => {
    rmSync('integration-tests/web/artifacts/service-logs', { force: true, recursive: true })
  })

  it('persists child stdout and stderr to a service log', async () => {
    await withManagedProcess(
      startTestProcess('log-capture', [
        String.raw`process.stdout.write('stdout line\n')`,
        String.raw`process.stderr.write('stderr line\n')`,
        'setInterval(() => {}, 1000)',
      ]),
      async managedProcess => {
        await waitForLog(managedProcess.logPath, 'stdout line')
        await waitForLog(managedProcess.logPath, 'stderr line')

        const log = readFileSync(managedProcess.logPath, 'utf8')
        expect(log).toContain('stdout line')
        expect(log).toContain('stderr line')
      },
    )
  })

  it('fails readiness when a managed process exits before becoming healthy', async () => {
    await withManagedProcess(
      startTestProcess('early-exit', [
        String.raw`process.stderr.write('backend exploded before listen\n')`,
        'process.exit(1)',
      ]),
      async managedProcess => {
        const waitForBackend = waitForService(
          'backend',
          'http://127.0.0.1:1/infra/ping',
          [200],
          managedProcess,
        )

        await expect(waitForBackend).rejects.toThrow(/Service backend exited with code 1/)
        await expect(waitForBackend).rejects.toThrow(/backend exploded before listen/)
      },
    )
  })

  it('waits for fast-exiting process logs before reporting readiness failure', async () => {
    await withManagedProcess(
      startTestProcess('fast-stderr-exit', [
        String.raw`process.stderr.write('early stderr before immediate exit\n')`,
        'process.exit(1)',
      ]),
      async managedProcess => {
        await expect(
          waitForService('backend', 'http://127.0.0.1:1/infra/ping', [200], managedProcess),
        ).rejects.toThrow(/early stderr before immediate exit/)
      },
    )
  })

  it('fails readiness when a managed process cannot spawn', async () => {
    await withManagedProcess(
      startManagedProcess({
        name: 'missing-command',
        command: 'definitely-missing-web-integration-command',
        args: [],
        cwd: process.cwd(),
        logFilePrefix: 'test-missing-command',
      }),
      async managedProcess => {
        await expect(
          waitForService('backend', 'http://127.0.0.1:1/infra/ping', [200], managedProcess),
        ).rejects.toThrow(/Service backend exited with error/)
        await expect(managedProcess.exited).resolves.toMatchObject({
          code: null,
          signal: null,
        })
      },
    )
  })

  it('does not reject when a ready managed process exits later', async () => {
    const reservation = await releasedReservation()
    const stderrSpy = vi.spyOn(process.stderr, 'write').mockReturnValue(true)
    try {
      await withManagedProcess(
        startTestProcess('ready-then-exit', [
          "const http = require('node:http')",
          "const server = http.createServer((_request, response) => response.end('ok'))",
          `server.listen(${String(reservation.port)}, '127.0.0.1', () => {`,
          '  setTimeout(() => server.close(() => process.exit(0)), 1500)',
          '})',
        ]),
        async managedProcess => {
          await expect(
            waitForService(
              'backend',
              `http://127.0.0.1:${String(reservation.port)}/infra/ping`,
              [200],
              managedProcess,
            ),
          ).resolves.toBeUndefined()
          const exit = await managedProcess.exited
          expect(writtenStderr(stderrSpy)).toContain(
            `${POST_READY_EXIT_MARKER_PREFIX} backend exited unexpectedly after ready: ${formatExitStatus(exit)}`,
          )
        },
      )
    } finally {
      stderrSpy.mockRestore()
    }
  })

  it('suppresses the post-ready exit marker when stop() initiates the exit', async () => {
    const reservation = await releasedReservation()
    const stderrSpy = vi.spyOn(process.stderr, 'write').mockReturnValue(true)
    try {
      await withManagedProcess(
        startTestProcess('ready-then-stop', [
          "const http = require('node:http')",
          "const server = http.createServer((_request, response) => response.end('ok'))",
          `server.listen(${String(reservation.port)}, '127.0.0.1')`,
        ]),
        async managedProcess => {
          await expect(
            waitForService(
              'backend',
              `http://127.0.0.1:${String(reservation.port)}/infra/ping`,
              [200],
              managedProcess,
            ),
          ).resolves.toBeUndefined()
          await managedProcess.stop()
          expect(writtenStderr(stderrSpy)).not.toContain(POST_READY_EXIT_MARKER_PREFIX)
        },
      )
    } finally {
      stderrSpy.mockRestore()
    }
  })
})

function startTestProcess(logFilePrefix: string, scriptLines: string[]): ManagedProcess {
  return startManagedProcess({
    name: logFilePrefix,
    command: process.execPath,
    args: ['-e', scriptLines.join(';')],
    cwd: process.cwd(),
    logFilePrefix: `test-${logFilePrefix}`,
  })
}

async function withManagedProcess<T>(
  managedProcess: ManagedProcess,
  callback: (managedProcess: ManagedProcess) => Promise<T>,
): Promise<T> {
  try {
    return await callback(managedProcess)
  } finally {
    await managedProcess.stop()
  }
}

async function waitForLog(logPath: string, text: string): Promise<void> {
  await expect
    .poll(() => existsSync(logPath) && readFileSync(logPath, 'utf8').includes(text), {
      interval: 50,
      timeout: 5000,
    })
    .toBe(true)
}

// Reserves a port then immediately releases it so a spawned test child can bind it
// without racing the harness's own port-allocation bookkeeping.
async function releasedReservation() {
  const reservations = await allocateReservedPorts(1)
  const reservation = reservations[0]
  if (!reservation) {
    throw new Error('Failed to allocate a test port')
  }
  await reservation.release()
  return reservation
}

function writtenStderr(spy: { mock: { calls: unknown[][] } }): string {
  return spy.mock.calls.map(call => String(call[0])).join('')
}
