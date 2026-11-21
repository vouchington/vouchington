import { fetch } from 'undici'
import { createAwsEmulatorLoopbackDispatcher } from './aws-emulator-dispatchers.mts'
import { spawn, type ChildProcess } from 'node:child_process'
import { once } from 'node:events'
import net from 'node:net'
import { listenOnRunnerUnreservedEphemeralPort } from 'vouchington-tooling/runner-port-policy'
import { ensureFakeGcsServerBinary } from './gcs-emulator-package.mts'

const READY_DEADLINE_MS = 30_000
const STOP_DEADLINE_MS = 5_000

export type RunningGcsEmulator = {
  endpoint: string
  stop: () => Promise<void>
}

/** Starts a private in-memory fake-gcs-server on an unreserved runner port. */
export async function startGcsEmulator(): Promise<RunningGcsEmulator> {
  const port = await choosePort()
  const binary = await ensureFakeGcsServerBinary()
  const child = spawn(
    binary,
    ['-scheme', 'http', '-backend', 'memory', '-host', '127.0.0.1', '-port', String(port)],
    { env: { PATH: process.env.PATH }, stdio: ['ignore', 'pipe', 'pipe'] },
  )

  try {
    await waitUntilReady(child, port)
    return {
      endpoint: `http://127.0.0.1:${port}`,
      stop: () => stopChild(child),
    }
  } catch (err) {
    await stopChild(child)
    throw err
  }
}

async function choosePort(): Promise<number> {
  const probe = net.createServer()
  const port = await listenOnRunnerUnreservedEphemeralPort(probe, '127.0.0.1')
  await new Promise<void>((resolve, reject) => {
    probe.close(error => (error ? reject(error) : resolve()))
  })
  return port
}

async function waitUntilReady(child: ChildProcess, port: number): Promise<void> {
  const signal = AbortSignal.timeout(READY_DEADLINE_MS)
  let output = ''

  await new Promise<void>((resolve, reject) => {
    function fail(error: Error) {
      cleanup()
      reject(error)
    }
    function cleanup() {
      child.stderr?.off('data', onData)
      child.stdout?.off('data', onData)
      child.off('error', fail)
      child.off('close', onClose)
      signal.removeEventListener('abort', onTimeout)
    }
    function onData(chunk: Buffer | string) {
      output += chunk.toString()
      if (output.length > 8_192) output = output.slice(-8_192)
      if (output.includes(`server started at http://127.0.0.1:${port}`)) {
        cleanup()
        child.stderr?.resume()
        child.stdout?.resume()
        resolve()
      }
    }
    function onClose(code: number | null, exitSignal: NodeJS.Signals | null) {
      fail(new Error(`fake-gcs-server exited before readiness (${code ?? exitSignal}): ${output}`))
    }
    function onTimeout() {
      fail(
        new Error(`fake-gcs-server did not become ready within ${READY_DEADLINE_MS}ms: ${output}`),
      )
    }

    child.stderr?.on('data', onData)
    child.stdout?.on('data', onData)
    child.once('error', fail)
    child.once('close', onClose)
    signal.addEventListener('abort', onTimeout, { once: true })
  })
}

async function stopChild(child: ChildProcess): Promise<void> {
  if (child.pid === undefined || child.exitCode !== null || child.signalCode !== null) return

  const closed = once(child, 'close')
  child.kill('SIGTERM')
  const deadline = AbortSignal.timeout(STOP_DEADLINE_MS)
  const stopped = await Promise.race([
    closed.then(() => 'closed' as const),
    once(deadline, 'abort').then(() => 'deadline' as const),
  ])
  if (stopped === 'closed') return

  child.kill('SIGKILL')
  await Promise.race([
    closed,
    once(AbortSignal.timeout(STOP_DEADLINE_MS), 'abort').then(() => {
      throw new Error(`fake-gcs-server did not close after SIGKILL within ${STOP_DEADLINE_MS}ms`)
    }),
  ])
}

/** Provision a test-owned bucket through the emulator's actual HTTP API. */
export async function createGcsTestBucket(endpoint: string, bucket: string): Promise<void> {
  const dispatcher = createAwsEmulatorLoopbackDispatcher()
  try {
    const response = await fetch(`${endpoint}/storage/v1/b?project=synthetic-project`, {
      dispatcher,
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name: bucket }),
    })
    await response.body?.cancel()
    if (!response.ok) throw new Error(`GCS test bucket creation failed (${response.status})`)
  } finally {
    await dispatcher.close()
  }
}
