import { read } from '@data-stores/psql'
import { isUUID } from '@modules/utils'

export type CommunityReference = { id: string; slug: string }

/** Community id or slug, in one statement. A private community still resolves; the caller authorizes. */
export async function getCommunitiesByReferenceBatch(
  references: readonly string[],
): Promise<Array<CommunityReference | null>> {
  const ids: string[] = []
  const idOrders: number[] = []
  const slugs: string[] = []
  const slugOrders: number[] = []
  references.forEach((reference, index) => {
    const trimmed = reference.trim()
    if (!trimmed) return
    if (isUUID(trimmed)) {
      ids.push(trimmed)
      idOrders.push(index)
      return
    }
    slugs.push(trimmed.toLowerCase())
    slugOrders.push(index)
  })
  const results: Array<CommunityReference | null> = references.map(() => null)
  if (ids.length + slugs.length === 0) return results
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
  for (const row of rows) results[row.input_order] = { id: row.id, slug: row.slug }
  return results
}
