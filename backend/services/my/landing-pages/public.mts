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
    SELECT id, user_id, title, subtitle, slug, is_default, created_at, updated_at
    FROM user_landing_pages
    WHERE user_id = ${user.id}
  `
  if (slug !== undefined) {
    pageQuery.append(sql` AND slug = ${validateLandingPageSlug(slug)}`)
  } else {
    pageQuery.append(sql` AND is_default = TRUE`)
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
