import { describe, expect, it } from 'vitest'
import {
  SLOT_NOISE_USER_DELETE_BATCH,
  SlotNoiseUserDeleteError,
  deleteSlotNoiseUsers,
} from './community-agent-prompt-slot-count-deletes.mts'

const COHORT_SIZE = 1_000

function cohort(prefix: string): string[] {
  return Array.from({ length: COHORT_SIZE }, (_, index) => `${prefix}-${index}`)
}

describe('deleteSlotNoiseUsers', () => {
  it('deletes both 1000-id cohorts in bounded statements under a custom plan', async () => {
    const texts: string[] = []
    const sizes: number[] = []
    const query = async (text: string, values?: readonly unknown[]) => {
      texts.push(text)
      const ids = values?.[0]
      if (Array.isArray(ids)) sizes.push(ids.length)
    }

    await deleteSlotNoiseUsers(query, cohort('system'), cohort('creator'))

    expect(texts[0]).toContain("set_config('plan_cache_mode', 'force_custom_plan', true)")
    expect(sizes.length).toBe((COHORT_SIZE / SLOT_NOISE_USER_DELETE_BATCH) * 2)
    expect(Math.max(...sizes)).toBeLessThanOrEqual(SLOT_NOISE_USER_DELETE_BATCH)
    expect(sizes.reduce((sum, size) => sum + size, 0)).toBe(COHORT_SIZE * 2)
  })

  it('names the batch size when a user delete hits statement_timeout', async () => {
    const timeout = Object.assign(new Error('canceling statement due to statement timeout'), {
      code: '57014',
    })
    let calls = 0
    const query = async () => {
      calls += 1
      if (calls > 1) throw timeout
    }

    await expect(
      deleteSlotNoiseUsers(query, cohort('system'), cohort('creator')),
    ).rejects.toSatisfy(
      (error: unknown) =>
        error instanceof SlotNoiseUserDeleteError &&
        error.batchSize === SLOT_NOISE_USER_DELETE_BATCH &&
        error.statementCode === '57014' &&
        error.cause === timeout,
    )
  })
})
