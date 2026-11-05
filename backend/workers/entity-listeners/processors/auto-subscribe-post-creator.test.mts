import { describe, expect, it, onTestFinished } from 'vitest'
import { createTestUser, createTestPost } from '@voucha/test-helpers'
import { overrideDynamicConfigFieldsForTest } from '@voucha/test-helpers/dynamic-config'
import { relationLimitsConfig } from '@services/entity-relations/relation-limits'
import { getEntityRelationMetadataOrThrow } from '@services/entity-relations/metadata'
import { upsertEntityRelation } from '@services/entity-relations/upsert'
import { getBookmarksForEntity } from '@services/bookmarks/get'
import { autoSubscribePostCreator } from './auto-subscribe-post-creator.mts'

describe('post creator subscription capacity', () => {
  it('skips the automatic subscription without failing the post-created processor', async () => {
    await relationLimitsConfig.waitForInitialization()
    onTestFinished(overrideDynamicConfigFieldsForTest(relationLimitsConfig, { subscribe_post: 1 }))
    const user = await createTestUser()
    const [first, second] = await Promise.all([createTestPost(), createTestPost()])
    const relation = getEntityRelationMetadataOrThrow({
      subjectType: 'user',
      objectType: 'post',
      predicate: 'subscribe',
    })
    await upsertEntityRelation(user, relation, user, [first])
    await expect(autoSubscribePostCreator(second, user)).resolves.toBeUndefined()
    expect(await getBookmarksForEntity(user, 'post', second)).not.toHaveProperty('subscribe')
  })
})
