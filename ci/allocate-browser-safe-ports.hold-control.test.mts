import { execFile as execFileCallback } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { createServer } from 'node:net'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { promisify } from 'node:util'
import { afterEach, describe, expect, it } from 'vitest'
import {
  expectOutsideReservedSlice,
  isolatedHoldEnv,
} from './allocate-browser-safe-ports.hold-fixtures.test-helpers.mts'

const execFile = promisify(execFileCallback)
const scriptPath = resolve('ci/allocate-browser-safe-ports.py')

function parsePorts(stdout: string): number[] {
  return stdout
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map(port => Number.parseInt(port, 10))
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
    const workspace = await mkdtemp(join(tmpdir(), 'voucha-port-hold-ws-'))
    const run = (args: string[]) =>
      execFile('python3', [scriptPath, ...args], {
        cwd: workspace,
        env: isolatedHoldEnv(),
        encoding: 'utf8',
      })
    cleanups.push(async () => {
      await run(['--stop', '--hold-dir', firstHoldDir, '--workspace', workspace])
      await run(['--stop', '--hold-dir', secondHoldDir, '--workspace', workspace])
      await rm(firstHoldDir, { force: true, recursive: true })
      await rm(secondHoldDir, { force: true, recursive: true })
      await rm(workspace, { force: true, recursive: true })
    })
    await body({ run, firstHoldDir, secondHoldDir, workspace })
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

  it('does not stop a replacement holder that uses a different hold directory', async () => {
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
  })

  it('live-stops a two-port replacement holder after leftover reap', async () => {
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
  })

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
})
