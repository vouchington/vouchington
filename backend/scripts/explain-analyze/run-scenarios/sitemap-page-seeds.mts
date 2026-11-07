import { write } from '@data-stores/psql'
import { seedUuid } from '../seed-data/common.mts'
import { seedUser } from '../run-support.mts'

const landingIds = Array.from({ length: 1000 }, (_, index) => seedUuid(9_000_000 + index, 'f5'))
const landingUrlId = seedUuid(9_000_000, 'f6')
export const sitemapLandingHighWaterId = landingIds[999]!
export const sitemapLandingDeepCursorId = landingIds[499]!

/** One in ten landing pages has an eligible item, with stable bounds for each plan. */
export async function seedSitemapLandingPages(): Promise<void> {
  await write(
    `/* seedSitemapLandingPages:url */ INSERT INTO urls (id, url, hostname_id, search_params)
     VALUES ($1, 'https://seed-host-0.example.com/sitemap-plan-fixture', $2, '{}'::jsonb)
     ON CONFLICT DO NOTHING`,
    [landingUrlId, seedUuid(0, '02')],
  )
  await write(
    `/* seedSitemapLandingPages:pages */
     INSERT INTO user_landing_pages (id, user_id, title, slug)
     SELECT id, $2, 'Sitemap plan fixture', 'sitemap-plan-' || ordinal
     FROM unnest($1::uuid[]) WITH ORDINALITY AS fixture(id, ordinal)
     ON CONFLICT DO NOTHING`,
    [landingIds, seedUser.id],
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
}

export async function deleteSitemapLandingPages(): Promise<void> {
  await write(
    '/* deleteSitemapLandingPages */ DELETE FROM user_landing_pages WHERE id = ANY($1::uuid[])',
    [landingIds],
  )
  await write('/* analyzeAfterDeleteSitemapLandingPages */ ANALYZE user_landing_pages')
  await write('/* deleteSitemapLandingPages:url */ DELETE FROM urls WHERE id = $1', [landingUrlId])
}
