import { read } from '@data-stores/psql'
import sql from 'sql-template-strings'
import { recordLandingPageItemClick as emitLandingPageItemClick } from '@services/analytics'

export async function recordLandingPageItemClick({
  landingPageId,
  landingPageItemId,
  groupMemberId,
  sessionId,
}: {
  landingPageId: string
  landingPageItemId: string
  groupMemberId?: string | null
  sessionId: string
}): Promise<void> {
  const { rows: itemRows } = await read(sql`/* recordLandingPageItemClick */
    SELECT 1 FROM user_landing_page_items
    WHERE id = ${landingPageItemId} AND landing_page_id = ${landingPageId}
  `)
  if (!itemRows.length) return

  if (groupMemberId) {
    const { rows: memberRows } = await read(sql`/* recordLandingPageItemClickValidateMember */
      SELECT 1 FROM user_landing_page_group_members
      WHERE id = ${groupMemberId} AND landing_page_item_id = ${landingPageItemId}
    `)
    if (!memberRows.length) return
  }

  emitLandingPageItemClick({
    pageKind: 'landing_page',
    pageId: landingPageId,
    targetKind: 'item',
    targetId: landingPageItemId,
    groupMemberId: groupMemberId ?? undefined,
    sessionId,
  })
}
