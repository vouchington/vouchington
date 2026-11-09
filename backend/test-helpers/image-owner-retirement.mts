import type { TransactionQuery } from '@data-stores/psql/types'
import {
  writeImageSurfaceMutation,
  type ImageSurfaceMutation,
} from '../services/media-delivery-safety/surface-mutation.mts'

type Owner = { topicId: string } | { communityId: string } | { userId: string }

/** Keep fixture owner writes, concrete retirement, capacity release, and edge denial atomic. */
export function writeTestImageOwnerRetirement<Result>(
  query: TransactionQuery,
  owner: Owner | readonly Owner[],
  writeOwner: (query: TransactionQuery) => Promise<Result>,
): Promise<Result> {
  const owners = 'topicId' in owner || 'communityId' in owner || 'userId' in owner ? [owner] : owner
  const references: ImageSurfaceMutation[] = owners.flatMap(
    (entry: Owner): ImageSurfaceMutation[] =>
      'topicId' in entry
        ? [
            { ...entry, surfaceKind: 'topic-logo-image', nextImageId: null },
            { ...entry, surfaceKind: 'topic-hero-image', nextImageId: null },
          ]
        : 'communityId' in entry
          ? [
              { ...entry, surfaceKind: 'community-profile-image', nextImageId: null },
              { ...entry, surfaceKind: 'community-banner-image', nextImageId: null },
            ]
          : [{ ...entry, surfaceKind: 'user-profile-image', nextImageId: null }],
  )
  return writeImageSurfaceMutation(query, references, null, (_before, scopeQuery) =>
    writeOwner(scopeQuery),
  )
}
