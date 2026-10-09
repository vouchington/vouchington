import { spawnSync } from 'node:child_process'
import { existsSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const script = join(process.cwd(), 'ci/run-bounded.py')
const fixture = join(process.cwd(), 'ci/test-helpers/bounded-descendant-regression.py')

describe('run-bounded native reaping', () => {
  it('rejects an unavailable task-children interface before launching the command', () => {
    const directory = mkdtempSync(join(tmpdir(), 'bounded-no-children-'))
    const marker = join(directory, 'launched')
    try {
      const result = spawnSync(
        'python3',
        [
          '-c',
          `
import os, runpy, sys
from pathlib import Path
from unittest.mock import patch
script, marker = sys.argv[1:]
read_text = Path.read_text
missing = Path(f'/proc/{os.getpid()}/task/{os.getpid()}/children')
def read(path, *args, **kwargs):
    if path == missing:
        raise FileNotFoundError('task-children interface unavailable')
    return read_text(path, *args, **kwargs)
sys.argv = [script, '1', sys.executable, '-c', 'from pathlib import Path; import sys; Path(sys.argv[1]).touch()', marker]
with patch.object(Path, 'read_text', read):
    runpy.run_path(script, run_name='__main__')
`,
          script,
          marker,
        ],
        { encoding: 'utf8', timeout: 2000 },
      )
      expect(result.error).toBeUndefined()
      expect(result.signal).toBeNull()
      expect(result.status).toBe(1)
      expect(result.stderr).toContain('task-children interface unavailable')
      expect(existsSync(marker)).toBe(false)
    } finally {
      rmSync(directory, { recursive: true, force: true })
    }
  })

  it.each(['open', 'signal'])('rejects unsupported pidfd %s before launching the command', mode => {
    const directory = mkdtempSync(join(tmpdir(), 'bounded-no-pidfd-'))
    const marker = join(directory, 'launched')
    try {
      const result = spawnSync(
        'python3',
        [
          '-c',
          `
import errno, os, runpy, signal, sys
from unittest.mock import patch
script, marker, mode = sys.argv[1:]
sys.argv = [script, '1', sys.executable, '-c', 'from pathlib import Path; import sys; Path(sys.argv[1]).touch()', marker]
error = OSError(errno.ENOSYS, 'pidfd syscall unavailable')
owner, name = (os, 'pidfd_open') if mode == 'open' else (signal, 'pidfd_send_signal')
with patch.object(owner, name, side_effect=error):
    runpy.run_path(script, run_name='__main__')
`,
          script,
          marker,
          mode,
        ],
        { encoding: 'utf8', timeout: 2000 },
      )
      expect(result.error).toBeUndefined()
      expect(result.signal).toBeNull()
      expect(result.status).toBe(1)
      expect(result.stderr).toContain('pidfd syscall unavailable')
      expect(existsSync(marker)).toBe(false)
    } finally {
      rmSync(directory, { recursive: true, force: true })
    }
  })

  it.each(['deadline124', 'leader7'])(
    'preserves %s while continuing cleanup after a denied descendant signal',
    mode => {
      const directory = mkdtempSync(join(tmpdir(), 'bounded-denied-signal-'))
      try {
        const result = spawnSync(
          'python3',
          [
            '-c',
            `
import json, os, runpy, signal, subprocess, sys
from pathlib import Path
from unittest.mock import patch
script, directory, mode = sys.argv[1:]
root = Path(directory)
fifo = root / 'release'
os.mkfifo(fifo)
command = """
import os, signal, sys
from pathlib import Path
root = Path(sys.argv[1])
r, w = os.pipe()
first = os.fork()
if first == 0:
    fd = os.open(root / 'release', os.O_RDWR)
    (root / 'denied').write_text(str(os.getpid()))
    os.write(w, b'x')
    os.read(fd, 1)
    os._exit(0)
second = os.fork()
if second == 0:
    (root / 'other').write_text(str(os.getpid()))
    os.write(w, b'x')
    signal.pause()
    os._exit(0)
os.close(w)
ready = b''
while len(ready) < 2:
    ready += os.read(r, 2)
if sys.argv[2] == 'leader7':
    os._exit(7)
signal.pause()
"""
module = runpy.run_path(script)
real_signal, real_launch = signal.pidfd_send_signal, subprocess.Popen
procs, denied = [], []
def launch(*args, **kwargs):
    proc = real_launch(*args, **kwargs)
    procs.append(proc)
    return proc
def send(fd, sig, *args):
    pid = int(next(line.split(':', 1)[1] for line in Path(f'/proc/self/fdinfo/{fd}').read_text().splitlines() if line.startswith('Pid:')))
    marker = root / 'denied'
    if sig and marker.exists() and pid == int(marker.read_text()):
        denied.append(pid)
        release = os.open(fifo, os.O_WRONLY | os.O_NONBLOCK)
        try:
            os.write(release, b'x')
        finally:
            os.close(release)
        raise PermissionError('owned descendant signal denied')
    return real_signal(fd, sig, *args)
primary, cleanup_errors, forced = [], [], False
try:
    sys.argv = [script, '1', sys.executable, '-c', command, directory, mode]
    with patch.object(signal, 'pidfd_send_signal', send), patch.object(subprocess, 'Popen', launch):
        code = module['main']()
    if code != (124 if mode == 'deadline124' else 7):
        raise AssertionError(f'Command status lost: {code}')
    if not denied:
        raise AssertionError('Permission boundary was not exercised')
except BaseException as error:
    primary.append(error)
finally:
    for proc in procs:
        try:
            owned, statuses = {}, []
            module['capture'](owned)
            forced = forced or bool(module['alive'](owned))
            drained, found = module['settle'](proc, owned, signal.SIGTERM, statuses)
            forced = forced or found
            if not drained:
                forced = True
                drained, _ = module['settle'](proc, owned, signal.SIGKILL, statuses)
            proc.wait(timeout=1)
            if not drained or module['alive'](owned) or module['children'](os.getpid()):
                raise AssertionError('Fixture cleanup incomplete')
        except BaseException as error:
            cleanup_errors.append(error)
if primary or cleanup_errors:
    raise BaseExceptionGroup('Regression and cleanup failures', primary + cleanup_errors)
other = int((root / 'other').read_text())
if Path(f'/proc/{other}/stat').exists() or forced:
    raise AssertionError('Passing fixture required forced cleanup')
print(json.dumps({'code': code, 'denied': denied, 'other': other, 'forced': forced}))
`,
            script,
            directory,
            mode,
          ],
          { encoding: 'utf8', timeout: 8000 },
        )
        expect(result.error).toBeUndefined()
        expect(result.signal).toBeNull()
        expect(result.status).toBe(0)
        const report = JSON.parse(result.stdout.trim())
        expect(report.code).toBe(mode === 'deadline124' ? 124 : 7)
        expect(report.denied.length).toBeGreaterThan(0)
        expect(report.forced).toBe(false)
        expect(result.stderr).toContain('owned descendant signal denied')
        expect(result.stderr).toContain(`Reaped owned PID ${report.other}: exit -15`)
      } finally {
        rmSync(directory, { recursive: true, force: true })
      }
    },
    10_000,
  )

  it('reaps a nonzero orphan before releasing its successful leader', () => {
    const result = spawnSync(
      'python3',
      [script, '8', 'python3', fixture, 'natural', script, script],
      {
        encoding: 'utf8',
        timeout: 12_000,
      },
    )
    expect(result.error).toBeUndefined()
    expect(result.status).toBe(0)
    const report = JSON.parse(result.stdout.trim())
    expect(report.reapedBeforeRelease).toBe(true)
    expect(report.childAbsent).toBe(true)
    expect(report.cleanupSignalCount).toBe(0)
    expect(report.settlementResidualFound).toBe(false)
    expect(report.code).toBe(0)
  }, 15_000)

  it('reports a late adopted TERM0 child as residual cleanup', () => {
    const result = spawnSync(
      'python3',
      [script, '8', 'python3', fixture, 'settlement', script, script],
      {
        encoding: 'utf8',
        timeout: 12_000,
      },
    )
    expect(result.error).toBeUndefined()
    expect(result.status).toBe(0)
    const report = JSON.parse(result.stdout.trim())
    expect(report.drained).toBe(true)
    expect(report.foundResidual).toBe(true)
    expect(report.childAbsent).toBe(true)
    expect(report.cleanupSignalCount).toBe(0)
    expect(report.settlementResidualFound).toBe(false)
  }, 15_000)
})
