import { spawn, type ChildProcess } from 'node:child_process'
import { once } from 'node:events'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { request } from 'node:https'
import { platform, tmpdir } from 'node:os'
import { join } from 'node:path'
import { setTimeout as delay } from 'node:timers/promises'
import tls from 'node:tls'
import { ensureAwsEmulatorBinary } from './aws-emulator-package.mts'
import {
  AWS_EMULATOR_IDLE_TIMEOUT_SECONDS,
  startAwsEmulatorInDocker,
  type StartedAwsEmulatorProcess,
} from './aws-emulator-docker.mts'

const READY_DEADLINE_MS = 60_000

export type AwsEmulatorConnection = {
  endpoint: string
  region: string
  caPem: string
  accessKeyId: string
  secretAccessKey: string
}

export type RunningAwsEmulator = AwsEmulatorConnection & { stop: () => Promise<void> }

/** Starts a private emulator on a free port with telemetry off and returns its connection. */
export async function startAwsEmulator(): Promise<RunningAwsEmulator> {
  const home = await mkdtemp(join(tmpdir(), 'voucha-aws-emulator-'))
  const running =
    platform() === 'linux' ? await startNative(home) : await startAwsEmulatorInDocker(home)
  try {
    const port = await running.port
    const stateDir = join(home, '.aws', 'emulator', String(running.statePort ?? port))
    const caPem = await readFile(join(stateDir, 'ca.pem'), 'utf8')
    const credentials = parseCredentials(
      await readFile(join(stateDir, 'emulator_credentials'), 'utf8'),
    )
    const endpoint = `https://127.0.0.1:${port}`
    await waitForHealth(endpoint, caPem)
    return {
      endpoint,
      region: 'us-west-2',
      caPem,
      ...credentials,
      stop: async () => {
        await running.stop()
        await rm(home, { recursive: true, force: true })
      },
    }
  } catch (err) {
    await running.stop()
    await rm(home, { recursive: true, force: true })
    throw err
  }
}

async function startNative(home: string): Promise<StartedAwsEmulatorProcess> {
  const binary = await ensureAwsEmulatorBinary()
  const child = spawn(
    binary,
    [
      '--port',
      '0',
      '--telemetry',
      'off',
      '--idle-timeout',
      String(AWS_EMULATOR_IDLE_TIMEOUT_SECONDS),
    ],
    {
      env: { PATH: process.env.PATH, HOME: home, EMULATOR_TELEMETRY: 'off' },
      stdio: ['ignore', 'pipe', 'pipe'],
    },
  )
  return { port: readAnnouncedPort(child), stop: () => stopChild(child) }
}

function readAnnouncedPort(child: ChildProcess): Promise<number> {
  return new Promise((resolvePort, reject) => {
    let output = ''
    const timer = setTimeout(() => {
      reject(new Error(`AWS Emulator did not announce its endpoint:\n${output}`))
    }, READY_DEADLINE_MS)
    const onData = (chunk: Buffer) => {
      output += chunk.toString()
      const match = /"endpoint_url":"https:\/\/127\.0\.0\.1:(\d+)"/.exec(output)
      if (!match) return
      clearTimeout(timer)
      child.stdout?.off('data', onData)
      child.stderr?.off('data', onData)
      // Keep draining so a full pipe never blocks the emulator.
      child.stdout?.resume()
      child.stderr?.resume()
      resolvePort(Number(match[1]))
    }
    child.stdout?.on('data', onData)
    child.stderr?.on('data', onData)
    child.once('exit', code => {
      clearTimeout(timer)
      reject(new Error(`AWS Emulator exited with ${code} before it was ready:\n${output}`))
    })
  })
}

async function stopChild(child: ChildProcess): Promise<void> {
  if (child.exitCode !== null || child.signalCode !== null) return
  const exited = once(child, 'exit')
  child.kill('SIGTERM')
  const timer = setTimeout(() => child.kill('SIGKILL'), 5_000)
  await exited
  clearTimeout(timer)
}

async function waitForHealth(endpoint: string, caPem: string): Promise<void> {
  const deadline = Date.now() + READY_DEADLINE_MS
  let lastError: unknown
  while (Date.now() < deadline) {
    try {
      const status = await new Promise<number | undefined>((resolveStatus, reject) => {
        const req = request(`${endpoint}/__admin/health`, { ca: caPem, timeout: 2_000 }, res => {
          res.resume()
          resolveStatus(res.statusCode)
        })
        req.once('timeout', () => req.destroy(new Error('health check timed out')))
        req.once('error', reject)
        req.end()
      })
      if (status === 200) return
      lastError = new Error(`health returned ${status}`)
    } catch (err) {
      lastError = err
    }
    await delay(100)
  }
  throw new Error(`AWS Emulator at ${endpoint} never became healthy`, { cause: lastError })
}

function parseCredentials(file: string): { accessKeyId: string; secretAccessKey: string } {
  const accessKeyId = /^\s*aws_access_key_id\s*=\s*(\S+)/m.exec(file)?.[1]
  const secretAccessKey = /^\s*aws_secret_access_key\s*=\s*(\S+)/m.exec(file)?.[1]
  if (!accessKeyId || !secretAccessKey) throw new Error('AWS Emulator wrote no credentials')
  return { accessKeyId, secretAccessKey }
}

/**
 * Adds the run's self-signed emulator certificate to Node's default trust store, which every TLS
 * client in this process (the SDK's handler, `fetch`) reads unless it passes its own `ca`.
 */
export function trustAwsEmulatorCertificate(caPem: string): void {
  const current = tls.getCACertificates('default')
  if (current.includes(caPem)) return
  tls.setDefaultCACertificates([...current, caPem])
}
