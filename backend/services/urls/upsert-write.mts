import { write } from '@data-stores/psql'
import type { QueryOptions } from '@data-stores/psql/types'
import type { ViewUrl } from './types.mts'

export type UpsertedUrlRow = ViewUrl & {
  hostname_id: string
  inserted: boolean
  canonical_hostname_id: string | null
}

const hydratedUrlSelect = `
  SELECT
    'url' AS __entity_type,
    upserted.inserted,
    upserted.hostname_id,
    upserted.id,
    upserted.url,
    upserted.pathname,
    upserted.search_params,
    upserted.canonical_url_id,
    CASE
      WHEN upserted.canonical_url_id IS NULL OR upserted.canonical_url_id = upserted.id
        THEN upserted.hostname_id
      ELSE NULL
    END AS canonical_hostname_id,
    (TO_JSONB(view_url_hostnames) - 'publicly_introduced_at')::json AS hostname
  FROM upserted
  JOIN view_url_hostnames ON view_url_hostnames.id = upserted.hostname_id
`

export async function upsertUrlRows(
  values: unknown[],
  contentTypeIds: string[] | null,
  queryOptions: QueryOptions,
): Promise<UpsertedUrlRow[]> {
  if (contentTypeIds === null) {
    const { rows } = await write<UpsertedUrlRow>(
      `/* addUrls */
        WITH upserted AS (
          INSERT INTO urls (url, hostname_id, pathname, search_params, created_by_id)
          SELECT
            input.url,
            input.hostname_id,
            input.pathname,
            input.search_params,
            input.created_by_id
          FROM unnest(
            $1::text[], $2::uuid[], $3::text[], $4::jsonb[], $5::uuid[]
          ) AS input(url, hostname_id, pathname, search_params, created_by_id)
          ORDER BY input.url
          ON CONFLICT (url)
          DO UPDATE
          SET hostname_id = EXCLUDED.hostname_id
          RETURNING id, url, hostname_id, pathname, search_params, canonical_url_id, (xmax = 0) AS inserted
        )
        ${hydratedUrlSelect}
      `,
      values,
      queryOptions,
    )
    return attachDistinctCanonicalHostnames(rows, queryOptions)
  }

  const { rows } = await write<UpsertedUrlRow>(
    `/* addUrls:withContentType */
      WITH upserted AS (
        INSERT INTO urls (
          url,
          hostname_id,
          pathname,
          search_params,
          created_by_id,
          media_type_id
        )
        SELECT
          input.url,
          input.hostname_id,
          input.pathname,
          input.search_params,
          input.created_by_id,
          input.media_type_id
        FROM unnest(
          $1::text[], $2::uuid[], $3::text[], $4::jsonb[], $5::uuid[], $6::bigint[]
        ) AS input(
          url,
          hostname_id,
          pathname,
          search_params,
          created_by_id,
          media_type_id
        )
        ORDER BY input.url
        ON CONFLICT (url)
        DO UPDATE
        SET
          hostname_id = EXCLUDED.hostname_id,
          media_type_id = EXCLUDED.media_type_id
        RETURNING id, url, hostname_id, pathname, search_params, canonical_url_id, (xmax = 0) AS inserted
      )
      ${hydratedUrlSelect}
    `,
    [...values, contentTypeIds],
    queryOptions,
  )
  return attachDistinctCanonicalHostnames(rows, queryOptions)
}

/**
 * The upsert statement's snapshot is taken before its row-lock wait. A canonical target committed
 * during that wait is visible only to a later statement.
 */
async function attachDistinctCanonicalHostnames(
  rows: UpsertedUrlRow[],
  options: QueryOptions,
): Promise<UpsertedUrlRow[]> {
  const canonicalIds = [
    ...new Set(
      rows.flatMap(row =>
        row.canonical_url_id && row.canonical_url_id !== row.id ? [row.canonical_url_id] : [],
      ),
    ),
  ]
  if (canonicalIds.length === 0) return rows
  const { rows: canonicals } = await write<{ id: string; hostname_id: string }>(
    `/* addUrls.canonicalHostnames */
      SELECT id, hostname_id
      FROM urls
      WHERE id = ANY($1::uuid[])
    `,
    [canonicalIds],
    options,
  )
  const hostnameById = new Map(canonicals.map(row => [row.id, row.hostname_id]))
  return rows.map(row => {
    if (!row.canonical_url_id || row.canonical_url_id === row.id) return row
    const hostnameId = hostnameById.get(row.canonical_url_id)
    return hostnameId ? { ...row, canonical_hostname_id: hostnameId } : row
  })
}
