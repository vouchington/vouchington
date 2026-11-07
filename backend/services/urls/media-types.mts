import createError from 'http-errors'
import { read, write, type QueryOptions } from '@data-stores/psql'
import sql from 'sql-template-strings'

function normalizeMimeType(mimeType: string): string {
  const normalizedMimeType = mimeType.trim().toLowerCase()
  if (
    normalizedMimeType.length > 255 ||
    !/^[a-z0-9!#$%&'*+.^_`|~-]+\/[a-z0-9!#$%&'*+.^_`|~-]+$/.test(normalizedMimeType)
  ) {
    throw createError(422, 'Invalid MIME type')
  }
  return normalizedMimeType
}

export const upsertMediaTypes = async (
  mimeType: string,
  options: QueryOptions = {},
): Promise<string | null> => {
  const normalizedMimeType = normalizeMimeType(mimeType)
  return (await upsertMediaTypeIds([normalizedMimeType], options)).get(normalizedMimeType) ?? null
}

type MediaTypeRow = { id: string; mime_type: string }

/**
 * Resolves a bounded batch of MIME types to ids with one read and, for types not yet stored, one
 * INSERT in sorted order, preserving the caller's transaction. Returns ids by normalized type.
 */
export async function upsertMediaTypeIds(
  mimeTypes: string[],
  options: QueryOptions = {},
): Promise<Map<string, string | null>> {
  const normalizedTypes = [...new Set(mimeTypes.map(normalizeMimeType))].toSorted()
  const ids = new Map<string, string | null>()
  if (normalizedTypes.length === 0) return ids

  const { rows: existing } = await read<MediaTypeRow>(
    sql`/* getMediaTypeIdsByMimeType */
      SELECT id, mime_type FROM media_types WHERE mime_type = ANY(${normalizedTypes}::text[])
    `,
    options,
  )
  for (const row of existing) ids.set(row.mime_type, row.id)

  const missing = normalizedTypes.filter(type => !ids.has(type))
  if (missing.length > 0) {
    const { rows: inserted } = await write<MediaTypeRow>(
      sql`/* insertMediaTypes */
        INSERT INTO media_types (mime_type)
        SELECT input.mime_type
        FROM unnest(${missing}::text[]) AS input(mime_type)
        ORDER BY input.mime_type ASC NULLS LAST
        ON CONFLICT (mime_type) DO NOTHING
        RETURNING id, mime_type
      `,
      options,
    )
    for (const row of inserted) ids.set(row.mime_type, row.id)
    // A concurrent writer may have inserted a type first; read it from the primary.
    const raced = missing.filter(type => !ids.has(type))
    if (raced.length > 0) {
      const { rows } = await write<MediaTypeRow>(
        sql`/* getInsertedMediaTypeIds */
          SELECT id, mime_type FROM media_types WHERE mime_type = ANY(${raced}::text[])
        `,
        options,
      )
      for (const row of rows) ids.set(row.mime_type, row.id)
    }
  }
  return new Map(normalizedTypes.map(type => [type, ids.get(type) ?? null]))
}
