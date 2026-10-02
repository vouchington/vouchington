import { write, type OwnedTransaction } from '@data-stores/psql'
import type { ClassifierRunLease, ClassifierRunOutcomes } from '@services/classifier-runs'
import { unpublishPostForAutomodFlag } from '@services/communities/publications/agent-moderate'
import { flagPostForAutomodReview } from '@services/communities/publications/automod-flag'
import type { CommunityAutomodAction } from '@voucha/types'
import sql from 'sql-template-strings'
import { isCommunityPromptFlagged } from './community-prompt-flagged.mts'
import type { CommunityModerationRunConfiguration } from './moderation-run-configuration.mts'

export type CommunityModerationEffects = {
  flaggedPromptIds: readonly string[]
  /** The community action this run applied to the post; null when nothing was flagged or acted on. */
  appliedAction: Exclude<CommunityAutomodAction, 'record_only'> | null
}

type PromptResult = { promptId: string; flagged: boolean; probability: number; upper: number }

/**
 * Applies the durable community moderation decision in the completion transaction: the per-prompt
 * `agent_moderations` projection first, then the community's `automod_action` for the prompts that
 * flagged the post. The action is read here, not pinned in the run, so changing it never re-bills
 * a classification. A completed run is replayed, never re-applied, so a post a moderator restored
 * is not acted on again until its content changes.
 */
export async function applyCommunityModerationEffects(
  query: OwnedTransaction,
  lease: ClassifierRunLease<CommunityModerationRunConfiguration>,
  outcomes: ClassifierRunOutcomes<never>,
): Promise<CommunityModerationEffects> {
  const { postId } = lease.subject
  if (postId === null) throw new Error('community moderation run subject must be a post')
  const results = readPromptResults(outcomes)
  await recordAgentModerations(query, { postId, inputSha256: lease.inputSha256, results })
  const flaggedPromptIds = results.flatMap(result => (result.flagged ? [result.promptId] : []))
  if (flaggedPromptIds.length === 0) return { flaggedPromptIds, appliedAction: null }
  const { communityId, actorId } = lease.resolved.configuration
  const action = await readCommunityAutomodAction(query, communityId)
  const input = { communityId, postId, contentSha256: lease.inputSha256 }
  if (action === 'review_queue') {
    const flagged = await flagPostForAutomodReview(query, input)
    return { flaggedPromptIds, appliedAction: flagged ? 'review_queue' : null }
  }
  if (action === 'unpublish') {
    const removal = await unpublishPostForAutomodFlag(query, {
      ...input,
      moderationSystemUserId: actorId,
    })
    return { flaggedPromptIds, appliedAction: removal === 'removed' ? 'unpublish' : null }
  }
  return { flaggedPromptIds, appliedAction: null }
}

function readPromptResults(outcomes: ClassifierRunOutcomes<never>): PromptResult[] {
  const results: PromptResult[] = []
  for (const result of outcomes.remoteDecision?.results ?? []) {
    if (result.candidateKind !== 'community_prompt') {
      throw new Error('community moderation decision must hold only community prompt results')
    }
    results.push({
      promptId: result.communityPromptId,
      flagged: isCommunityPromptFlagged(result.probability, result.effectiveThresholds),
      probability: result.probability,
      upper: result.effectiveThresholds.upper,
    })
  }
  return results
}

/**
 * One projection row per prompt asked, keyed by the post, its content digest and the prompt, so a
 * replay or a concurrent writer never duplicates or overwrites one. The row carries the model's
 * probability against the threshold it was judged by; the single-call classifier gives no reason.
 */
async function recordAgentModerations(
  query: OwnedTransaction,
  input: { postId: string; inputSha256: Buffer; results: readonly PromptResult[] },
): Promise<void> {
  if (input.results.length === 0) return
  const rows = input.results.map(result => ({
    prompt_id: result.promptId,
    flagged: result.flagged,
    results: {
      flagged: result.flagged,
      reason: '',
      confidence_score: result.probability,
      confidence_threshold: result.upper,
    },
  }))
  await write(
    sql`/* recordCommunityModerationResults */
    WITH moderated AS (
      SELECT ${input.postId}::uuid AS post_id, ${input.inputSha256}::bytea AS input_sha256
    )
    INSERT INTO agent_moderations (post_id, input_sha256, prompt_id, agent_id, results, flagged)
    SELECT moderated.post_id, moderated.input_sha256, projected.prompt_id, prompt.agent_id,
      projected.results, projected.flagged
    FROM moderated
    CROSS JOIN jsonb_to_recordset(${JSON.stringify(rows)}::jsonb)
      AS projected(prompt_id uuid, flagged boolean, results jsonb)
    JOIN agent_prompts prompt ON prompt.id = projected.prompt_id
    ORDER BY moderated.post_id ASC NULLS LAST, moderated.input_sha256 ASC NULLS LAST,
      projected.prompt_id ASC NULLS LAST
    ON CONFLICT (post_id, input_sha256, prompt_id) DO NOTHING
    `,
    { query },
  )
}

async function readCommunityAutomodAction(
  query: OwnedTransaction,
  communityId: string,
): Promise<CommunityAutomodAction> {
  const { rows } = await query<{ automod_action: CommunityAutomodAction }>(sql`
    /* readCommunityAutomodAction */
    SELECT automod_action FROM communities WHERE id = ${communityId}
  `)
  return rows[0]?.automod_action ?? 'record_only'
}
