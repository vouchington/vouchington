import { beginTransaction } from '@data-stores/psql'
import type { TransactionQuery } from '@data-stores/psql/types'
import { getEntityRelationMetadataOrThrow } from '@services/entity-relations/metadata'
import { assertPostRelatedUrlsAllowed } from '@services/entity-relations/assert-post-related-urls-allowed'
import { recordPostRelatedUrlPublicationChanges } from '@services/entity-relations/post-topic-publication'
import { getRelationLimitState } from '@services/entity-relations/relation-limits'
import { handleElectionVotes, type EntityRelation } from '@services/entity-relations/upsert-helpers'
import { insertPrevalidatedPostRelatedUrlEntityRelationsInTransaction } from '@services/entity-relations/write-relations'
import '@services/elections-votes/entity-relation/register-election-vote-handler'
import '@services/posts/register-post-related-urls-guard'
import { blockedUrlsFromWebRiskScreen } from '@services/web-risk/check'
import {
  admittedUrlIds,
  dispatchPendingCrawls,
  markProjectionWrite,
  markRelationReceiptsWritten,
  publishAdmissionEffects,
  requireStoryTeller,
  uniqueUrlIds,
  uniqueUrls,
} from './story-post-related-url-projection-admission-effects.mts'
import { markStoryPostRelatedUrlProjectionInvalidationRequired } from './story-post-related-url-projection-invalidation.mts'
import { pruneStoryPostRelatedUrlsOutsidePrefix } from './story-post-related-url-projection-prune.mts'
import {
  lockPostScopeAndCheckProjectionWork,
  lockStoryPostRelatedUrlProjectionHostnameBlocks,
  readStoryPostRelatedUrlProjectionActiveRelations,
  recordProjectionCrawlRequirements,
} from './story-post-related-url-projection-relation-safety.mts'
import {
  decideStoryPostRelatedUrlProjectionRows,
  getStoryPostRelatedUrlProjectionSourcePageForWork,
  stageStoryPostRelatedUrlProjectionReceipts,
} from './story-post-related-url-projection-source.mts'
import type { ProjectionWork, SourceRow } from './story-post-related-url-projection-types.mts'

type StoryTeller = Awaited<ReturnType<typeof requireStoryTeller>>

export async function admitStoryPostRelatedUrlProjectionPrefix(
  work: ProjectionWork,
  rows?: readonly SourceRow[],
): Promise<{ ok: boolean; processed: number }> {
  const [storyTeller, sourceRows] = await Promise.all([
    requireStoryTeller(),
    rows === undefined
      ? getStoryPostRelatedUrlProjectionSourcePageForWork(work)
      : Promise.resolve(rows),
  ])
  const webRiskBlockedUrls = await blockedUrlsFromWebRiskScreen(uniqueUrls(sourceRows))
  await using transaction = await beginTransaction()
  await markProjectionWrite(transaction)
  const admitted = await admitPreparedRows(
    transaction,
    work,
    sourceRows,
    storyTeller,
    webRiskBlockedUrls,
  )
  if (!admitted.ok) return { ok: false, processed: 0 }
  await transaction.commit()
  await publishAdmissionEffects(admitted)
  const dispatched = await dispatchPendingCrawls(work)
  return { ok: dispatched, processed: sourceRows.length }
}

type PreparedAdmission = {
  ok: true
  relation: ReturnType<typeof getEntityRelationMetadataOrThrow>
  internalRelations: EntityRelation[]
}

async function admitPreparedRows(
  transaction: TransactionQuery,
  work: ProjectionWork,
  rows: readonly SourceRow[],
  storyTeller: StoryTeller,
  webRiskBlockedUrls: ReadonlySet<string>,
): Promise<PreparedAdmission | { ok: false }> {
  const urlIds = uniqueUrlIds(rows)
  await lockStoryPostRelatedUrlProjectionHostnameBlocks(transaction, urlIds)
  const decisions = await decideStoryPostRelatedUrlProjectionRows(
    work,
    rows,
    { query: transaction },
    webRiskBlockedUrls,
  )
  if (!(await lockPostScopeAndCheckProjectionWork(transaction, work))) return { ok: false }
  if (!(await stageStoryPostRelatedUrlProjectionReceipts(work, decisions, transaction)))
    return { ok: false }
  const eligibleUrlIds = admittedUrlIds(decisions)
  await pruneStoryPostRelatedUrlsOutsidePrefix(transaction, work, storyTeller.id, eligibleUrlIds)
  const relation = getEntityRelationMetadataOrThrow({
    subjectType: 'post',
    objectType: 'url',
    predicate: 'related',
  })
  const limit = await getRelationLimitState(relation, work.post_id, eligibleUrlIds, {
    query: transaction,
  })
  const existing = new Set((limit?.existingObjectIds ?? []).map(id => id.toLowerCase()))
  const freshUrlIds: string[] = []
  for (const urlId of eligibleUrlIds) {
    if (!existing.has(urlId.toLowerCase())) freshUrlIds.push(urlId)
  }
  const remaining = limit?.remaining ?? freshUrlIds.length
  const urlsToInsert = freshUrlIds.slice(0, remaining)
  const creator = {
    __entity_type: 'user' as const,
    id: storyTeller.id,
    username: storyTeller.username,
    roles: [],
    use_display_name_from: storyTeller.use_display_name_from,
  } as never
  const ineligibleUrlIds = new Set<string>()
  for (const decision of decisions) {
    if (!decision.is_eligible) ineligibleUrlIds.add(decision.url_id)
  }
  let internalRelations: EntityRelation[] = []
  if (urlsToInsert.length > 0) {
    await assertPostRelatedUrlsAllowed(
      creator,
      relation,
      { id: work.post_id },
      urlsToInsert.map(id => ({ id })),
      { query: transaction },
    )
    internalRelations = await insertPrevalidatedPostRelatedUrlEntityRelationsInTransaction(
      transaction,
      creator,
      work.post_id,
      urlsToInsert,
    )
    const newlyActiveSubjectIds: string[] = []
    for (const row of internalRelations) {
      if (row.newly_active !== false) newlyActiveSubjectIds.push(row.subject_id)
    }
    await handleElectionVotes(creator, relation, internalRelations, { query: transaction })
    await recordPostRelatedUrlPublicationChanges(transaction, newlyActiveSubjectIds)
    if (newlyActiveSubjectIds.length > 0)
      await markStoryPostRelatedUrlProjectionInvalidationRequired(transaction, work)
  }
  const alreadyActive: EntityRelation[] = []
  for (const urlId of eligibleUrlIds) {
    if (!existing.has(urlId.toLowerCase())) continue
    alreadyActive.push({
      subject_id: work.post_id,
      object_id: urlId,
      created_at: new Date(0),
      created_by_id: storyTeller.id,
      newly_active: false,
    })
  }
  if (alreadyActive.length > 0) {
    const activeUrlIds = alreadyActive.map(row => row.object_id)
    const activeRelations = await readStoryPostRelatedUrlProjectionActiveRelations(
      transaction,
      work.post_id,
      storyTeller.id,
      activeUrlIds,
    )
    const voteRelations: EntityRelation[] = []
    for (const row of activeRelations) {
      voteRelations.push({
        id: row.id,
        subject_id: work.post_id,
        object_id: row.object_id,
        created_at: new Date(0),
        created_by_id: storyTeller.id,
        newly_active: false,
      })
    }
    await handleElectionVotes(creator, relation, voteRelations, { query: transaction })
  }
  await recordProjectionCrawlRequirements(
    transaction,
    work,
    [...internalRelations, ...alreadyActive],
    ineligibleUrlIds,
  )
  if (!(await markRelationReceiptsWritten(transaction, work, decisions))) return { ok: false }
  return { ok: true, relation, internalRelations }
}
