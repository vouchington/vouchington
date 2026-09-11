import { execFile as execFileCallback } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { createServer } from 'node:net'
import { mkdir, mkdtemp, rm } from 'node:fs/promises'
import { networkInterfaces, tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { promisify } from 'node:util'
import { afterEach, describe, expect, it } from 'vitest'
import {
  expectOutsideReservedSlice,
  isolatedHoldEnv,
  synthesizedPortRangeEnd,
  synthesizedPortRangeStart,
  synthesizedRunnerSlot,
  synthesizedSlotHostLockTestTimeoutMs,
  withSynthesizedSlotHostLock,
} from './allocate-browser-safe-ports.slot-fixtures.test-helpers.mts'

const execFile = promisify(execFileCallback)
const scriptPath = resolve('ci/allocate-browser-safe-ports.py')

function parsePorts(stdout: string): number[] {
  return stdout
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map(port => Number.parseInt(port, 10))
}

function firstNonLoopbackIPv4(): string | undefined {
  return Object.values(networkInterfaces())
    .flat()
    .find(entry => entry?.family === 'IPv4' && !entry.internal)?.address
}

function listenAvailable(port: number, host?: string): Promise<boolean> {
  return new Promise(resolveListen => {
    const listener = createServer()
    listener.once('error', () => resolveListen(false))
    listener.listen({ port, host }, () => {
      listener.close(() => resolveListen(true))
    })
  })
}

describe('allocate-browser-safe-ports.py hold-dir control', () => {
  const cleanups: Array<() => Promise<void>> = []

  afterEach(async () => {
    const pending = cleanups.splice(0)
    for (const cleanup of pending) await cleanup()
  })

  async function withReplacementHolders(
    body: (ctx: {
      run: (args: string[]) => Promise<{ stdout: string; stderr: string }>
      firstHoldDir: string
      secondHoldDir: string
      workspace: string
    }) => Promise<void>,
  ): Promise<void> {
    const firstHoldDir = await mkdtemp(join(tmpdir(), 'voucha-port-hold-a-'))
    const secondHoldDir = await mkdtemp(join(tmpdir(), 'voucha-port-hold-b-'))
    const root = await mkdtemp(join(tmpdir(), 'voucha-runner-slot-'))
    const workspace = join(
      root,
      'actions-runner',
      String(synthesizedRunnerSlot),
      '_work',
      'filaments',
      'filaments',
    )
    await mkdir(workspace, { recursive: true })
    const holdEnv = {
      ...process.env,
      GITHUB_ACTIONS: 'true',
      GITHUB_WORKSPACE: workspace,
      VOUCHA_PORT_HOLD_WORKSPACE: workspace,
    }
    const run = (args: string[]) =>
      execFile('python3', [scriptPath, ...args], {
        cwd: workspace,
        env: holdEnv,
        encoding: 'utf8',
      })
    cleanups.push(async () => {
      await run(['--stop', '--hold-dir', firstHoldDir, '--workspace', workspace])
      await run(['--stop', '--hold-dir', secondHoldDir, '--workspace', workspace])
      await rm(firstHoldDir, { force: true, recursive: true })
      await rm(secondHoldDir, { force: true, recursive: true })
      await rm(root, { force: true, recursive: true })
    })
    await withSynthesizedSlotHostLock(async () => {
      await body({ run, firstHoldDir, secondHoldDir, workspace })
    })
  }

  it('releases and stops when hold-dir is the current directory', async () => {
    const cwd = await mkdtemp(join(tmpdir(), 'voucha-port-hold-dot-'))
    const workspace = await mkdtemp(join(tmpdir(), 'voucha-port-hold-ws-'))
    const isolated = { cwd, env: isolatedHoldEnv() }
    cleanups.push(async () => {
      await execFile(
        'python3',
        [scriptPath, '--stop', '--hold-dir', '.', '--workspace', workspace],
        isolated,
      )
      await rm(cwd, { force: true, recursive: true })
      await rm(workspace, { force: true, recursive: true })
    })
    const { stdout } = await execFile(
      'python3',
      [scriptPath, '1', '--hold', '--hold-dir', '.', '--workspace', workspace],
      isolated,
    )
    const [port] = parsePorts(stdout)
    expect(port < 2200 || port > 2999).toBe(true)
    await execFile(
      'python3',
      [scriptPath, '--check', '--hold-dir', '.', '--workspace', workspace],
      isolated,
    )
    await expect(listenAvailable(port, '127.0.0.1')).resolves.toBe(false)
    await execFile(
      'python3',
      [scriptPath, '--release', String(port), '--hold-dir', '.', '--workspace', workspace],
      isolated,
    )
    await expect(listenAvailable(port, '127.0.0.1')).resolves.toBe(true)
    await execFile(
      'python3',
      [scriptPath, '--stop', '--hold-dir', '.', '--workspace', workspace],
      isolated,
    )
    await expect(
      execFile(
        'python3',
        [scriptPath, '--check', '--hold-dir', '.', '--workspace', workspace],
        isolated,
      ),
    ).rejects.toMatchObject({
      stderr: expect.stringContaining('port holder'),
    })
  })

  it(
    'does not stop a replacement holder that uses a different hold directory',
    async () => {
      await withReplacementHolders(async ({ run, firstHoldDir, secondHoldDir, workspace }) => {
        await run(['1', '--hold', '--hold-dir', firstHoldDir, '--workspace', workspace])
        const { stdout } = await run([
          '1',
          '--hold',
          '--hold-dir',
          secondHoldDir,
          '--workspace',
          workspace,
        ])
        const [replacement] = parsePorts(stdout)
        const firstPid = Number.parseInt(readFileSync(join(firstHoldDir, 'pid'), 'utf8'), 10)
        const secondPid = Number.parseInt(readFileSync(join(secondHoldDir, 'pid'), 'utf8'), 10)
        expect(firstPid).not.toBe(secondPid)
        await run(['--stop', '--hold-dir', firstHoldDir, '--workspace', workspace])
        await run(['--check', '--hold-dir', secondHoldDir, '--workspace', workspace])
        await expect(listenAvailable(replacement, '127.0.0.1')).resolves.toBe(false)
      })
    },
    synthesizedSlotHostLockTestTimeoutMs,
  )

  it(
    'live-stops a two-port replacement holder after leftover reap',
    async () => {
      await withReplacementHolders(async ({ run, firstHoldDir, secondHoldDir, workspace }) => {
        await run(['2', '--hold', '--hold-dir', firstHoldDir, '--workspace', workspace])
        const { stdout } = await run([
          '2',
          '--hold',
          '--hold-dir',
          secondHoldDir,
          '--workspace',
          workspace,
        ])
        const ports = parsePorts(stdout)
        expect(ports).toHaveLength(2)
        await run(['--stop', '--hold-dir', firstHoldDir, '--workspace', workspace])
        await run(['--check', '--hold-dir', secondHoldDir, '--workspace', workspace])
        for (const port of ports) {
          await expect(listenAvailable(port, '127.0.0.1')).resolves.toBe(false)
        }
        await run(['--stop', '--hold-dir', secondHoldDir, '--workspace', workspace])
        for (const port of ports) {
          await expect(listenAvailable(port, '127.0.0.1')).resolves.toBe(true)
        }
      })
    },
    synthesizedSlotHostLockTestTimeoutMs,
  )

  it('treats --stop as success after the holder is already gone', async () => {
    const holdDir = await mkdtemp(join(tmpdir(), 'voucha-port-hold-gone-'))
    const workspace = await mkdtemp(join(tmpdir(), 'voucha-port-hold-ws-'))
    const isolated = { env: isolatedHoldEnv() }
    cleanups.push(async () => {
      await execFile(
        'python3',
        [scriptPath, '--stop', '--hold-dir', holdDir, '--workspace', workspace],
        isolated,
      )
      await rm(holdDir, { force: true, recursive: true })
      await rm(workspace, { force: true, recursive: true })
    })
    const { stdout } = await execFile(
      'python3',
      [scriptPath, '1', '--hold', '--hold-dir', holdDir, '--workspace', workspace],
      isolated,
    )
    expectOutsideReservedSlice(parsePorts(stdout))
    const pid = Number.parseInt(readFileSync(join(holdDir, 'pid'), 'utf8'), 10)
    await execFile('kill', ['-TERM', String(pid)])
    await execFile(
      'python3',
      [scriptPath, '--stop', '--hold-dir', holdDir, '--workspace', workspace],
      isolated,
    )
  })

  // Darwin cannot reserve 0.0.0.0 after 127.0.0.1 with SO_REUSEADDR=0.
  it.skipIf(process.platform !== 'linux' || !firstNonLoopbackIPv4())(
    'rejects a runner-slice candidate when the IPv4 wildcard is taken',
    async () => {
      const occupiedHost = firstNonLoopbackIPv4() as string
      const root = await mkdtemp(join(tmpdir(), 'voucha-runner-slot-'))
      // Spoofs the maximum runner slot, not a real one (see synthesizedRunnerSlot) — occupying
      // its real port range would steal a live runner's ports on a shared host.
      const workspace = join(
        root,
        'actions-runner',
        String(synthesizedRunnerSlot),
        '_work',
        'filaments',
        'filaments',
      )
      const holdDir = await mkdtemp(join(tmpdir(), 'voucha-port-hold-'))
      await mkdir(workspace, { recursive: true })
      const occupied: Array<() => Promise<void>> = []
      cleanups.push(async () => {
        await execFile('python3', [
          scriptPath,
          '--stop',
          '--hold-dir',
          holdDir,
          '--workspace',
          workspace,
        ])
        for (const close of occupied) await close()
        await rm(holdDir, { force: true, recursive: true })
        await rm(root, { force: true, recursive: true })
      })
      // The synthetic slot is shared across every concurrent copy of this test on one host, so
      // hold the host-wide lock around the actual host-global bind, not just the assertion.
      await withSynthesizedSlotHostLock(async () => {
        for (let port = synthesizedPortRangeStart; port <= synthesizedPortRangeEnd; port++) {
          const listener = createServer()
          const acquired = await new Promise<boolean>((resolveListen, reject) => {
            listener.once('error', error =>
              (error as NodeJS.ErrnoException).code === 'EADDRINUSE'
                ? resolveListen(false)
                : reject(error),
            )
            listener.listen({ port, host: occupiedHost }, () => resolveListen(true))
          })
          if (!acquired) continue
          occupied.push(
            () =>
              new Promise(resolveClose => {
                listener.close(() => {
                  resolveClose()
                })
              }),
          )
        }
        await expect(
          execFile('python3', [scriptPath, '1', '--hold', '--hold-dir', holdDir], {
            cwd: workspace,
            env: {
              ...process.env,
              GITHUB_ACTIONS: 'true',
              GITHUB_WORKSPACE: workspace,
              VOUCHA_PORT_HOLD_WORKSPACE: workspace,
            },
          }),
        ).rejects.toMatchObject({
          stderr: expect.stringContaining('failed to allocate 1 ports'),
        })
      })
    },
    synthesizedSlotHostLockTestTimeoutMs,
  )
})
