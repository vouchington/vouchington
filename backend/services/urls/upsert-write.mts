import { write } from '@data-stores/psql'
import type { QueryOptions } from '@data-stores/psql/types'

type UpsertedUrlRow = {
  hostname_id: string
  id: string
  inserted: boolean
  url: string
}

export async function upsertUrlRows(
  values: unknown[],
  contentTypeIds: string[] | null,
  queryOptions: QueryOptions,
): Promise<UpsertedUrlRow[]> {
  if (contentTypeIds === null) {
    const { rows } = await write<UpsertedUrlRow>(
      `/* addUrls */
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
        RETURNING id, url, hostname_id, (xmax = 0) AS inserted
      `,
      values,
      queryOptions,
    )
    return rows
  }

  const { rows } = await write<UpsertedUrlRow>(
    `/* addUrls:withContentType */
      INSERT INTO urls (
        url,
        hostname_id,
        pathname,
        search_params,
        created_by_id,
        url_content_type_id
      )
      SELECT
        input.url,
        input.hostname_id,
        input.pathname,
        input.search_params,
        input.created_by_id,
        input.url_content_type_id
      FROM unnest(
        $1::text[], $2::uuid[], $3::text[], $4::jsonb[], $5::uuid[], $6::bigint[]
      ) AS input(
        url,
        hostname_id,
        pathname,
        search_params,
        created_by_id,
        url_content_type_id
      )
      ORDER BY input.url
      ON CONFLICT (url)
      DO UPDATE
      SET
        hostname_id = EXCLUDED.hostname_id,
        url_content_type_id = EXCLUDED.url_content_type_id
      RETURNING id, url, hostname_id, (xmax = 0) AS inserted
    `,
    [...values, contentTypeIds],
    queryOptions,
  )
  return rows
}
