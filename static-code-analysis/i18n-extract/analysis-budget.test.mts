import { describe, expect, it, vi } from 'vitest'
import { withI18nAnalysisBudget, type AnalysisBudgetClock } from './analysis-budget.mts'

describe('withI18nAnalysisBudget', () => {
  it('returns the work result when it finishes inside the budget', async () => {
    await expect(withI18nAnalysisBudget('analyzeProject', Promise.resolve('ok'))).resolves.toBe(
      'ok',
    )
  })

  it('rejects with the operation label when the budget elapses', async () => {
    const clock: AnalysisBudgetClock = {
      delay: () => Promise.reject(new Error('budget elapsed')),
    }
    await expect(
      withI18nAnalysisBudget('analyzeProject', new Promise(() => undefined), {
        clock,
        budgetMs: 25,
      }),
    ).rejects.toThrowError('no-mistakes analyzeProject exceeded 25ms (lock wait or hung analysis)')
  })

  it('names a host lock holder instead of a generic timeout', async () => {
    await expect(
      withI18nAnalysisBudget(
        'resolveCheck',
        Promise.reject(new Error('waiting for lock held by pid 2309074 for 0s')),
      ),
    ).rejects.toThrowError(
      'no-mistakes resolveCheck blocked on host lock: waiting for lock held by pid 2309074 for 0s',
    )
  })

  it('honors an explicitly requested budget at the resolved project deadline', async ({ task }) => {
    expect(task.timeout).toBe(5_000)
    vi.useFakeTimers()
    let settled = false
    const result = withI18nAnalysisBudget('analyzeProject', new Promise(() => undefined), {
      budgetMs: task.timeout,
    }).catch((err: unknown) => {
      settled = true
      return err
    })
    try {
      await vi.advanceTimersByTimeAsync(task.timeout - 1)
      expect(settled).toBe(false)
      await vi.advanceTimersByTimeAsync(1)
      await expect(result).resolves.toMatchObject({
        message: `no-mistakes analyzeProject exceeded ${task.timeout}ms (lock wait or hung analysis)`,
      })
    } finally {
      try {
        await vi.runAllTimersAsync()
      } finally {
        vi.useRealTimers()
      }
    }
  })

  it('shares one deadline across successive no-mistakes calls', async () => {
    let now = 10_000
    const clock: AnalysisBudgetClock = {
      delay: ms => Promise.reject(new Error(`delay ${ms}`)),
    }
    await expect(
      withI18nAnalysisBudget('resolveCheck', new Promise(() => undefined), {
        clock,
        budgetMs: 25_000,
        startedAt: 0,
        now: () => now,
      }),
    ).rejects.toThrowError('no-mistakes resolveCheck exceeded 15000ms (lock wait or hung analysis)')
  })

  it('does not impose a timeout when no budget is requested', async () => {
    const clock: AnalysisBudgetClock = {
      delay: () => Promise.reject(new Error('budget must not run')),
    }
    await expect(
      withI18nAnalysisBudget('analyzeProject', Promise.resolve('ok'), { clock }),
    ).resolves.toBe('ok')
  })
})
