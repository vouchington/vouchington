import type { TransactionQuery } from '@data-stores/psql/types'
import sql from 'sql-template-strings'
import type {
  ImageSurfaceMutation,
  ImageSurfaceMutationWrite,
} from '../services/media-delivery-safety/surface-mutation.mts'
import { retireTestPairedImageOwners } from './image-paired-owner-retirement.mts'

export async function retireTestTopicImageOwners(
  references: readonly ImageSurfaceMutation[],
  query: TransactionQuery,
  setClause: ReturnType<typeof sql>,
  annotation = 'retireTestTopicImageOwners',
): Promise<ImageSurfaceMutationWrite<void>> {
  return retireTestPairedImageOwners(references, query, setClause, {
    annotation,
    table: 'topics',
    ownerIdColumn: 'topic_id',
    surfaces: [
      { surfaceKind: 'topic-logo-image', imageColumn: 'logo_image_id' },
      { surfaceKind: 'topic-hero-image', imageColumn: 'hero_image_id' },
    ],
    requireUnmerged: true,
    ownerIdOf: reference => ('topicId' in reference ? reference.topicId : ''),
    changedError: 'Test topic image owner changed',
  })
}
