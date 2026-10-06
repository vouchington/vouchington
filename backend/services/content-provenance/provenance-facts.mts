import type { ContentCreationChannel } from '@voucha/types/entities/content-provenance'
import type { ProvenanceClient } from './resolve-public-provenance-label.mts'

/** What the label rules need about one created row: its channel and the OAuth client behind it. */
export type ProvenanceFacts = {
  created_via: ContentCreationChannel
  client: ProvenanceClient | null
}

/** One row of a provenance facts query: the created row's id, its channel and its joined client. */
export type ProvenanceFactsRow = {
  id: string
  created_via: ContentCreationChannel
  client_id: string | null
  client_name: string | null
  metadata_url: string | null
  verified_at: Date | null
}

/** Keys the facts rows by the id of the row they describe. */
export function mapProvenanceFacts(rows: ProvenanceFactsRow[]): Map<string, ProvenanceFacts> {
  return new Map(
    rows.map(row => [
      row.id,
      {
        created_via: row.created_via,
        client:
          row.client_id === null
            ? null
            : {
                client_id: row.client_id,
                client_name: row.client_name!,
                metadata_url: row.metadata_url,
                verified_at: row.verified_at,
              },
      },
    ]),
  )
}
