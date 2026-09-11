import app from '@voucha/api/app'
import type { Context } from '@jongleberry/api-server'
import { getUserPublicByAnyCached } from '@services/entity-fetch'
import { HTTP_CACHE_LONG_MAX_AGE_SECONDS } from '@voucha/config'
import { toFrontmatter } from '@modules/utils'

const siteOrigin = process.env.SITE_ORIGIN ?? 'https://voucha.ai'
const MD_CONTENT_TYPE = 'text/markdown; charset=utf-8'

app.route('/md/users/:idOrUsername').get(async (ctx: Context) => {
  const user = await getUserPublicByAnyCached(ctx.params.idOrUsername!)
  ctx.assert(user, 404, 'User not found')

  ctx.set('Cache-Control', `public, max-age=${HTTP_CACHE_LONG_MAX_AGE_SECONDS}`)

  const username = user.username ?? user.id
  const url = `${siteOrigin}/user/${username}`
  const frontmatter = toFrontmatter({
    username,
    url,
    is_official_account: user.is_official_account ?? false,
  })

  const displayName = user.username ?? 'Anonymous'
  const body = `${frontmatter}\n\n# ${displayName}\n\nProfile page for ${displayName}.\n`
  ctx.response.buffer(Buffer.from(body, 'utf8'), MD_CONTENT_TYPE)
})
