import { randomUUID } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import {
  ageBackgroundResponseRegistration,
  countBackgroundResponseRegistrations,
} from '@voucha/test-helpers'
import { registerBackgroundResponse } from './register.mts'
import { deleteBackgroundResponseRegistration } from './claim.mts'
import { getAgedBackgroundResponses } from './expired.mts'

describe('inline background response registry', () => {
  it('selects aged registrations in bounded UUIDv7 order and deletes one owned response', async () => {
    const olderId = `resp_${randomUUID()}`
    const newerId = `resp_${randomUUID()}`
    const agentSlug = `inline-${randomUUID()}`
    await registerBackgroundResponse({ responseId: newerId, agentSlug })
    await registerBackgroundResponse({ responseId: olderId, agentSlug })
    await ageBackgroundResponseRegistration(olderId, new Date('2020-01-01T00:00:00Z'))
    await ageBackgroundResponseRegistration(newerId, new Date('2020-01-02T00:00:00Z'))

    const aged = (await getAgedBackgroundResponses({ batchSize: 1000 })).filter(
      entry => entry.agentSlug === agentSlug,
    )
    expect(aged).toHaveLength(2)
    expect(aged[0]?.responseId).toBe(olderId)
    const beyondActiveFirstPage = (
      await getAgedBackgroundResponses({ batchSize: 1000, after: aged[0]!.id })
    ).filter(entry => entry.agentSlug === agentSlug)
    expect(beyondActiveFirstPage.map(entry => entry.responseId)).toEqual([newerId])
    await deleteBackgroundResponseRegistration(olderId)
    await expect(countBackgroundResponseRegistrations(olderId)).resolves.toBe(0)
    await deleteBackgroundResponseRegistration(newerId)
  })
})
