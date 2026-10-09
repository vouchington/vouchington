import { execFile, spawnSync } from 'node:child_process'
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const script = join(process.cwd(), 'ci/run-bounded.py')

function runBounded(seconds: string, command: string[], env?: NodeJS.ProcessEnv) {
  const started = Date.now()
  const result = spawnSync('python3', [script, seconds, ...command], {
    encoding: 'utf8',
    env: { ...process.env, ...env },
    stdio: ['pipe', 'ignore', 'ignore'],
    timeout: 4500,
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

function cleanOwnedFixture(manifests: string[]) {
  const result = spawnSync(
    'python3',
    [
      '-c',
      [
        'import json, os, pathlib, signal, sys',
        'rows, errors = [], []',
        'for name in sys.argv[1:]:',
        '    path = pathlib.Path(name)',
        '    try:',
        '        if path.exists(): rows.extend(json.loads(path.read_text()))',
        '    except (OSError, ValueError) as error: errors.append(str(error))',
        'for pid, start in rows:',
        '    try: fd = os.pidfd_open(pid)',
        '    except ProcessLookupError: continue',
        '    except OSError as error: errors.append(str(error)); continue',
        '    try:',
        '        fields = pathlib.Path(f"/proc/{pid}/stat").read_text().rsplit(")", 1)[1].split()',
        '        if fields[19] == start: signal.pidfd_send_signal(fd, signal.SIGKILL)',
        '    except FileNotFoundError: pass',
        '    except OSError as error: errors.append(str(error))',
        '    finally: os.close(fd)',
        'if errors: raise RuntimeError("; ".join(errors))',
      ].join('\n'),
      ...manifests,
    ],
    { timeout: 750 },
  )
  if (result.status !== 0) throw new Error('Owned detached fixture cleanup failed')
}

function fixtureIdentitiesPresent(manifest: string) {
  let identities: [number, string][]
  try {
    identities = JSON.parse(readFileSync(manifest, 'utf8'))
  } catch (err) {
    if (!(err instanceof Error) || !('code' in err) || err.code !== 'ENOENT') throw err
    return []
  }
  return identities.filter(([pid, start]) => {
    try {
      const stat = readFileSync(`/proc/${pid}/stat`, 'utf8')
      return stat.split(')').at(-1)?.trim().split(/\s+/)[19] === start
    } catch (err) {
      if (!(err instanceof Error) || !('code' in err) || err.code !== 'ENOENT') throw err
      return false
    }
  })
}

async function runDetachedFixture(parentExit: string) {
  const dir = mkdtempSync(join(tmpdir(), 'run-bounded-detached-'))
  const manifest = join(dir, 'owned-identities.json')
  const commandManifest = join(dir, 'command-identity.json')
  const completionManifest = join(dir, 'supervision-completed.json')
  const parent = [
    'import json, os, pathlib, signal, sys',
    'def identity(pid):',
    '    return [pid, pathlib.Path(f"/proc/{pid}/stat").read_text().rsplit(")", 1)[1].split()[19]]',
    'def record(path, rows):',
    '    temporary = path.with_name(path.name + str(os.getpid()))',
    '    temporary.write_text(json.dumps(rows))',
    '    temporary.replace(path)',
    'record(pathlib.Path(os.environ["MANIFEST"]), [identity(os.getpid())])',
    'read_fd, write_fd = os.pipe()',
    'if os.fork() == 0:',
    '    os.setsid()',
    '    if os.fork() != 0: os._exit(0)',
    '    os.setsid()',
    '    os.close(read_fd)',
    '    path = pathlib.Path(os.environ["MANIFEST"])',
    '    record(path, json.loads(path.read_text()) + [identity(os.getpid())])',
    '    signal.signal(signal.SIGTERM, signal.SIG_IGN)',
    '    os.write(write_fd, str(os.getpid()).encode())',
    '    os.close(write_fd)',
    '    signal.pause()',
    '    os._exit(0)',
    'os.close(write_fd)',
    'child = int(os.read(read_fd, 64))',
    'os.close(read_fd)',
    'record(pathlib.Path(os.environ["MANIFEST"]), [identity(os.getpid()), identity(child)])',
    parentExit === '3' ? 'raise SystemExit(3)' : 'signal.pause()',
  ].join('\n')
  // Blocking SIGCHLD reaping exposes leaks; the supervisor never repairs a passing run.
  const supervisor = [
    'import ctypes, json, os, pathlib, signal, subprocess, sys',
    'if ctypes.CDLL(None).prctl(36, 1, 0, 0, 0): raise RuntimeError("fixture subreaper failed")',
    'proc = None',
    'interrupted = False',
    'cleanup_errors = []',
    'def terminate(_number, _frame):',
    '    global interrupted',
    '    interrupted = True',
    '    rows = []',
    '    for name in ["MANIFEST", "COMMAND_MANIFEST"]:',
    '        try: rows.extend(json.loads(pathlib.Path(os.environ[name]).read_text()))',
    '        except FileNotFoundError: pass',
    '        except Exception as error: cleanup_errors.append(str(error))',
    '    for pid, start in rows:',
    '        try:',
    '            fd = os.pidfd_open(pid)',
    '            try:',
    '                fields = pathlib.Path(f"/proc/{pid}/stat").read_text().rsplit(")", 1)[1].split()',
    '                if fields[19] == start: signal.pidfd_send_signal(fd, signal.SIGKILL)',
    '            finally: os.close(fd)',
    '        except ProcessLookupError: pass',
    '        except FileNotFoundError: pass',
    '        except Exception as error: cleanup_errors.append(str(error))',
    '    if proc is not None:',
    '        try: proc.kill()',
    '        except Exception as error: cleanup_errors.append(str(error))',
    'signal.signal(signal.SIGTERM, terminate)',
    'proc = subprocess.Popen(sys.argv[1:])',
    'start = pathlib.Path(f"/proc/{proc.pid}/stat").read_text().rsplit(")", 1)[1].split()[19]',
    'pathlib.Path(os.environ["COMMAND_MANIFEST"]).write_text(json.dumps([[proc.pid, start]]))',
    'code = None',
    'while True:',
    '    try: pid, status = os.waitpid(-1, 0)',
    '    except ChildProcessError: break',
    '    if pid == proc.pid:',
    '        code = os.waitstatus_to_exitcode(status)',
    '        proc.returncode = code',
    'if code is None: raise RuntimeError("runner exit was not reaped")',
    'pathlib.Path(os.environ["COMPLETION_MANIFEST"]).write_text(json.dumps({"status": code, "interrupted": interrupted, "cleanupErrors": cleanup_errors}))',
    'if interrupted or cleanup_errors: raise RuntimeError("fixture supervision failed after reaping: " + repr(cleanup_errors))',
  ].join('\n')
  let closed = false
  let primaryFailed = false
  let primaryError: unknown
  let result = { status: 0, present: [] as [number, string][] }
  const cleanupErrors: unknown[] = []
  try {
    await new Promise<void>((resolve, reject) => {
      const proc = execFile(
        'python3',
        [script, '4', 'python3', '-c', supervisor, 'python3', script, '1', 'python3', '-c', parent],
        {
          env: {
            ...process.env,
            MANIFEST: manifest,
            COMMAND_MANIFEST: commandManifest,
            COMPLETION_MANIFEST: completionManifest,
          },
          timeout: 8000,
          killSignal: 'SIGKILL',
        },
        error => {
          if (error)
            reject(new Error('Outer containment failed, including native kills', { cause: error }))
          else resolve()
        },
      )
      proc.once('close', () => {
        closed = true
      })
    })
    const completion: { status: number; interrupted: boolean; cleanupErrors: string[] } =
      JSON.parse(readFileSync(completionManifest, 'utf8'))
    if (completion.interrupted || completion.cleanupErrors.length)
      throw new Error('Fixture supervision was interrupted or failed')
    result = { status: completion.status, present: fixtureIdentitiesPresent(manifest) }
  } catch (err) {
    primaryFailed = true
    primaryError = err
  } finally {
    try {
      cleanOwnedFixture([manifest, commandManifest])
    } catch (err) {
      cleanupErrors.push(err)
    }
    for (const path of [manifest, commandManifest]) {
      try {
        if (fixtureIdentitiesPresent(path).length)
          cleanupErrors.push(new Error(`Owned identities remain: ${path}`))
      } catch (err) {
        cleanupErrors.push(err)
      }
    }
    if (!closed) cleanupErrors.push(new Error('Supervisor closure unverified; manifest retained'))
  }
  if (cleanupErrors.length) {
    if (primaryFailed) cleanupErrors.unshift(primaryError)
    throw new AggregateError(cleanupErrors, `Fixture cleanup failed: ${dir}`)
  }
  rmSync(dir, { recursive: true, force: true })
  if (primaryFailed) throw primaryError
  return result
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
  it('reaps a detached grandchild holding inherited output at the deadline', async () => {
    const result = await runDetachedFixture('wait')
    expect(result.status).toBe(124)
    expect(result.present).toEqual([])
  }, 10_000)

  it('preserves a failed leader status while reaping its already-orphaned detached grandchild', async () => {
    const result = await runDetachedFixture('3')
    expect(result.status).toBe(3)
    expect(result.present).toEqual([])
  }, 10_000)
})
