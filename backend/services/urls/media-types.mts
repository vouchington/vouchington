import createError from 'http-errors'
import {
  beginTransaction,
  read,
  write,
  withTransactionOptions,
  type QueryOptions,
} from '@data-stores/psql'
import sql from 'sql-template-strings'

export const upsertMediaTypes = async (
  mimeType: string,
  options: QueryOptions = {},
): Promise<string | null> => {
  const normalizedMimeType = mimeType.trim().toLowerCase()
  if (
    normalizedMimeType.length > 255 ||
    !/^[a-z0-9!#$%&'*+.^_`|~-]+\/[a-z0-9!#$%&'*+.^_`|~-]+$/.test(normalizedMimeType)
  ) {
    throw createError(422, 'Invalid MIME type')
  }

  const existing = await readMediaTypeId(normalizedMimeType, options)
  if (existing) return existing

  const run = (query: QueryOptions['query']) =>
    upsertMissingMediaType(normalizedMimeType, { ...options, query })
  if (options.query || options.client) return withTransactionOptions(options, run)
  await using transaction = await beginTransaction()
  const result = await run(transaction)
  await transaction.commit()
  return result
}

async function readMediaTypeId(
  normalizedMimeType: string,
  options: QueryOptions,
): Promise<string | null> {
  const { rows } = await read(
    sql`/* getMediaTypeIdByMimeType */
      SELECT id
      FROM media_types
      WHERE mime_type = ${normalizedMimeType}
      LIMIT 1
    `,
    options,
  )

  return rows[0]?.id || null
}

async function upsertMissingMediaType(
  normalizedMimeType: string,
  options: QueryOptions,
): Promise<string | null> {
  await write(
    sql`/* lockMediaTypeByMimeType */
      SELECT pg_advisory_xact_lock(hashtext('media_types'), hashtext(${normalizedMimeType}))
    `,
    options,
  )

  const existing = await readMediaTypeId(normalizedMimeType, options)
  if (existing) return existing

  const { rows } = await write(
    sql`/* insertMediaType */
      INSERT INTO media_types (mime_type)
      VALUES (${normalizedMimeType})
      RETURNING id
    `,
    options,
  )

  return rows[0]?.id || null
}

/** Resolve a bounded batch in one lock order, preserving the caller's transaction. */
export async function upsertMediaTypeIds(
  mimeTypes: string[],
  options: QueryOptions = {},
): Promise<Map<string, string | null>> {
  const normalizedTypes = [
    ...new Set(mimeTypes.map(value => value.trim().toLowerCase())),
  ].toSorted()
  const ids = new Map<string, string | null>()
  for (const mimeType of normalizedTypes) {
    // oxlint-disable-next-line no-await-in-loop -- acquire shared MIME lookup locks in a stable order.
    ids.set(mimeType, await upsertMediaTypes(mimeType, options))
  }
  return ids
}
