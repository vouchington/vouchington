import { randomUUID } from 'node:crypto'
import { createServer } from 'node:net'
import { readFileSync, rmSync } from 'node:fs'
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
import {
  listenOnFetchSafeEphemeralPort,
  isFetchSafePort,
} from '../../integration-tests/web/helpers/ports.mts'

describe('web integration managed processes', () => {
  afterEach(() => {
    rmSync('integration-tests/web/artifacts/service-logs', { force: true, recursive: true })
  })

  it('persists child stdout and stderr to a service log', async () => {
    await withManagedProcess(
      startTestProcess('log-capture', [
        String.raw`process.stdout.write('stdout line\n')`,
        String.raw`process.stderr.write('stderr line\n')`,
      ]),
      async managedProcess => {
        await expect(managedProcess.exited).resolves.toMatchObject({ code: 0, signal: null })

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
    const stderrSpy = vi.spyOn(process.stderr, 'write').mockReturnValue(true)
    try {
      await withManagedHttpProcess(
        'ready-then-exit',
        `(request, response) => {
          if (request.url === '/exit') {
            response.end('closing', () => server.close(() => process.exit(0)))
            return
          }
          response.end('ok')
        }`,
        async (managedProcess, origin) => {
          await expect(
            waitForService('backend', `${origin}/infra/ping`, [200], managedProcess),
          ).resolves.toBeUndefined()
          await expect(fetch(`${origin}/exit`)).resolves.toMatchObject({ status: 200 })
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
    const stderrSpy = vi.spyOn(process.stderr, 'write').mockReturnValue(true)
    try {
      await withManagedHttpProcess(
        'ready-then-stop',
        "(_request, response) => response.end('ok')",
        async (managedProcess, origin) => {
          await expect(
            waitForService('backend', `${origin}/infra/ping`, [200], managedProcess),
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

// The child binds its own port before publishing it; no reservation is released
// between parent allocation and child startup, so the kernel range is irrelevant.
async function withManagedHttpProcess(
  logFilePrefix: string,
  handler: string,
  callback: (managedProcess: ManagedProcess, origin: string) => Promise<void>,
): Promise<void> {
  const nonce = randomUUID()
  let resolvePort!: (port: number) => void
  let rejectPort!: (err: unknown) => void
  const portReceipt = new Promise<number>((resolve, reject) => {
    resolvePort = resolve
    rejectPort = reject
  })
  void portReceipt.catch(() => undefined)
  const control = createServer(socket => {
    let message = ''
    socket.setEncoding('utf8')
    socket.on('data', (chunk: string) => {
      message += chunk
      if (message.length > 1024) rejectPort(new Error('Oversized fixture port receipt'))
    })
    socket.once('error', rejectPort)
    socket.once('end', () => {
      try {
        const receipt = JSON.parse(message) as { nonce: string; port: number }
        if (
          receipt.nonce !== nonce ||
          !Number.isInteger(receipt.port) ||
          receipt.port < 1 ||
          receipt.port > 65535 ||
          !isFetchSafePort(receipt.port)
        ) {
          throw new Error('Invalid fixture port receipt')
        }
        resolvePort(receipt.port)
      } catch (err) {
        rejectPort(err)
      }
    })
  })
  const errors: unknown[] = []
  let managed: ManagedProcess | undefined
  try {
    const controlPort = await listenOnFetchSafeEphemeralPort(control)
    const portHelper = new URL('../../integration-tests/web/helpers/ports.mts', import.meta.url)
      .href
    managed = startTestProcess(logFilePrefix, [
      "const http = require('node:http')",
      "const net = require('node:net')",
      `(async () => {
        const { listenOnFetchSafeEphemeralPort } = await import(${JSON.stringify(portHelper)})
        const server = http.createServer(${handler})
        const port = await listenOnFetchSafeEphemeralPort(server)
        const receipt = net.createConnection({ host: '127.0.0.1', port: ${controlPort} })
        receipt.on('error', err => {
          console.error(err)
          server.close(() => { process.exitCode = 1 })
        })
        receipt.end(JSON.stringify({ nonce: ${JSON.stringify(nonce)}, port }))
      })().catch(err => { console.error(err); process.exitCode = 1 })`,
    ])
    const port = await Promise.race([
      portReceipt,
      managed.exited.then(exit => {
        throw new Error(
          `HTTP fixture exited before its native port receipt: ${formatExitStatus(exit)}`,
        )
      }),
    ])
    await callback(managed, `http://127.0.0.1:${port}`)
  } catch (err) {
    errors.push(err)
  } finally {
    if (managed) {
      try {
        await managed.stop()
      } catch (err) {
        errors.push(err)
      }
    }
    if (control.listening) {
      try {
        await new Promise<void>((resolve, reject) => {
          control.close(err => (err ? reject(err) : resolve()))
        })
      } catch (err) {
        errors.push(err)
      }
    }
  }
  if (errors.length)
    throw new AggregateError(errors, 'HTTP fixture lifecycle failed', { cause: errors[0] })
}

function writtenStderr(spy: { mock: { calls: unknown[][] } }): string {
  return spy.mock.calls.map(call => String(call[0])).join('')
}
