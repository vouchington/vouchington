import { beforeAll, expect, it, describe } from 'vitest'
import { createTestUser, getEntityRelation } from '@voucha/test-helpers'
import type { PrivateUser } from '@voucha/types/entities/user'
import { upsertUserMuteRelations } from './upsert-user-mutes.mts'

describe('upsert-user-mutes', () => {
  let subjectUser: PrivateUser
  let objectUser: PrivateUser

  beforeAll(async () => {
    subjectUser = await createTestUser()
    objectUser = await createTestUser()
  })

  it('upsertUserMuteRelations creates and deduplicates user mute relations', async () => {
    await upsertUserMuteRelations(subjectUser.id, [objectUser.id])
    await upsertUserMuteRelations(subjectUser.id, [objectUser.id])

    const relations = await getEntityRelation(
      'relation__user__mute__user',
      subjectUser.id,
      objectUser.id,
    )

    expect(relations).toHaveLength(1)
  })
})
