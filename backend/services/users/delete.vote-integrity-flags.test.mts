import { describe, expect, it } from 'vitest'
import { v7 } from 'uuid'
import {
  createTestUser,
  getTestPostVoteIds,
  getTestVoteIntegrityFlagDetails,
  hardDeleteTestPost,
  insertTestPost,
  insertTestPostVote,
  insertTestVoteIntegrityFlag,
} from '@voucha/test-helpers'
import { deleteUserAndDrainForTest } from '@voucha/test-helpers/services/users/delete-test-support'

describe('deleteUser and entity-level integrity flags', () => {
  it('keeps the flag after voter deletion and removes it with its target', async () => {
    const creator = await createTestUser()
    const voter = await createTestUser()
    const postId = await insertTestPost({
      title: `Integrity target ${v7()}`,
      slug: `integrity-target-${v7()}`,
      createdById: creator.id,
      markdown: 'test',
    })
    await insertTestPostVote(postId, voter.id, '127.0.0.1', 1)
    const details = { distinct_user_count: 1, threshold: 3 }
    const flagId = await insertTestVoteIntegrityFlag({ postId, details })

    await deleteUserAndDrainForTest(voter, voter)
    expect(await getTestPostVoteIds(postId, voter.id)).toEqual([])
    expect(await getTestVoteIntegrityFlagDetails(flagId)).toEqual(details)

    await hardDeleteTestPost(postId)
    expect(await getTestVoteIntegrityFlagDetails(flagId)).toEqual({})
  })
})
