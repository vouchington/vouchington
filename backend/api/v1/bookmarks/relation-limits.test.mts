import { describe, expect, it, onTestFinished } from 'vitest'
import { createRequest } from '@voucha/test-helpers/api/server'
import { createTestUser, createTestTopic } from '@voucha/test-helpers'
import { overrideDynamicConfigFieldsForTest } from '@voucha/test-helpers/dynamic-config'
import { relationLimitsConfig } from '@services/entity-relations/relation-limits'

describe('REST relation capacity', () => {
  it('returns the stable refusal code and allows active bookmark retries', async () => {
    await relationLimitsConfig.waitForInitialization()
    onTestFinished(overrideDynamicConfigFieldsForTest(relationLimitsConfig, { follow_topic: 1 }))
    const user = await createTestUser()
    const [first, second] = await Promise.all([createTestTopic(), createTestTopic()])
    const request = createRequest()
    await request.authenticateAs(user)
    await request.put(`/api/v1/bookmarks/topic/${first.id}/follow`).expect(200)
    await request.put(`/api/v1/bookmarks/topic/${first.id}/follow`).expect(200)
    const bookmark = await request.put(`/api/v1/bookmarks/topic/${second.id}/follow`).expect(409)
    expect(bookmark.body.code).toBe('RELATION_LIMIT_REACHED')
  })
})
