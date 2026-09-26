import { read } from '@data-stores/psql'
import sql, { type SQLStatement } from 'sql-template-strings'
import type {
  ContentCreationChannel,
  ContentProvenance,
} from '@voucha/types/entities/content-provenance'

// Service tests write as a signed-in web client unless the channel itself is under test.
export const WEB_PROVENANCE: ContentProvenance = Object.freeze({
  createdVia: 'web',
  oauthClientId: null,
})

const CONTENT_PROVENANCE_TABLES = {
  communities: () => sql`communities`,
  community_applications: () => sql`community_applications`,
  lists: () => sql`lists`,
  moderation_appeals: () => sql`moderation_appeals`,
  moderation_reports: () => sql`moderation_reports`,
  posts: () => sql`posts`,
  rss_feeds: () => sql`rss_feeds`,
  topics: () => sql`topics`,
  user_referral_program_links: () => sql`user_referral_program_links`,
} satisfies Record<string, () => SQLStatement>

export type ContentProvenanceTable = keyof typeof CONTENT_PROVENANCE_TABLES

export type StoredContentProvenance = {
  createdVia: ContentCreationChannel | null
  oauthClientId: string | null
}

export async function readTestContentProvenance(
  table: ContentProvenanceTable,
  id: string,
): Promise<StoredContentProvenance | undefined> {
  const query = sql`/* readTestContentProvenance */
    SELECT created_via AS "createdVia", created_via_oauth_client_id AS "oauthClientId"
    FROM `
  query.append(CONTENT_PROVENANCE_TABLES[table]())
  query.append(sql` WHERE id = ${id}`)
  const { rows } = await read<StoredContentProvenance>(query)
  return rows[0]
}
