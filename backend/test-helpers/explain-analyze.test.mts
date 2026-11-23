import { describe, expect, it } from 'vitest'
import { explainAnalyze } from './explain-analyze.mts'

describe('explainAnalyze', () => {
  it('captures under the fixed 32MB work_mem budget', async () => {
    const result = await explainAnalyze(
      'fixed-work-mem',
      `/* explainFixedWorkMem */ SELECT 1 WHERE current_setting('work_mem') = '32MB'`,
    )
    expect((result.plan as { Plan: Record<string, unknown> }).Plan['Actual Rows']).toBe(1)
  })

  it('rejects invalid JIT modes before acquiring an EXPLAIN client', async () => {
    const originalMode = process.env.EXPLAIN_JIT_MODE
    process.env.EXPLAIN_JIT_MODE = 'sometimes'
    try {
      await expect(explainAnalyze('invalid-jit', '/* invalidJit */ SELECT 1')).rejects.toThrow(
        'EXPLAIN_JIT_MODE must be "on" or "off", got "sometimes"',
      )
    } finally {
      if (originalMode === undefined) delete process.env.EXPLAIN_JIT_MODE
      else process.env.EXPLAIN_JIT_MODE = originalMode
    }
  })
})
