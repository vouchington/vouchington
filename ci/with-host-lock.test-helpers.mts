import { execFile, spawn, type ChildProcess } from 'node:child_process'
import { mkdtemp, rm, stat } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { promisify } from 'node:util'

export const execFileAsync = promisify(execFile)
export const hostLockScript = join(process.cwd(), 'ci/with-host-lock.sh')
export const buildLockScript = join(process.cwd(), 'ci/with-build-lock.sh')
const testHomes: string[] = []

export async function makeHome(): Promise<string> {
  const home = await mkdtemp(join(tmpdir(), 'voucha-host-lock-'))
  testHomes.push(home)
  return home
}

function hostLockRoot(home: string): string {
  return join(home, '.cache/voucha')
}

export function hostLockEnv(home: string, overrides: NodeJS.ProcessEnv = {}): NodeJS.ProcessEnv {
  return {
    ...process.env,
    HOME: home,
    VOUCHA_HOST_LOCK_ROOT: hostLockRoot(home),
    ...overrides,
  }
}

export function hostLockArgs(
  name: string,
  timeoutSeconds: number,
  command: string[],
  extraArgs: string[] = [],
): string[] {
  return [
    hostLockScript,
    '--name',
    name,
    '--timeout-seconds',
    String(timeoutSeconds),
    ...extraArgs,
    '--',
    ...command,
  ]
}

export function spawnHostLock(
  home: string,
  name: string,
  timeoutSeconds: number,
  command: string[],
  env: NodeJS.ProcessEnv = {},
  extraArgs: string[] = [],
): ChildProcess {
  return spawn('bash', hostLockArgs(name, timeoutSeconds, command, extraArgs), {
    env: hostLockEnv(home, env),
    stdio: ['ignore', 'pipe', 'pipe'],
  })
}

export function completion(child: ChildProcess): Promise<{ code: number | null; stderr: string }> {
  return new Promise((resolve, reject) => {
    let stderr = ''
    child.stderr?.on('data', chunk => {
      stderr += String(chunk)
    })
    child.once('error', reject)
    child.once('close', code => resolve({ code, stderr }))
  })
}

export async function waitForPath(path: string): Promise<void> {
  const deadline = Date.now() + 5e3
  while (Date.now() < deadline) {
    try {
      await stat(path)
      return
    } catch {
      await new Promise(resolve => setTimeout(resolve, 20))
    }
  }
  throw new Error(`Timed out waiting for ${path}`)
}

export async function cleanupTestHomes(): Promise<void> {
  await Promise.all(testHomes.splice(0).map(home => rm(home, { force: true, recursive: true })))
}
