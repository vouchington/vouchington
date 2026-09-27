import type { PrivateUser } from '@services/users/types'
import type { RssFeedItemFeedOptions, RssFeedItemFeedResponse } from '@services/feeds/types'
import { getRssFeedItemFeedIds } from '@services/feeds'
import { runAndCapture } from '../run-support.mts'

export async function runRssFeedFirstAndContinuationScenarios(
  scenarioId: string,
  user: PrivateUser,
  options: RssFeedItemFeedOptions,
  suffix?: string,
): Promise<void> {
  let first: RssFeedItemFeedResponse | undefined
  await runAndCapture(
    scenarioId,
    async () => {
      first = await getRssFeedItemFeedIds(user, options)
    },
    suffix,
  )
  const after = first?.page_info.end_cursor
  if (!first?.page_info.has_next_page || !after) {
    throw new Error(`${scenarioId} must contain a continuation page`)
  }
  const previousIds = new Set(first.results.map(row => row.id))
  const previousDirectStories = new Set(
    first.results
      .filter(row => row.delivery_type === 'direct' && row.story_id)
      .map(row => row.story_id),
  )
  await runAndCapture(
    `${scenarioId}-after`,
    async () => {
      const next = await getRssFeedItemFeedIds(user, { ...options, after })
      if (
        !next.results.length ||
        next.results.some(
          row =>
            previousIds.has(row.id) ||
            (row.delivery_type === 'direct' &&
              row.story_id &&
              previousDirectStories.has(row.story_id)),
        )
      ) {
        throw new Error(`${scenarioId} continuation must contain new canonical deliveries`)
      }
    },
    suffix,
  )
}
