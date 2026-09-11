import { test as base, type Page } from '../../helpers/test.mts'
import {
  insertScoredPostTopicCategoryRelation,
  softDeleteScoredPostTopicCategoryRelation,
} from '../../../backend/test-helpers/entities/entity-relations.mts'
import { deleteTestPost, insertTestPost } from '../../../backend/test-helpers/entities/posts.mts'
import { loginAsUser } from '../../helpers/auth.mts'
import {
  CONTRIBUTING_USER_AGE_MS,
  createTestUserWithAge,
} from '../../../backend/test-helpers/index.mts'
import { navigateTo } from '../../helpers/navigate-to.mts'
import { randomSuffix } from '../../helpers/random-id.mts'
import { waitForBelowFoldHydration } from '../../helpers/wait-for-hydration.mts'
import { voteBinaryChoice, voteClear } from '../../helpers/semantic-vote.mts'

const TEST_USER_ID = '019f0000-0000-7000-8000-000000000000'
const AMEX_TOPIC_ID = '019c64e6-f713-7bf3-8b1e-a869aa7c9cf1'

export const test = base.extend<{ tagVotingDiscussionIds: string[] }>({
  tagVotingDiscussionIds: async ({ browserName: _browserName }, run) => {
    const discussionIds: string[] = []

    await run(discussionIds)

    await Promise.all(
      discussionIds.map(async discussionId => {
        await softDeleteScoredPostTopicCategoryRelation(discussionId, AMEX_TOPIC_ID, TEST_USER_ID)
        await deleteTestPost(discussionId)
      }),
    )
  },
})

async function createTagVotingDiscussion(tagVotingDiscussionIds: string[]): Promise<string> {
  const random = randomSuffix()
  const postId = await insertTestPost({
    title: `Playwright tag voting ${random}`,
    slug: `playwright-tag-voting-${random}`,
    createdById: TEST_USER_ID,
    markdown: 'Seeded per-test discussion for tag vote interactions.',
    postType: 'discussion',
    createdAt: new Date(Date.now() - 1000),
  })

  await insertScoredPostTopicCategoryRelation(postId, AMEX_TOPIC_ID, TEST_USER_ID)
  tagVotingDiscussionIds.push(postId)

  return postId
}

export async function waitForVoteButtonHydration(page: Page): Promise<void> {
  await firstTagVote(page).waitFor({ state: 'attached' })
  try {
    await firstTagVote(page).scrollIntoViewIfNeeded()
  } catch (error) {
    if (!(error instanceof Error) || !error.message.includes('not attached to the DOM')) throw error

    await firstTagVote(page).waitFor({ state: 'attached' })
    await firstTagVote(page).scrollIntoViewIfNeeded()
  }
  await waitForBelowFoldHydration(page)
}

function firstTagVote(page: Page) {
  return voteBinaryChoice(page, 'tag-vote', 'confirm').first()
}

export function tagConfirmButton(page: Page) {
  return voteBinaryChoice(page, 'tag-vote', 'confirm').first()
}

export function tagDisputeButton(page: Page) {
  return voteBinaryChoice(page, 'tag-vote', 'dispute').first()
}

export function tagClearButton(page: Page) {
  return voteClear(page, 'tag-vote').first()
}

export async function navigateToTagVotingDiscussion(
  page: Page,
  tagVotingDiscussionIds: string[],
  options: { authenticated?: boolean; manage?: boolean } = {},
): Promise<string> {
  const discussionId = await createTagVotingDiscussion(tagVotingDiscussionIds)
  if (options.authenticated !== false) {
    const contributor = await createTestUserWithAge(CONTRIBUTING_USER_AGE_MS)
    if (!contributor) throw new Error('Failed to create tag voting contributor')
    await loginAsUser(page, contributor.id)
  }
  await navigateTo(page, `/discussion/${discussionId}${options.manage ? '/tags/topic' : ''}`)
  return discussionId
}
