import {
  beginTransaction,
  read,
  write,
  withTransactionOptions,
  type QueryOptions,
} from '@data-stores/psql'
import sql from 'sql-template-strings'

export const upsertUrlContentTypes = async (
  mimeType: string,
  options: QueryOptions = {},
): Promise<string | null> => {
  const normalizedMimeType = mimeType.toLowerCase()

  const existing = await readUrlContentTypeId(normalizedMimeType, options)
  if (existing) return existing

  const run = (query: QueryOptions['query']) =>
    upsertMissingUrlContentType(normalizedMimeType, { ...options, query })
  if (options.query || options.client) return withTransactionOptions(options, run)
  await using transaction = await beginTransaction()
  const result = await run(transaction)
  await transaction.commit()
  return result
}

async function readUrlContentTypeId(
  normalizedMimeType: string,
  options: QueryOptions,
): Promise<string | null> {
  const { rows } = await read(
    sql`/* getUrlContentTypeIdByMimeType */
      SELECT id
      FROM url_content_types
      WHERE mime_type = ${normalizedMimeType}
      LIMIT 1
    `,
    options,
  )

  return rows[0]?.id || null
}

async function upsertMissingUrlContentType(
  normalizedMimeType: string,
  options: QueryOptions,
): Promise<string | null> {
  await write(
    sql`/* lockUrlContentTypeByMimeType */
      SELECT pg_advisory_xact_lock(hashtext('url_content_types'), hashtext(${normalizedMimeType}))
    `,
    options,
  )

  const existing = await readUrlContentTypeId(normalizedMimeType, options)
  if (existing) return existing

  const { rows } = await write(
    sql`/* insertUrlContentType */
      INSERT INTO url_content_types (mime_type)
      VALUES (${normalizedMimeType})
      RETURNING id
    `,
    options,
  )

  return rows[0]?.id || null
}
