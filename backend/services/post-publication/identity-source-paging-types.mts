import type { PublicationSnapshotKey } from './identity-source.mts'

export type SourceRow = Omit<PublicationSnapshotKey, 'kind'> & {
  cursor: string
  kind: PublicationSnapshotKey['kind'] | null
}
