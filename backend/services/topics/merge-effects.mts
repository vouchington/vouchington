import type { TransactionQuery } from '@data-stores/psql'
import { prepublishImageSurfaceDenials } from '@services/media-delivery-safety'
import {
  processTopicMergeAliasEffectsPage,
  processTopicMergeRedirectEffectsPage,
} from './merge-effects-pages.mts'
import {
  processTopicMergeBookmarkBloomPage,
  topicMergeBookmarkRelationTables,
} from './merge-effects-bookmarks.mts'
import { finalizeTopicMergeEffects } from './merge-effects-finalize.mts'

type EffectsCursor = { rowId: string | null; subjectId: string | null; objectId: string | null }
const emptyCursor: EffectsCursor = { rowId: null, subjectId: null, objectId: null }

/** Denials precede the final domain commit; cache and listener effects follow that commit. */
export async function processTopicMergeFinalizeImages(query: TransactionQuery, sourceId: string) {
  await prepublishImageSurfaceDenials(
    [
      { surfaceKind: 'topic-logo-image', topicId: sourceId },
      { surfaceKind: 'topic-hero-image', topicId: sourceId },
    ],
    query,
  )
}

/** One bounded effect page. Advancing a phase always yields to another continuation job. */
export async function processTopicMergeEffectsPage(
  query: TransactionQuery,
  operationId: string,
  sourceId: string,
  destinationId: string,
  mergerId: string,
  phase: number,
  cursor: EffectsCursor,
  limit: number,
): Promise<{ phase: number; cursor: EffectsCursor; hasMore: boolean }> {
  if (!Number.isSafeInteger(limit) || limit < 1)
    throw new RangeError('Invalid merge effects page limit')
  if (phase === 0 || phase === 1) {
    const page =
      phase === 0
        ? await processTopicMergeAliasEffectsPage(query, operationId, cursor.rowId, limit)
        : await processTopicMergeRedirectEffectsPage(query, destinationId, cursor.rowId, limit)
    return page.hasMore
      ? { phase, cursor: { ...emptyCursor, rowId: page.cursorId }, hasMore: true }
      : nextPhase(phase)
  }
  const tablePosition = phase - 2
  if (tablePosition < topicMergeBookmarkRelationTables.length) {
    const page = await processTopicMergeBookmarkBloomPage(
      query,
      destinationId,
      tablePosition,
      cursor.subjectId,
      limit,
    )
    return page.hasMore
      ? { phase, cursor: { ...emptyCursor, subjectId: page.cursorId }, hasMore: true }
      : nextPhase(phase)
  }
  if (tablePosition !== topicMergeBookmarkRelationTables.length)
    throw new RangeError('Invalid topic merge effects phase')
  await finalizeTopicMergeEffects(query, sourceId, destinationId, mergerId)
  return { phase, cursor: emptyCursor, hasMore: false }
}

function nextPhase(phase: number) {
  return { phase: phase + 1, cursor: emptyCursor, hasMore: true }
}
