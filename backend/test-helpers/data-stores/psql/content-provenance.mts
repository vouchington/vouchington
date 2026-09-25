import { randomBytes } from 'node:crypto'
import sql from 'sql-template-strings'
import { read, write } from '@data-stores/psql'
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
  index_definition: string | null
  trigger_definition: string | null
}

export async function readContentProvenanceCatalog(
  tables: readonly string[],
): Promise<ContentProvenanceCatalogRow[]> {
  const { rows } = await read<ContentProvenanceCatalogRow>(sql`/* readContentProvenanceCatalog */
    SELECT
      table_class.relname AS table_name,
      format_type(channel_column.atttypid, channel_column.atttypmod) AS created_via_type,
      format_type(client_column.atttypid, client_column.atttypmod) AS oauth_client_id_type,
      (
        SELECT pg_get_constraintdef(fk.oid) FROM pg_constraint fk
        WHERE fk.conrelid = table_class.oid AND fk.contype = 'f' AND fk.conkey = ARRAY[client_column.attnum]
      ) AS foreign_key,
      (
        SELECT pg_get_constraintdef(chk.oid) FROM pg_constraint chk
        WHERE chk.conrelid = table_class.oid AND chk.contype = 'c' AND chk.conkey @> ARRAY[client_column.attnum]
      ) AS check_constraint,
      (
        SELECT pg_get_indexdef(idx.indexrelid) FROM pg_index idx
        WHERE idx.indrelid = table_class.oid AND idx.indkey[0] = client_column.attnum
      ) AS index_definition,
      (
        SELECT pg_get_triggerdef(trg.oid) FROM pg_trigger trg
        WHERE trg.tgrelid = table_class.oid
          AND trg.tgfoid = 'fn_prevent_content_provenance_update'::regproc
          AND NOT trg.tgisinternal
      ) AS trigger_definition
    FROM unnest(${tables}::text[]) AS requested(table_name)
    JOIN pg_class table_class ON table_class.oid = to_regclass(requested.table_name)
    LEFT JOIN pg_attribute channel_column
      ON channel_column.attrelid = table_class.oid AND channel_column.attname = 'created_via'
    LEFT JOIN pg_attribute client_column
      ON client_column.attrelid = table_class.oid AND client_column.attname = 'created_via_oauth_client_id'
    ORDER BY table_class.relname`)
  return rows
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
