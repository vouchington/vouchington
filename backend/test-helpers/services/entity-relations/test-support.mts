import { beginTransaction } from '@data-stores/psql'
import { recordPostTopicRelationPublicationChanges } from '../../../services/entity-relations/post-topic-publication.mts'

export async function recordTestPostTopicRelationPublicationChanges(
  relationTable: string,
  changes: ReadonlyArray<{ subject_id: string; object_id: string }>,
): Promise<void> {
  await using query = await beginTransaction()
  await recordPostTopicRelationPublicationChanges(query, relationTable, changes)
  await query.commit()
}
