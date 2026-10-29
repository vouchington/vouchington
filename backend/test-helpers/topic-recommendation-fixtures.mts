import { read } from '@data-stores/psql'
import sql from 'sql-template-strings'

/**
 * Creates a recommendation through the public prepare/finalize entry point the API and imports use.
 * The caller passes `prepareTopicRecommendation` so this helper workspace stays free of service
 * dependencies. An options argument with `skipCreatedEvents` leaves the post-create events unrun.
 */
export async function createTestTopicRecommendation<Args extends unknown[], Response>(
  prepare: (...args: Args) => Promise<{ response: Response; finalize: () => Promise<void> }>,
  ...args: Args
): Promise<Response> {
  const { response, finalize } = await prepare(...args)
  const options = args[3] as { skipCreatedEvents?: boolean } | undefined
  if (!options?.skipCreatedEvents) await finalize()
  return response
}

export async function getTestTopicRecommendationRejectionReason(
  postId: string,
): Promise<string | null> {
  const { rows } = await read<{
    rejection_reason: string | null
  }>(sql`/* getTestTopicRecommendationRejectionReason */
    SELECT rejection_reason FROM post_topic_recommendations WHERE post_id = ${postId}
  `)
  return rows[0]?.rejection_reason ?? null
}
