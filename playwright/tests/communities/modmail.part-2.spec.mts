import { test, expect } from '../../helpers/test.mts'
import { loginAsUser } from '../../helpers/auth.mts'
import { navigateTo } from '../../helpers/navigate-to.mts'
import { randomSuffix } from '../../helpers/random-id.mts'
import { requireTestValue } from '../../helpers/assertions.mts'
import {
  createTestUser,
  insertTestCommunity,
  insertTestCommunityMember,
  createTestModmailThread,
  createTestDirectMessage,
} from '../../../backend/test-helpers/index.mts'

test.describe('Modmail thread pagination', () => {
  let ownerUserId = ''
  let communitySlug = ''
  let threadId = ''

  test.beforeAll(async () => {
    const suffix = randomSuffix()
    const owner = requireTestValue(
      await createTestUser({ username: `mm-thread-pager-${suffix}` }),
      'Failed to create owner user',
    )
    ownerUserId = owner.id
    const member = requireTestValue(
      await createTestUser({ username: `mm-thread-member-${suffix}` }),
      'Failed to create member user',
    )

    communitySlug = `mm-thread-paged-${suffix}`
    const community = await insertTestCommunity({
      createdById: owner.id,
      slug: communitySlug,
      name: `MM Thread Paged ${suffix}`,
    })
    await insertTestCommunityMember({ communityId: community.id, userId: owner.id, role: 'owner' })
    await insertTestCommunityMember({
      communityId: community.id,
      userId: member.id,
      role: 'member',
    })

    threadId = (
      await createTestModmailThread({
        communityId: community.id,
        subjectUserId: member.id,
        modUserId: owner.id,
      })
    ).id
    await Promise.all(
      Array.from({ length: 51 }, (_, i) =>
        createTestDirectMessage({
          conversationId: threadId,
          createdById: member.id,
          bodyText: `Message ${i + 1} of 51`,
        }),
      ),
    )
  })

  test('shows load-more button when modmail thread has more than one page of messages', async ({
    page,
  }) => {
    await loginAsUser(page, ownerUserId)
    await navigateTo(page, `/communities/${communitySlug}/settings/moderation/modmail/${threadId}`)

    const loadMore = page.getByTestId('modmail-thread-load-more')
    await expect(loadMore).toBeVisible()
    await loadMore.click()
    await expect(loadMore).toBeHidden()
  })
})
