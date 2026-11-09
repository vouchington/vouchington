import { read } from '@data-stores/psql'
import sql from 'sql-template-strings'
import { getPublicUserByAny, getUserDisplayName } from '@services/users'
import { validateLandingPageSlug } from './shared.mts'
import { getUserMarkdown } from './reads.mts'
import { resolveLandingPageWithItems } from './resolve-items.mts'
import type { LandingPage, PublicLandingPage } from './types.mts'

export async function getPublicLandingPage(
  username: string,
  slug?: string,
): Promise<PublicLandingPage | null> {
  const user = await getPublicUserByAny(username)
  if (!user?.username) return null

  const pageQuery = sql`/* getPublicLandingPage */
    WITH selected_default AS (
      SELECT COALESCE(
        (SELECT id FROM user_landing_pages WHERE user_id = ${user.id} AND is_default LIMIT 1),
        (SELECT id FROM user_landing_pages WHERE user_id = ${user.id} ORDER BY id ASC LIMIT 1)
      ) AS id
    )
    SELECT page.id, page.user_id, page.title, page.subtitle, page.slug,
      page.id = selected_default.id AS is_default,
      page.created_at, page.updated_at
    FROM user_landing_pages page CROSS JOIN selected_default
    WHERE page.user_id = ${user.id}
  `
  if (slug !== undefined) {
    pageQuery.append(sql` AND page.slug = ${validateLandingPageSlug(slug)}`)
  } else {
    pageQuery.append(sql` AND page.id = selected_default.id`)
  }
  pageQuery.append(sql` LIMIT 1`)

  const [markdown, pageResult] = await Promise.all([getUserMarkdown(user.id), read(pageQuery)])
  const page = pageResult.rows[0] as LandingPage | undefined
  if (!page) return null

  return {
    user: {
      ...user,
      display_name: getUserDisplayName(user),
      markdown,
    },
    landing_page: await resolveLandingPageWithItems(page, { publicOnly: true }),
  }
}
