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
