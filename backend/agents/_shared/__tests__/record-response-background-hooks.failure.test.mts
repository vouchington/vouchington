import { randomUUID } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import { acquireTestAiUsageDateReservation } from '@voucha/test-helpers'
import { unlinkTestAiUsageUncertaintyKey } from '@voucha/test-helpers/ai-usage-uncertainty-key'
import { getAccountingUncertaintyKey, getAccountingUncertaintySource } from '@services/ai-usage'
import { runWithBackgroundResponseJob } from '../background-response-job-context.mts'
import { createBackgroundResponseRegistrationHooks } from '../record-response-background-hooks.mts'

describe('background response registration failure', () => {
  it('latches the billed request day when persisting the response ID fails', async () => {
    const reservation = await acquireTestAiUsageDateReservation()
    const day = reservation.day
    const createdAt = new Date(`${day}T12:00:00.000Z`)
    const hooks = createBackgroundResponseRegistrationHooks({
      agentSlug: `registration-failure-${randomUUID()}`,
      createdAt,
    })
    try {
      const failure = new Error('response ID write failed')
      await expect(
        runWithBackgroundResponseJob(
          {
            register: async () => {
              throw failure
            },
            settle: async () => undefined,
          },
          () => hooks.hooks.onResponseCreated(`resp_${randomUUID()}`),
        ),
      ).rejects.toBe(failure)
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
