import { read } from '@data-stores/psql'
import sql from 'sql-template-strings'
import { POST_ELECTION_CONFIG } from '../post/config.mts'
import { AGENT_MODERATION_ELECTION_CONFIG } from '../agent-moderation/config.mts'
import { buildElectionVoteRowsByUserQuery } from './vote-queries.mts'
import { mapCurrentVotes } from './vote-get.mts'
import type { ElectionVote } from './types.mts'

/** One page's post and moderation ballots, preserving each family's vote policy. */
export async function getPostAndModerationVotes(
  userId: string,
  postIds: string[],
  moderationIds: string[],
): Promise<ElectionVote[]> {
  const groups = [
    { config: POST_ELECTION_CONFIG, ids: postIds },
    { config: AGENT_MODERATION_ELECTION_CONFIG, ids: moderationIds },
  ].filter(group => group.ids.length > 0)
  if (!groups.length) return []
  const query = sql`/* getPostAndModerationVotes */ `
  groups.forEach((group, index) => {
    if (index) query.append(' UNION ALL ')
    query.append(sql`SELECT ${index}::int AS group_index, to_jsonb(ballot) AS ballot FROM (`)
    query.append(buildElectionVoteRowsByUserQuery(group.config, userId, group.ids))
    query.append(') ballot')
  })
  const { rows } = await read<{
    group_index: number
    ballot: Record<string, unknown> & { created_at: string }
  }>(query)
  return groups.flatMap((group, index) =>
    mapCurrentVotes(
      group.config,
      rows.flatMap(({ group_index, ballot }) =>
        group_index === index ? [{ ...ballot, created_at: new Date(ballot.created_at) }] : [],
      ),
    ),
  )
}
