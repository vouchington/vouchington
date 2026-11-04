import '@services/bookmarks'
import { describe, expect, it, onTestFinished } from 'vitest'
import { createTestUser } from '@voucha/test-helpers'
import { getFollowExists } from '@voucha/test-helpers/entities/follows'
import { overrideDynamicConfigFieldsForTest } from '@voucha/test-helpers/dynamic-config'
import { getEntityRelationMetadataOrThrow } from '@services/entity-relations/metadata'
import { relationLimitsConfig } from '@services/entity-relations/relation-limits'
import { upsertEntityRelation } from '@services/entity-relations/upsert'
import { softDeleteEntityRelation } from '@services/entity-relations/delete'
import { processAutoFollowReferrer } from './users.mts'

describe('referrer follow limit', () => {
  it('skips a new follow and preserves a deleted follow on replay at capacity', async () => {
    await relationLimitsConfig.waitForInitialization()
    onTestFinished(overrideDynamicConfigFieldsForTest(relationLimitsConfig, { follow_user: 1 }))
    const [user, oldReferrer, followed, newReferrer] = await Promise.all([
      createTestUser(),
      createTestUser(),
      createTestUser(),
      createTestUser(),
    ])
    const relation = getEntityRelationMetadataOrThrow({
      subjectType: 'user',
      predicate: 'follow',
      objectType: 'user',
    })
    await upsertEntityRelation(user, relation, user, [oldReferrer])
    await softDeleteEntityRelation(user, relation, user, [oldReferrer])
    await upsertEntityRelation(user, relation, user, [followed])
    await expect(
      processAutoFollowReferrer({ newUserId: user.id, referrerId: newReferrer.id }),
    ).resolves.toBeUndefined()
    await expect(
      processAutoFollowReferrer({ newUserId: user.id, referrerId: oldReferrer.id }),
    ).resolves.toBeUndefined()
    expect(await getFollowExists(user.id, newReferrer.id)).toBe(false)
    expect(await getFollowExists(user.id, oldReferrer.id)).toBe(false)
  })
})
