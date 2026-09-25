import { randomBytes } from 'node:crypto'
import sql from 'sql-template-strings'
import { read, write } from '@data-stores/psql'
import type { QueryOptions } from '@data-stores/psql/types'
import { createTestPost } from '../../entities/create-test-entities.mts'
import { createTestUser } from '../../entities/users.mts'

export type ContentProvenance = {
  createdVia: 'web' | 'swift' | 'dotnet' | 'api' | 'mcp' | 'system' | null
  oauthClientId: string | null
}

export type ContentProvenanceCatalogRow = {
  table_name: string
  created_via_type: string | null
  oauth_client_id_type: string | null
  foreign_key: string | null
  check_constraint: string | null
  constraints_validated: boolean | null
  index_definition: string | null
  index_valid: boolean | null
  trigger_definition: string | null
}

// Each object is looked up by the name its migration gives it, so a later index or CHECK on the
// same column can't make a lookup ambiguous.
export async function readContentProvenanceCatalog(
  tables: readonly string[],
): Promise<ContentProvenanceCatalogRow[]> {
  const { rows } = await read<ContentProvenanceCatalogRow>(sql`/* readContentProvenanceCatalog */
    SELECT
      table_class.relname AS table_name,
      format_type(channel_column.atttypid, channel_column.atttypmod) AS created_via_type,
      format_type(client_column.atttypid, client_column.atttypmod) AS oauth_client_id_type,
      pg_get_constraintdef(fk.oid) AS foreign_key,
      pg_get_constraintdef(chk.oid) AS check_constraint,
      fk.convalidated AND chk.convalidated AS constraints_validated,
      pg_get_indexdef(idx.indexrelid) AS index_definition,
      idx.indisvalid AS index_valid,
      pg_get_triggerdef(trg.oid) AS trigger_definition
    FROM unnest(${tables}::text[]) AS requested(table_name)
    JOIN pg_class table_class ON table_class.oid = to_regclass(requested.table_name)
    LEFT JOIN pg_attribute channel_column
      ON channel_column.attrelid = table_class.oid AND channel_column.attname = 'created_via'
    LEFT JOIN pg_attribute client_column
      ON client_column.attrelid = table_class.oid AND client_column.attname = 'created_via_oauth_client_id'
    LEFT JOIN pg_constraint fk
      ON fk.conrelid = table_class.oid AND fk.conname = table_class.relname || '_created_via_oauth_client_id_fkey'
    LEFT JOIN pg_constraint chk
      ON chk.conrelid = table_class.oid AND chk.conname = table_class.relname || '_created_via_oauth_client_id_check'
    LEFT JOIN pg_index idx
      ON idx.indexrelid = to_regclass('idx_' || table_class.relname || '__created_via_oauth_client_id')
    LEFT JOIN pg_trigger trg
      ON trg.tgrelid = table_class.oid AND trg.tgname = table_class.relname || '_content_provenance_immutable'
    ORDER BY table_class.relname`)
  return rows
}

export async function readContentCreationChannels(): Promise<string[]> {
  const { rows } = await read<{ channels: string[] }>(sql`/* readContentCreationChannels */
    SELECT enum_range(NULL::content_creation_channels)::text[] AS channels`)
  return rows[0]!.channels
}

// Raw fixture post (no provenance), so the partitioned posts table's cloned trigger, CHECK and FK
// are exercised on a real partition row.
export async function createContentProvenancePostFixture() {
  const post = await createTestPost()
  return {
    postId: post.id,
    updateProvenance: (provenance: ContentProvenance) =>
      write(sql`/* updateContentProvenancePost */
        UPDATE posts
        SET created_via = ${provenance.createdVia}, created_via_oauth_client_id = ${provenance.oauthClientId}
        WHERE id = ${post.id}`),
  }
}

export type ContentProvenanceListFixture = {
  oauthClientId: string
  insertList(provenance: ContentProvenance): Promise<string>
  updateProvenance(listId: string, provenance: ContentProvenance): ReturnType<typeof write>
  keepProvenance(listId: string): ReturnType<typeof write>
  renameList(listId: string): ReturnType<typeof write>
  deleteOAuthClient(): ReturnType<typeof write>
}

export type OAuthClientLabelColumns = {
  metadataUrl?: string | null
  verifiedAt?: Date | null
  verifiedById?: string | null
}

export async function insertContentProvenanceOAuthClient(
  columns: OAuthClientLabelColumns = {},
): Promise<string> {
  const { rows } = await write<{ id: string }>(sql`/* insertContentProvenanceOAuthClient */
    INSERT INTO oauth_clients (
      client_id, client_name, client_type, token_endpoint_auth_method, redirect_uris, grant_types,
      response_types, scopes, metadata_url, verified_at, verified_by_id
    )
    VALUES (
      ${`voucha_${randomBytes(24).toString('base64url')}`}, 'Content provenance test client', 'public', 'none',
      ARRAY['https://agent.example/callback'], ARRAY['authorization_code', 'refresh_token'], ARRAY['code'], ARRAY['mcp:read'],
      ${columns.metadataUrl ?? null}, ${columns.verifiedAt ?? null}, ${columns.verifiedById ?? null}
    )
    RETURNING id`)
  return rows[0]!.id
}

export async function readViewsReferencingContentProvenance(
  options: QueryOptions = {},
): Promise<string[]> {
  const { rows } = await read<{ view_name: string }>(
    sql`/* readViewsReferencingContentProvenance */
      SELECT view_class.relname AS view_name
      FROM pg_class view_class
      WHERE view_class.relkind IN ('v', 'm')
        AND view_class.relnamespace = current_schema()::regnamespace
        AND strpos(pg_get_viewdef(view_class.oid), 'created_via') > 0
      ORDER BY view_class.relname`,
    options,
  )
  return rows.map(row => row.view_name)
}

export async function readConstraintDefinition(name: string): Promise<string | null> {
  const { rows } = await read<{ definition: string }>(sql`/* readContentProvenanceConstraint */
    SELECT pg_get_constraintdef(oid) AS definition FROM pg_constraint WHERE conname = ${name}`)
  return rows[0]?.definition ?? null
}

export async function createContentProvenanceListFixture(): Promise<ContentProvenanceListFixture> {
  const owner = await createTestUser()
  const oauthClientId = await insertContentProvenanceOAuthClient()

  return {
    oauthClientId,
    async insertList(provenance) {
      const result = await write<{ id: string }>(sql`/* insertContentProvenanceList */
        INSERT INTO lists (owner_user_id, name, created_via, created_via_oauth_client_id)
        VALUES (${owner.id}, 'Provenance list', ${provenance.createdVia}, ${provenance.oauthClientId})
        RETURNING id`)
      return result.rows[0]!.id
    },
    updateProvenance: (listId, provenance) =>
      write(sql`/* updateContentProvenanceList */
        UPDATE lists
        SET created_via = ${provenance.createdVia}, created_via_oauth_client_id = ${provenance.oauthClientId}
        WHERE id = ${listId}`),
    keepProvenance: listId =>
      write(sql`/* keepContentProvenanceList */
        UPDATE lists
        SET created_via = created_via, created_via_oauth_client_id = created_via_oauth_client_id
        WHERE id = ${listId}`),
    renameList: listId =>
      write(sql`/* renameContentProvenanceList */
        UPDATE lists SET name = 'Renamed provenance list' WHERE id = ${listId}`),
    deleteOAuthClient: () =>
      write(sql`/* deleteContentProvenanceOAuthClient */
        DELETE FROM oauth_clients WHERE id = ${oauthClientId}`),
  }
}
