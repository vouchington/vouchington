import { describe, expect, it } from 'vitest'
import {
  archiveTestCommunity,
  createTestUser,
  deleteTestCommunity,
  insertTestCommunity,
} from '@voucha/test-helpers'
import { getCommunity } from './get.mts'
import { updateCommunityAutomodSettings } from './automod-settings.mts'
import { updateCommunityPostTypeSettings } from './post-type-settings.mts'

describe('community settings with an earlier caller snapshot', () => {
  it.each(['archived', 'deleted'] as const)(
    'rejects both settings writes after the community is %s',
    async state => {
      const administrator = await createTestUser({ administrator: true })
      const community = await insertTestCommunity({ createdById: administrator.id })
      const loaded = await getCommunity(community.id)
      if (!loaded) throw new Error('Expected created community')
      if (state === 'archived')
        await archiveTestCommunity({ communityId: community.id, archivedById: administrator.id })
      else await deleteTestCommunity({ communityId: community.id, deletedById: administrator.id })
      await expect(
        updateCommunityAutomodSettings(
          administrator,
          community.id,
          { automod_action: 'unpublish' },
          null,
          loaded,
        ),
      ).rejects.toMatchObject({ status: state === 'archived' ? 403 : 404 })
      await expect(
        updateCommunityPostTypeSettings(
          administrator,
          community.id,
          { should_allow_review_posts: false },
          null,
          loaded,
        ),
      ).rejects.toMatchObject({ status: state === 'archived' ? 403 : 404 })
      const current = await getCommunity(community.id)
      expect(
        current && {
          automod_action: current.automod_action,
          should_allow_review_posts: current.should_allow_review_posts,
        },
      ).toEqual(
        state === 'deleted'
          ? null
          : {
              automod_action: loaded.automod_action,
              should_allow_review_posts: loaded.should_allow_review_posts,
            },
      )
    },
  )
})
