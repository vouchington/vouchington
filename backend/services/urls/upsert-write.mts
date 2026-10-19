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
      ELSE canonical.hostname_id
    END AS canonical_hostname_id,
    (TO_JSONB(view_url_hostnames) - 'publicly_introduced_at')::json AS hostname
  FROM upserted
  JOIN view_url_hostnames ON view_url_hostnames.id = upserted.hostname_id
  LEFT JOIN urls canonical
    ON canonical.id = upserted.canonical_url_id
   AND canonical.id <> upserted.id
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
    return rows
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
  return rows
}
