import { describe, expect, it } from 'vitest'
import { overrideDynamicConfigFieldsForTest } from '@voucha/test-helpers/dynamic-config'
import { captureScopedTestQueries } from '@voucha/test-helpers/query-capture'
import {
  getFollowNewsSourcesRecipients,
  getFollowTopicsRecipients,
  getPostReferralLinkRecipients,
} from './engagement-email-recipients.mts'
import { engagementEmailsWorkConfig } from './work-limits.mts'

const RECIPIENT_ANNOTATIONS = [
  'getFollowTopicsRecipients',
  'getPostReferralLinkRecipients',
  'getFollowNewsSourcesRecipients',
] as const

describe('engagement recipient user filter', () => {
  it('omits a null user-id array from an unfiltered page and binds a provided page', async () => {
    const restore = overrideDynamicConfigFieldsForTest(engagementEmailsWorkConfig, {
      dispatch_batch_size: 1,
    })
    try {
      const startedAt = new Date('2026-01-15T00:00:00.000Z')
      const unfiltered = await captureScopedTestQueries(async () => {
        await getFollowTopicsRecipients()
        await getPostReferralLinkRecipients(startedAt)
        await getFollowNewsSourcesRecipients(startedAt)
      })
      const unfilteredRecipients = RECIPIENT_ANNOTATIONS.map(annotation => {
        const query = unfiltered.find(candidate => candidate.text.includes(`/* ${annotation} */`))
        if (query === undefined) throw new Error(`missing recipient query ${annotation}`)
        return query
      })
      for (const query of unfilteredRecipients) {
        expect(query.text).not.toContain('ANY(')
        expect(query.values.some(value => Array.isArray(value))).toBe(false)
      }

      const userId = crypto.randomUUID()
      const filtered = await captureScopedTestQueries(() => getFollowTopicsRecipients([userId]))
      const filteredRecipient = filtered.find(query =>
        query.text.includes('/* getFollowTopicsRecipients */'),
      )
      expect(filteredRecipient?.text).toContain('ANY(')
      expect(filteredRecipient?.values).toContainEqual([userId])
    } finally {
      restore()
    }
  })
})
