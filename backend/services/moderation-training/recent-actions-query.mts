import sql from 'sql-template-strings'
import type { SearchRecentAutomodActionsOptions } from './types.mts'
import {
  agentModerationAutomodBranch,
  communityPromptAutomodBranch,
} from './recent-actions-prompt-branches.mts'
import {
  clearanceRejectionAutomodBranch,
  spamDetectionAutomodBranch,
} from './recent-actions-clearance-branches.mts'

export function buildRecentAutomodActionsQuery(
  communityId: string,
  options: SearchRecentAutomodActionsOptions,
) {
  const windowHours = options.windowHours ?? 48
  const sourceType = options.sourceType ?? null
  const agentSlug = options.agentSlug ?? null
  const maxConfidence = options.maxConfidence ?? null
  return sql`/* searchRecentAutomodActions */
    WITH recent AS (`
    .append(communityPromptAutomodBranch(communityId, windowHours))
    .append(sql`
      UNION ALL`)
    .append(agentModerationAutomodBranch(communityId, windowHours))
    .append(sql`
      UNION ALL`)
    .append(clearanceRejectionAutomodBranch(communityId, windowHours))
    .append(sql`
      UNION ALL`)
    .append(spamDetectionAutomodBranch(communityId, windowHours)).append(sql`
    ),
    filtered AS (
      SELECT *
      FROM recent
      WHERE (${sourceType}::text IS NULL OR source_type = ${sourceType})
        AND (${agentSlug}::text IS NULL OR moderator_slug = ${agentSlug})
        AND (${options.postType ?? null}::text IS NULL OR post_type::text = ${options.postType ?? null})
        AND (${maxConfidence}::double precision IS NULL OR confidence_score IS NULL OR confidence_score <= ${maxConfidence})
    )
    SELECT *
    FROM filtered
  `)
}
