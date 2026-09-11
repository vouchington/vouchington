import { SIDELOAD_SIGNING_KEYS_ENV, parseSigningKeys, signPath } from '@ts-shared/url-signing'
import { getServerImageOrigin } from '@/lib/utils/image-origin'
import type { PublicLandingPage } from '@/types/landing-pages'

const MAX_TOP_CATEGORIES = 5

/**
 * Cache-buster for the /og/ renderer. The signed base64url payload is
 * content-addressed and cached immutably for a year by CloudFront, so a
 * renderer change (satori layout, Inter fonts, sharp config, card node
 * builders in lambdas/image-resize/og/**) would otherwise keep serving the
 * stale PNG. Bump this whenever the OG renderer output changes so old URLs
 * stop matching. The lambda ignores this field — it is purely a cache key.
 */
export const OG_RENDERER_VERSION = 'v1'

interface GenericOgImageParams {
  eyebrow: string
  title: string
  description: string
  domainLabel: string
}

interface LandingOgImageParams {
  displayName: string
  username: string
  topCategories: string[]
  avatarImageId?: string | null
}

type OgImageParams =
  | ({ type: 'generic' } & GenericOgImageParams)
  | ({ type: 'landing' } & {
      displayName: string
      username: string
      topCategories: string[]
      avatarImageId?: string
    })

/**
 * Build a signed `/og/<base64url>?sig=<hex>` URL for the image lambda's dynamic
 * OG/Twitter card renderer. Mirrors `buildSideloadImageUrl`'s path-signing shape.
 *
 * Only ever called from `generateMetadata` (server-only): the signing secret is
 * read from `process.env` here and must never reach a client bundle or public
 * runtime-config bootstrap.
 */
function buildSignedOgUrl(params: OgImageParams): string {
  const payload = { ...params, rendererVersion: OG_RENDERER_VERSION }
  const encoded = Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url')
  const path = `/og/${encoded}`
  const keys = parseSigningKeys(process.env[SIDELOAD_SIGNING_KEYS_ENV])
  const sig = signPath(path, keys)
  const origin = getServerImageOrigin()
  return `${origin ?? ''}${path}?sig=${sig}`
}

export function buildGenericOgImageUrl(params: GenericOgImageParams): string {
  return buildSignedOgUrl({ type: 'generic', ...params })
}

export function buildLandingOgImageUrl(params: LandingOgImageParams): string {
  return buildSignedOgUrl({
    type: 'landing',
    displayName: params.displayName,
    username: params.username,
    topCategories: params.topCategories.slice(0, MAX_TOP_CATEGORIES),
    ...(params.avatarImageId ? { avatarImageId: params.avatarImageId } : {}),
  })
}

export function extractTopCategories(data: PublicLandingPage): string[] {
  const categories = new Set<string>()
  for (const item of data.landing_page.items) {
    if (categories.size >= MAX_TOP_CATEGORIES) break
    if (item.type === 'referral_link') {
      categories.add(item.referral_link.referral_program_name)
    } else if (item.type === 'topic_group') {
      categories.add(item.topic.name)
    }
  }
  return [...categories].slice(0, MAX_TOP_CATEGORIES)
}
