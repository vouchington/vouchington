import type { PrivateUser } from '@services/users/types'
import type { PostFeedOptions, PostFeedResponse } from '@services/feeds/types'
import { getPostFeedIds } from '@services/feeds'
import { heavyFollowUser, runAndCapture, seedUser } from '../run-support.mts'
import { seedUuid } from '../seed-data/common.mts'
import { POST_SHARE_EMPTY_USER_INDEX } from '../seed-data/post-feed-shares.mts'

export async function runPostFeedShareScenarios(): Promise<void> {
  for (const feedType of ['all', 'follow_topics'] as const) {
    await runAndCapture(`post-feed-shares-disabled-${feedType}`, async () => {
      const page = await getPostFeedIds(heavyFollowUser as PrivateUser, {
        feed_type: feedType,
        limit: 25,
      })
      if (page.results.some(row => row.delivery_type === 'share'))
        throw new Error('Disabled share feed must return direct deliveries only')
    })
  }
  await runAndCapture('post-feed-shares-empty', async () => {
    const page = await getPostFeedIds(
      { ...seedUser, id: seedUuid(POST_SHARE_EMPTY_USER_INDEX, '01') } as PrivateUser,
      { feed_type: 'follow_users', limit: 25 },
    )
    if (!page.results.length || page.results.some(row => row.delivery_type === 'share'))
      throw new Error('Empty share fixture must retain direct deliveries')
  })
  for (const [name, user] of [
    ['sparse', seedUser],
    ['dense', heavyFollowUser],
  ] as const) {
    for (const sort of ['new', 'hot'] as const) {
      await runSharePages(`post-feed-shares-${name}-${sort}`, user as PrivateUser, {
        feed_type: 'follow_users',
        sort,
        limit: 25,
      })
    }
  }
}

async function runSharePages(
  scenarioId: string,
  user: PrivateUser,
  options: PostFeedOptions,
): Promise<void> {
  let first: PostFeedResponse | undefined
  await runAndCapture(scenarioId, async () => {
    first = await getPostFeedIds(user, options)
    if (!first.results.some(row => row.delivery_type === 'share'))
      throw new Error(`${scenarioId} must include real shared deliveries`)
  })
  const after = first?.page_info.end_cursor
  if (!first?.page_info.has_next_page || !after)
    throw new Error(`${scenarioId} must have a continuation page`)
  const previousIds = new Set(first.results.map(row => row.id))
  await runAndCapture(`${scenarioId}-after`, async () => {
    const next = await getPostFeedIds(user, { ...options, after })
    if (!next.results.length || next.results.some(row => previousIds.has(row.id)))
      throw new Error(`${scenarioId} continuation must contain new delivery IDs`)
  })
}
