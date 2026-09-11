import sql, { type SQLStatement } from 'sql-template-strings'
import { entityRelationMetadatum } from './metadata.mts'

// Throws plain Error (not HttpError) for internal callers — non-API callers get an
// uncaught error if they pass a vote-score filter for a non-election relation.
export function buildVoteScoreFilters(
  metadata: (typeof entityRelationMetadatum)[number],
  options: { minNetVoteScore?: number; positiveNetVoteScore?: boolean },
): SQLStatement[] {
  const filters: SQLStatement[] = []
  if (options.minNetVoteScore !== undefined) {
    if (!metadata.election) {
      throw new Error(
        `minNetVoteScore requires an election-enabled relation, but ${metadata.subject_type} -> ${metadata.predicate} -> ${metadata.object_type} has no election`,
      )
    }
    filters.push(sql`r.votes_score_net >= ${options.minNetVoteScore}`)
  }
  if (options.positiveNetVoteScore === true) {
    if (!metadata.election) {
      throw new Error(
        `positiveNetVoteScore requires an election-enabled relation, but ${metadata.subject_type} -> ${metadata.predicate} -> ${metadata.object_type} has no election`,
      )
    }
    // Redundant when minNetVoteScore >= 0 is already enforced
    if (options.minNetVoteScore === undefined || options.minNetVoteScore <= 0) {
      filters.push(sql`r.votes_score_net > 0`)
    }
  }
  return filters
}
