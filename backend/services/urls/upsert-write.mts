import { beginTransaction, write } from '@data-stores/psql'
import type { QueryOptions } from '@data-stores/psql/types'

type UpsertedUrlRow = {
  hostname_id: string
  id: string
  inserted: boolean
  url: string
}

export type UrlSearchParamWrite = {
  url: string
  ordinal: number
  name: string
  value: string
}

export async function upsertUrlRows(
  values: unknown[],
  contentTypeIds: string[] | null,
  searchParams: readonly UrlSearchParamWrite[],
  queryOptions: QueryOptions,
): Promise<UpsertedUrlRow[]> {
  if (queryOptions.query || queryOptions.client) {
    return writeUrlRows(queryOptions, values, contentTypeIds, searchParams)
  }
  await using query = await beginTransaction()
  const rows = await writeUrlRows({ query }, values, contentTypeIds, searchParams)
  await query.commit()
  return rows
}

async function writeUrlRows(
  options: QueryOptions,
  values: unknown[],
  contentTypeIds: string[] | null,
  searchParams: readonly UrlSearchParamWrite[],
): Promise<UpsertedUrlRow[]> {
  const rows =
    contentTypeIds === null
      ? await insertUrls(values, options)
      : await insertUrlsWithContentType(values, contentTypeIds, options)
  const insertedIds = rows.flatMap(row => (row.inserted ? [row.id] : []))
  const insertedUrls = new Set(rows.flatMap(row => (row.inserted ? [row.url] : [])))
  const insertedParams = searchParams.filter(param => insertedUrls.has(param.url))
  if (insertedIds.length === 0 || insertedParams.length === 0) return rows
  await write(
    `/* addUrls:searchParams */
      INSERT INTO url_search_params (url_id, ordinal, param_name, param_value)
      SELECT inserted.id, param.ordinal, param.name, param.value
      FROM unnest($1::text[], $2::int[], $3::text[], $4::text[])
        AS param(url, ordinal, name, value)
      JOIN urls inserted ON inserted.url = param.url AND inserted.id = ANY($5::uuid[])
      ORDER BY inserted.id, param.ordinal
    `,
    [
      insertedParams.map(param => param.url),
      insertedParams.map(param => param.ordinal),
      insertedParams.map(param => param.name),
      insertedParams.map(param => param.value),
      insertedIds,
    ],
    options,
  )
  return rows
}

async function insertUrls(
  values: unknown[],
  queryOptions: QueryOptions,
): Promise<UpsertedUrlRow[]> {
  const { rows } = await write<UpsertedUrlRow>(
    `/* addUrls */
      INSERT INTO urls (url, hostname_id, pathname, created_by_id)
      SELECT
        input.url,
        input.hostname_id,
        input.pathname,
        input.created_by_id
      FROM unnest(
        $1::text[], $2::uuid[], $3::text[], $4::uuid[]
      ) AS input(url, hostname_id, pathname, created_by_id)
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

async function insertUrlsWithContentType(
  values: unknown[],
  contentTypeIds: string[],
  queryOptions: QueryOptions,
): Promise<UpsertedUrlRow[]> {
  const { rows } = await write<UpsertedUrlRow>(
    `/* addUrls:withContentType */
      INSERT INTO urls (
        url,
        hostname_id,
        pathname,
        created_by_id,
        url_content_type_id
      )
      SELECT
        input.url,
        input.hostname_id,
        input.pathname,
        input.created_by_id,
        input.url_content_type_id
      FROM unnest(
        $1::text[], $2::uuid[], $3::text[], $4::uuid[], $5::bigint[]
      ) AS input(
        url,
        hostname_id,
        pathname,
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
