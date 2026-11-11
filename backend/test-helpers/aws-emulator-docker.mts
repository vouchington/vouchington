import { execFile } from 'node:child_process'
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { setTimeout as delay } from 'node:timers/promises'
import { promisify } from 'node:util'
import { ensureAwsEmulatorBinary } from './aws-emulator-package.mts'

const execFileAsync = promisify(execFile)

// macOS cannot run the Linux binary, so it runs inside the mirrored Debian Node image.
const LINUX_RUNTIME_IMAGE =
  'ghcr.io/vouchington/dependency-node:26-trixie-slim@sha256:36793bcbb160a6a16cede1e62b93f84e26b78a972a8a4c0b879c1c12f22761ec'

const EMULATOR_PORT_IN_CONTAINER = 9297
const DOCKER_START_DEADLINE_MS = 180_000
const READY_DEADLINE_MS = 60_000
// A crashed test runner must not leave an emulator holding memory forever.
export const AWS_EMULATOR_IDLE_TIMEOUT_SECONDS = 3_600

export type StartedAwsEmulatorProcess = {
  port: Promise<number>
  // The in-container port names the state directory when Docker remaps the host port.
  statePort?: number
  stop: () => Promise<void>
}

/** Runs the Linux binary in a container, for hosts (macOS) that cannot execute it. */
export async function startAwsEmulatorInDocker(home: string): Promise<StartedAwsEmulatorProcess> {
  const binary = await ensureAwsEmulatorBinary()
  const name = `voucha-aws-emulator-${process.pid}-${Date.now()}`
  await execFileAsync(
    'docker',
    [
      'run',
      '--rm',
      '--detach',
      '--name',
      name,
      '--memory=2g',
      '--memory-swap=2g',
      '--user',
      `${process.getuid?.() ?? 1000}:${process.getgid?.() ?? 1000}`,
      '--publish',
      `127.0.0.1::${EMULATOR_PORT_IN_CONTAINER}`,
      '--volume',
      `${binary}:/usr/local/bin/aws-emulator:ro`,
      '--volume',
      `${home}:${home}`,
      '--env',
      `HOME=${home}`,
      '--env',
      'EMULATOR_TELEMETRY=off',
      '--entrypoint',
      '/usr/local/bin/aws-emulator',
      LINUX_RUNTIME_IMAGE,
      '--bind',
      '0.0.0.0',
      '--port',
      String(EMULATOR_PORT_IN_CONTAINER),
      '--telemetry',
      'off',
      '--idle-timeout',
      String(AWS_EMULATOR_IDLE_TIMEOUT_SECONDS),
    ],
    { timeout: DOCKER_START_DEADLINE_MS },
  )
  const stop = async () => {
    await execFileAsync('docker', ['rm', '--force', name]).catch(() => undefined)
  }
  const port = (async () => {
    const { stdout } = await execFileAsync('docker', [
      'port',
      name,
      `${EMULATOR_PORT_IN_CONTAINER}/tcp`,
    ])
    const match = /:(\d+)\s*$/m.exec(stdout)
    if (!match) throw new Error(`Could not read the published AWS Emulator port: ${stdout}`)
    // The state files appear once the server listens; health polling below waits for both.
    await waitForFile(join(home, '.aws', 'emulator', String(EMULATOR_PORT_IN_CONTAINER), 'ca.pem'))
    return Number(match[1])
  })()
  return { port, statePort: EMULATOR_PORT_IN_CONTAINER, stop }
}

async function waitForFile(path: string): Promise<void> {
  const deadline = Date.now() + READY_DEADLINE_MS
  while (!existsSync(path)) {
    if (Date.now() > deadline) throw new Error(`AWS Emulator did not write ${path}`)
    await delay(100)
  }
}
