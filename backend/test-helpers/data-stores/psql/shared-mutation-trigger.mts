import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { beginTransaction } from '@data-stores/psql'
import type { TransactionQuery } from '@data-stores/psql/types'
import { sha256 } from '@modules/utils'

export type SharedMutationProbe =
  | 'eraseActor'
  | 'replaceActor'
  | 'rewriteFact'
  | 'eraseAndRewrite'
  | 'deleteDirectly'
  | 'deleteParent'
  | 'unchanged'

type ProbeResult = { count: number; actorErased: boolean; fact: string | null }

/** Exercise installed canonical guards with transaction-owned rows, then roll everything back. */
export async function probeSharedMutationTrigger(
  probe: SharedMutationProbe,
  allowActorErasure = true,
): Promise<ProbeResult> {
  const query = await beginTransaction()
  const [result] = await Promise.allSettled([runCanonicalProbe(query, probe, allowActorErasure)])
  const [cleanup] = await Promise.allSettled([Promise.resolve().then(() => query.rollback())])
  if (result.status === 'rejected') {
    if (cleanup.status === 'rejected' && !Object.is(result.reason, cleanup.reason))
      throw new AggregateError(
        [result.reason, cleanup.reason],
        'Mutation probe and rollback failed',
      )
    throw result.reason
  }
  if (cleanup.status === 'rejected') throw cleanup.reason
  return result.value
}

async function runCanonicalProbe(
  query: TransactionQuery,
  probe: SharedMutationProbe,
  allowActorErasure: boolean,
): Promise<ProbeResult> {
  const { rows: actors } = await query<{ id: string }>(
    '/* createSharedGuardProbeActor */ INSERT INTO users DEFAULT VALUES RETURNING id',
  )
  const actorId = actors[0]?.id
  assert(actorId)
  if (!allowActorErasure) return runZeroArgumentProbe(query, probe, actorId)

  const title = 'Shared mutation guard probe'
  // Canonical title-only content payloads: no markdown, summary, images, or structured data.
  const embeddingContentSha = sha256(title)
  const moderationContentSha = sha256([title, '', '', '', ''].join('\n'))
  const { rows: posts } = await query<{ id: string }>(
    `/* createSharedGuardProbeParent */ INSERT INTO posts (
      post_type, title, created_via, bedrock_nova_multimodal_v1_content_sha256,
      llm_moderation_content_sha256
    ) VALUES ('discussion', $1, 'system', $2, $3) RETURNING id`,
    [title, embeddingContentSha, moderationContentSha],
  )
  const postId = posts[0]?.id
  assert(postId)
  const { rows: revisions } = await query<{ id: string }>(
    `/* createSharedGuardProbeRevision */
      INSERT INTO post_revisions (post_id, revision_type, revised_by_id, changes)
      VALUES ($1, 'update', $2, '{"title":{"before":null,"after":"original"}}'::jsonb)
      RETURNING id`,
    [postId, actorId],
  )
  const revisionId = revisions[0]?.id
  assert(revisionId)
  switch (probe) {
    case 'eraseActor':
      await query('/* eraseSharedGuardProbeActor */ DELETE FROM users WHERE id = $1', [actorId])
      break
    case 'replaceActor': {
      const { rows } = await query<{ id: string }>(
        '/* createSharedGuardProbeReplacementActor */ INSERT INTO users DEFAULT VALUES RETURNING id',
      )
      assert(rows[0]?.id)
      await query(
        '/* replaceSharedGuardProbeActor */ UPDATE post_revisions SET revised_by_id = $2 WHERE id = $1',
        [revisionId, rows[0].id],
      )
      break
    }
    case 'rewriteFact':
      await query(
        `/* rewriteSharedGuardProbeFact */ UPDATE post_revisions
          SET changes = '{"title":{"before":null,"after":"changed"}}'::jsonb WHERE id = $1`,
        [revisionId],
      )
      break
    case 'eraseAndRewrite':
      await query(
        `/* eraseAndRewriteSharedGuardProbe */ UPDATE post_revisions SET revised_by_id = NULL,
          changes = '{"title":{"before":null,"after":"changed"}}'::jsonb WHERE id = $1`,
        [revisionId],
      )
      break
    case 'deleteDirectly':
      await query('/* deleteSharedGuardProbeDirectly */ DELETE FROM post_revisions WHERE id = $1', [
        revisionId,
      ])
      break
    case 'deleteParent':
      await query('/* cascadeSharedGuardProbe */ DELETE FROM posts WHERE id = $1', [postId])
      break
    case 'unchanged':
      await query(
        '/* leaveSharedGuardProbeUnchanged */ UPDATE post_revisions SET changes = changes WHERE id = $1',
        [revisionId],
      )
      break
  }
  const { rows } = await query<ProbeResult>(
    `/* readSharedGuardProbe */ SELECT count(*)::integer AS count,
      COALESCE(bool_and(revised_by_id IS NULL), false) AS "actorErased",
      min(changes->'title'->>'after') AS fact FROM post_revisions WHERE id = $1 AND post_id = $2`,
    [revisionId, postId],
  )
  assert(rows[0])
  return rows[0]
}

async function runZeroArgumentProbe(
  query: TransactionQuery,
  probe: SharedMutationProbe,
  actorId: string,
): Promise<ProbeResult> {
  assert(['unchanged', 'rewriteFact', 'eraseActor'].includes(probe))
  const { rows: approvals } = await query<{ id: string }>(
    `/* createSharedGuardZeroArgumentProbe */
      INSERT INTO copyright_jurisdiction_policy_approvals (jurisdiction, policy_version, approved_by_id)
      VALUES ('uk', $1, $2) RETURNING id`,
    [`guard-${randomUUID()}`, actorId],
  )
  const approvalId = approvals[0]?.id
  assert(approvalId)
  if (probe === 'eraseActor') {
    await query('/* eraseSharedGuardZeroArgumentActor */ DELETE FROM users WHERE id = $1', [
      actorId,
    ])
  } else {
    await query(
      probe === 'unchanged'
        ? '/* leaveSharedGuardZeroArgumentUnchanged */ UPDATE copyright_jurisdiction_policy_approvals SET policy_version = policy_version WHERE id = $1'
        : '/* rewriteSharedGuardZeroArgumentFact */ UPDATE copyright_jurisdiction_policy_approvals SET policy_version = $2 WHERE id = $1',
      probe === 'unchanged' ? [approvalId] : [approvalId, `changed-${randomUUID()}`],
    )
  }
  const { rows } = await query<ProbeResult>(
    `/* readSharedGuardZeroArgumentProbe */ SELECT count(*)::integer AS count,
      COALESCE(bool_and(approved_by_id IS NULL), false) AS "actorErased",
      min(policy_version) AS fact FROM copyright_jurisdiction_policy_approvals WHERE id = $1`,
    [approvalId],
  )
  assert(rows[0])
  return rows[0]
}
