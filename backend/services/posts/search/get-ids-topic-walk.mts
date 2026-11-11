import type { BasicUser } from '@services/users/types'
import { buildPostSearchQuery } from './query-builder.mts'
import { TOPIC_WALK_ROW_CAP, usesCappedTopicWalk } from './query-builder/topic-walk.mts'
import { executePostSearchQuery } from './execute-query.mts'
import type { PostSearchOptions, PostSearchSort } from './types.mts'
import type { PostSearchRow } from './get-ids-types.mts'

/** The last row a capped topic walk inspected, or undefined when the walk reached the end. */
export async function readInspectedTail(
  currentUser: BasicUser | undefined,
  options: PostSearchOptions,
  sort: PostSearchSort,
  hasSemanticSearch: boolean,
): Promise<PostSearchRow | undefined> {
  if (!usesCappedTopicWalk(options, sort)) return undefined
  const { rows } = await executePostSearchQuery<PostSearchRow & { walk_rows: string | number }>(
    buildPostSearchQuery(currentUser, { ...options, inspectedTail: true }),
    hasSemanticSearch,
  )
  const [tail] = rows
  return tail && Number(tail.walk_rows) >= TOPIC_WALK_ROW_CAP ? tail : undefined
}
