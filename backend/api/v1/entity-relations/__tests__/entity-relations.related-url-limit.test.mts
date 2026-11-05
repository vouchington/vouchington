import { describe, expect, it, onTestFinished } from 'vitest'
import { createRequest } from '@voucha/test-helpers/api/server'
import {
  CONTRIBUTING_USER_AGE_MS,
  createTestPost,
  createTestUrlWithHostname,
  createTestUserWithAge,
  getEntityRelation,
} from '@voucha/test-helpers'
import { overrideDynamicConfigFieldsForTest } from '@voucha/test-helpers/dynamic-config'
import { relationLimitsConfig } from '@services/entity-relations/relation-limits'

describe('REST related URL capacity', () => {
  it('accepts the last slot and rejects a new URL while preserving the existing relation', async () => {
    await relationLimitsConfig.waitForInitialization()
    onTestFinished(
      overrideDynamicConfigFieldsForTest(relationLimitsConfig, { post_related_url: 1 }),
    )
    const user = await createTestUserWithAge(CONTRIBUTING_USER_AGE_MS)
    const post = await createTestPost({ user })
    const [first, second] = await Promise.all([
      createTestUrlWithHostname(),
      createTestUrlWithHostname(),
    ])
    const request = createRequest()
    await request.authenticateAs(user)
    const path = `/api/v1/entity-relations/post/${post.id}/related/url`
    await request.post(path).send({ objectId: first }).expect(201)
    const refused = await request.post(path).send({ objectId: second }).expect(409)
    expect(refused.body.code).toBe('RELATION_LIMIT_REACHED')
    expect(await getEntityRelation('relation__post__related__url', post.id, first)).toHaveLength(1)
    expect(await getEntityRelation('relation__post__related__url', post.id, second)).toHaveLength(0)
  })
})
