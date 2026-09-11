import { describe, expect, it, vi } from 'vitest'
import type { OpenAiSpendCapBreach } from '@services/ai-usage'
import { assertSpendCapNotBreachedForIteration } from './spend-cap-check.mts'

const noBreach: OpenAiSpendCapBreach = {
  reason: 'cap_exceeded',
  totalMicrounits: 10_000_000,
  dailyCapMicrounits: 10_000_000,
  day: '2026-08-16',
}

describe('assertSpendCapNotBreachedForIteration', () => {
  it('no-ops without calling the deps check when agentSlug is unset', async () => {
    const check = vi.fn<(callerName: string) => Promise<OpenAiSpendCapBreach | null>>()

    await expect(
      assertSpendCapNotBreachedForIteration(undefined, { assertOpenAiSpendCapNotBreached: check }),
    ).resolves.toBeUndefined()

    expect(check).not.toHaveBeenCalled()
  })

  it('resolves without throwing when the deps check reports no breach', async () => {
    const check = vi
      .fn<(callerName: string) => Promise<OpenAiSpendCapBreach | null>>()
      .mockResolvedValue(null)

    await expect(
      assertSpendCapNotBreachedForIteration('autotagger', {
        assertOpenAiSpendCapNotBreached: check,
      }),
    ).resolves.toBeUndefined()

    expect(check).toHaveBeenCalledExactlyOnceWith('autotagger')
  })

  it('throws OpenAiSpendCapBreachError carrying the breach when the deps check reports one', async () => {
    const check = vi
      .fn<(callerName: string) => Promise<OpenAiSpendCapBreach | null>>()
      .mockResolvedValue(noBreach)

    const promise = assertSpendCapNotBreachedForIteration('autotagger', {
      assertOpenAiSpendCapNotBreached: check,
    })

    await expect(promise).rejects.toMatchObject({
      name: 'OpenAiSpendCapBreachError',
      message: expect.stringContaining('OpenAI spend cap breached'),
      breach: noBreach,
    })
  })
})
