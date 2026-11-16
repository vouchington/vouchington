import { read } from '@data-stores/psql'
import { isUUID } from '@modules/utils'

export type CommunityReference = { id: string; slug: string }

/** Community id or slug, in one statement. A private community still resolves; the caller authorizes. */
export async function getCommunitiesByReferenceBatch(
  references: readonly string[],
): Promise<Array<CommunityReference | null>> {
  const entries = references.flatMap((reference, index) => {
    const trimmed = reference.trim()
    return trimmed ? [{ trimmed, index }] : []
  })
  const idEntries = entries.filter(entry => isUUID(entry.trimmed))
  const slugEntries = entries.filter(entry => !isUUID(entry.trimmed))
  const ids = idEntries.map(entry => entry.trimmed)
  const idOrders = idEntries.map(entry => entry.index)
  const slugs = slugEntries.map(entry => entry.trimmed.toLowerCase())
  const slugOrders = slugEntries.map(entry => entry.index)
  if (ids.length + slugs.length === 0) return references.map(() => null)
  const { rows } = await read<CommunityReference & { input_order: number }>(
    `/* getCommunitiesByReferenceBatch */
    WITH id_input AS (
      SELECT unnest($1::uuid[]) AS id, unnest($2::int[]) AS input_order
    ),
    slug_input AS (
      SELECT unnest($3::text[]) AS slug, unnest($4::int[]) AS input_order
    ),
    hits AS (
      SELECT community.id, community.slug, id_input.input_order, 0 AS priority
      FROM communities community
      JOIN id_input ON community.id = id_input.id
      WHERE community.deleted_at IS NULL
      UNION ALL
      SELECT community.id, community.slug, slug_input.input_order, 1 AS priority
      FROM communities community
      JOIN slug_input ON community.slug = slug_input.slug
      WHERE community.deleted_at IS NULL
    )
    SELECT DISTINCT ON (input_order) id, slug, input_order
    FROM hits
    ORDER BY input_order, priority, id`,
    [ids, idOrders, slugs, slugOrders],
  )
  const byOrder = new Map(rows.map(row => [row.input_order, { id: row.id, slug: row.slug }]))
  return references.map((_reference, index) => byOrder.get(index) ?? null)
}
