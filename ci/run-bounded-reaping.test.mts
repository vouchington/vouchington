import { spawnSync } from 'node:child_process'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const script = join(process.cwd(), 'ci/run-bounded.py')
const fixture = join(process.cwd(), 'ci/test-helpers/bounded-descendant-regression.py')

describe('run-bounded native reaping', () => {
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
