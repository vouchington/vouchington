import { beginTransaction, write } from '@data-stores/psql'

export async function seedTestLandingPageCount(userId: string, count: number): Promise<void> {
  await write(
    `/* seedTestLandingPageCount */ INSERT INTO user_landing_pages (user_id, slot, title, slug, is_default)
     SELECT $1::uuid, n, 'Page ' || n, 'page-' || n, n = 1 FROM generate_series(1, $2::integer) n`,
    [userId, count],
  )
}

export async function getTestLandingPageCount(userId: string): Promise<number | null> {
  const { rows } = await write<{ page_count: string }>(
    `/* getTestLandingPageCount */ SELECT COUNT(*) AS page_count FROM user_landing_pages WHERE user_id = $1::uuid`,
    [userId],
  )
  return rows[0] ? Number(rows[0].page_count) : null
}

export async function rollBackTestLandingPageInsert(userId: string): Promise<void> {
  await using query = await beginTransaction()
  await query(
    `/* rollBackTestLandingPageInsert */ INSERT INTO user_landing_pages (user_id, slot, title, slug)
     SELECT $1::uuid, MIN(candidate.slot), 'Rolled back', 'rolled-back'
     FROM generate_series(1, 20) candidate(slot)
     WHERE NOT EXISTS (SELECT 1 FROM user_landing_pages page WHERE page.user_id = $1::uuid AND page.slot = candidate.slot)`,
    [userId],
  )
}

export async function upsertTestLandingPage(userId: string, pageId: string): Promise<void> {
  await write(
    `/* upsertTestLandingPage */ INSERT INTO user_landing_pages (id, user_id, slot, title, slug)
     SELECT $1::uuid, $2::uuid, slot, 'Updated', 'updated' FROM user_landing_pages WHERE id = $1::uuid
     ON CONFLICT (id) DO UPDATE SET title = EXCLUDED.title`,
    [pageId, userId],
  )
}
