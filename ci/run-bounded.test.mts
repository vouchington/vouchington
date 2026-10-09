import { spawn, spawnSync, type ChildProcess } from 'node:child_process'
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'

const script = join(process.cwd(), 'ci/run-bounded.py')

function runBounded(seconds: string, command: string[], env?: NodeJS.ProcessEnv) {
  const started = Date.now()
  const result = spawnSync('python3', [script, seconds, ...command], {
    encoding: 'utf8',
    env: { ...process.env, ...env },
    stdio: ['pipe', 'ignore', 'ignore'],
    timeout: 7000,
  })
  return { result, elapsedMs: Date.now() - started }
}

function killProcessGroup(pidFile: string) {
  if (!existsSync(pidFile)) return
  const pid = Number(readFileSync(pidFile, 'utf8').trim())
  if (!Number.isInteger(pid)) return
  const result = spawnSync('python3', [
    '-c',
    [
      'import os, signal, sys',
      'pgid = int(sys.argv[1])',
      'if pgid == os.getpgrp(): raise SystemExit("refusing to kill the test process group")',
      'try: os.killpg(pgid, signal.SIGKILL)',
      'except ProcessLookupError: pass',
    ].join('\n'),
    String(pid),
  ])
  if (result.status !== 0) throw new Error('Failed to clean up the fixture process group')
}

describe('run-bounded', () => {
  it('returns the command status when the command finishes inside the deadline', () => {
    const { result, elapsedMs } = runBounded('5', ['python3', '-c', 'raise SystemExit(3)'])

    expect(result.status).toBe(3)
    expect(elapsedMs).toBeLessThan(5000)
  })

  it('kills the command and its children when the deadline expires', () => {
    const dir = mkdtempSync(join(tmpdir(), 'run-bounded-'))
    const pidFile = join(dir, 'child-pid')
    const groupPidFile = join(dir, 'group-pid')
    try {
      const { result, elapsedMs } = runBounded(
        '1',
        ['bash', '-c', 'echo $$ > "$GROUP_PID_FILE"; sleep 30 & echo $! > "$PID_FILE"; wait'],
        { GROUP_PID_FILE: groupPidFile, PID_FILE: pidFile },
      )

      expect(result.status).toBe(124)
      expect(elapsedMs).toBeLessThan(8000)
      const pid = Number(readFileSync(pidFile, 'utf8').trim())
      expect(Number.isInteger(pid)).toBe(true)
      expect(spawnSync('kill', ['-0', String(pid)]).status).not.toBe(0)
    } finally {
      killProcessGroup(groupPidFile)
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('kills a TERM-resistant child even when its parent exits on TERM', () => {
    const dir = mkdtempSync(join(tmpdir(), 'run-bounded-'))
    const pidFile = join(dir, 'child-pid')
    const groupPidFile = join(dir, 'group-pid')
    const child = [
      'import os, signal',
      'signal.signal(signal.SIGTERM, signal.SIG_IGN)',
      'open(os.environ["PID_FILE"], "w").write(str(os.getpid()))',
      'signal.pause()',
    ].join('; ')
    const parent = [
      'import os, signal, subprocess, sys',
      'open(os.environ["GROUP_PID_FILE"], "w").write(str(os.getpid()))',
      `subprocess.Popen([sys.executable, "-c", ${JSON.stringify(child)}], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)`,
      'signal.pause()',
    ].join('; ')
    try {
      const { result, elapsedMs } = runBounded('1', ['python3', '-c', parent], {
        GROUP_PID_FILE: groupPidFile,
        PID_FILE: pidFile,
      })
      const pid = Number(readFileSync(pidFile, 'utf8').trim())
      expect(result.status).toBe(124)
      expect(elapsedMs).toBeLessThan(8000)
      const state = spawnSync('ps', ['-p', String(pid), '-o', 'stat='], { encoding: 'utf8' })
      expect(state.stdout.trim() === '' || state.stdout.trim().startsWith('Z')).toBe(true)
    } finally {
      killProcessGroup(groupPidFile)
      rmSync(dir, { recursive: true, force: true })
    }
  })
})

describe('run-bounded output pipes', () => {
  const dirs: string[] = []
  const wrappers: ChildProcess[] = []
  afterEach(() => {
    for (const wrapper of wrappers.splice(0)) wrapper.kill('SIGKILL')
    for (const dir of dirs.splice(0)) {
      const pidFile = join(dir, 'grandchild-pid')
      if (existsSync(pidFile)) spawnSync('kill', ['-9', readFileSync(pidFile, 'utf8').trim()])
      rmSync(dir, { recursive: true, force: true })
    }
  })

  // The command starts a grandchild in its own session that keeps the inherited stdout pipe
  // open, so it survives the process-group kill. `close` is the EOF signal a runner waits on.
  async function runWithDetachedGrandchild(seconds: string, mode: 'exit' | 'hang') {
    const dir = mkdtempSync(join(tmpdir(), 'run-bounded-'))
    dirs.push(dir)
    const command = [
      'import os, signal, subprocess, sys',
      'gc = subprocess.Popen([sys.executable, "-c", "import signal; signal.pause()"], start_new_session=True, stderr=subprocess.DEVNULL)',
      'open(os.environ["GRANDCHILD_PID_FILE"], "w").write(str(gc.pid))',
      'sys.stdout.write("out\\n"); sys.stdout.flush()',
      'sys.stderr.write("err\\n"); sys.stderr.flush()',
      'if os.environ["MODE"] == "hang": signal.pause()',
    ].join('\n')
    const wrapper = spawn('python3', [script, seconds, 'python3', '-c', command], {
      env: { ...process.env, GRANDCHILD_PID_FILE: join(dir, 'grandchild-pid'), MODE: mode },
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    wrappers.push(wrapper)
    let stdout = ''
    let stderr = ''
    wrapper.stdout.on('data', chunk => (stdout += chunk))
    wrapper.stderr.on('data', chunk => (stderr += chunk))
    const code = await new Promise<number | null>(resolve => wrapper.once('close', resolve))
    return { code, stdout, stderr }
  }

  it('reaches EOF after the command exits even if a detached descendant holds stdout', async () => {
    const { code, stdout, stderr } = await runWithDetachedGrandchild('30', 'exit')

    expect(code).toBe(0)
    expect(stdout).toBe('out\n')
    expect(stderr).toBe('err\n')
  })

  it('reaches EOF with status 124 after a deadline even if a detached descendant holds stdout', async () => {
    const { code, stdout, stderr } = await runWithDetachedGrandchild('1', 'hang')

    expect(code).toBe(124)
    expect(stdout).toBe('out\n')
    expect(stderr).toBe('err\n')
  })
})
