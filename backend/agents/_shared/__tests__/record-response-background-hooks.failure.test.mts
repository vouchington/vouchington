import { randomUUID } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import { acquireTestAiUsageDateReservation } from '@voucha/test-helpers'
import { unlinkTestAiUsageUncertaintyKey } from '@voucha/test-helpers/ai-usage-uncertainty-key'
import { getAccountingUncertaintyKey, getAccountingUncertaintySource } from '@services/ai-usage'
import { createBackgroundResponseRegistrationHooks } from '../record-response-background-hooks.mts'

describe('inline background response registration failure', () => {
  it('latches the billed request day when PostgreSQL rejects its response ID', async () => {
    const reservation = await acquireTestAiUsageDateReservation()
    const day = reservation.day
    const createdAt = new Date(`${day}T12:00:00.000Z`)
    const hooks = createBackgroundResponseRegistrationHooks({
      agentSlug: `registration-failure-${randomUUID()}`,
      createdAt,
    })
    try {
      await expect(hooks.hooks.onResponseCreated('x'.repeat(101))).rejects.toMatchObject({
        code: '23514',
      })
      expect(hooks.getRegistration()).toBeUndefined()
      await expect(getAccountingUncertaintySource(day)).resolves.toBe('unknown_billed_attempt')
    } finally {
      try {
        await unlinkTestAiUsageUncertaintyKey(getAccountingUncertaintyKey(day))
      } finally {
        await reservation.release()
      }
    }
  })
})
