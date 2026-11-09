import { write } from '@data-stores/psql'
import { seedUuid } from '../seed-data/common.mts'
import { v7 } from 'uuid'

const landingOwners = Array.from({ length: 100 }, () => v7())
const landingIds = Array.from({ length: 1000 }, () => v7()).toSorted()
const landingUrlId = v7()
export const sitemapLandingHighWaterId = landingIds[999]!
export const sitemapLandingDeepCursorId = landingIds[499]!

/** One in ten landing pages has an eligible item, with stable bounds for each plan. */
export async function seedSitemapLandingPages(): Promise<void> {
  await write(
    `/* seedSitemapLandingPages:url */ INSERT INTO urls (id, url, hostname_id, search_params)
     VALUES ($1::uuid, 'https://seed-host-0.example.com/sitemap-plan-' || $1::text, $2::uuid, '{}'::jsonb)`,
    [landingUrlId, seedUuid(0, '02')],
  )
  try {
    await write(
      `/* seedSitemapLandingPages:owners */ INSERT INTO users (id, username)
       SELECT id, 'sitemap-plan-' || id::text FROM unnest($1::uuid[]) AS fixture(id)`,
      [landingOwners],
    )
    await write(
      `/* seedSitemapLandingPages:pages */
     INSERT INTO user_landing_pages (id, user_id, title, slug, slot)
     SELECT id, ($2::uuid[])[((ordinal - 1) / 10 + 1)::int], 'Sitemap plan fixture', 'sitemap-plan-' || ordinal,
       ((ordinal - 1) % 10 + 1)::smallint
     FROM unnest($1::uuid[]) WITH ORDINALITY AS fixture(id, ordinal)
`,
      [landingIds, landingOwners],
    )
    await write(
      `/* seedSitemapLandingPages:items */
     INSERT INTO user_landing_page_items (landing_page_id, item_type, link_label, url_id)
     SELECT id, 'link', 'Fixture', $2
     FROM unnest($1::uuid[]) WITH ORDINALITY AS fixture(id, ordinal)
     WHERE ordinal % 10 = 0
       AND NOT EXISTS (SELECT 1 FROM user_landing_page_items item WHERE item.landing_page_id = fixture.id)`,
      [landingIds, landingUrlId],
    )
    await write(
      '/* seedSitemapLandingPages:analyze */ ANALYZE user_landing_pages, user_landing_page_items',
    )
  } catch (err) {
    await deleteSitemapLandingPages()
    throw err
  }
}

export async function deleteSitemapLandingPages(): Promise<void> {
  await write(
    '/* deleteSitemapLandingPages */ DELETE FROM user_landing_pages WHERE id = ANY($1::uuid[]) AND user_id = ANY($2::uuid[])',
    [landingIds, landingOwners],
  )
  await write(
    '/* deleteSitemapLandingPages:owners */ DELETE FROM users WHERE id = ANY($1::uuid[])',
    [landingOwners],
  )
  await write('/* analyzeAfterDeleteSitemapLandingPages */ ANALYZE user_landing_pages')
  await write('/* deleteSitemapLandingPages:url */ DELETE FROM urls WHERE id = $1', [landingUrlId])
}
