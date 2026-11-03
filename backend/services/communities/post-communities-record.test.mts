import { describe, expect, it } from 'vitest'
import { v7 as uuidv7 } from 'uuid'
import { createTestUser, insertTestCommunity } from '@voucha/test-helpers'
import { getPostCommunitiesRecord } from './post-communities-record.mts'

describe('getPostCommunitiesRecord', () => {
  it('returns community sidecar records for unique post community ids', async () => {
    const owner = await createTestUser()
    const community = await insertTestCommunity({ createdById: owner.id })

    await expect(
      getPostCommunitiesRecord([
        { community_id: community.id },
        { community_id: community.id },
        { community_id: uuidv7() },
        { community_id: null },
        null,
      ]),
    ).resolves.toEqual({
      [community.id]: { id: community.id, name: community.name, slug: community.slug },
    })
  })

  it('returns an empty record when no posts have a community id', async () => {
    await expect(getPostCommunitiesRecord([{ community_id: null }, null])).resolves.toEqual({})
  })
})
