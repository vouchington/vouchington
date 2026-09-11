import { SITEMAP_CONFIG } from '@voucha/config/sitemaps'
import pMap from 'p-map'
import { buildSitemapFamilyIndexEntry } from './family-generation.mts'
import {
  buildPostDayIndexRoutePath,
  buildPostsIndexRoutePath,
  buildStaticPagesRoutePath,
} from './generated-paths.mts'
import { getPostDayManifest, getSitemapFamilyManifest } from './storage.mts'
import { buildSitemapUrl } from './url-builder.mts'
import type { SitemapPostType } from './types.mts'

const POST_DAY_MANIFEST_LOOKUP_CONCURRENCY = 16

export async function buildPostTypeIndexEntries(
  postType: SitemapPostType,
  days: readonly string[],
  getManifest = getPostDayManifest,
): Promise<Array<{ loc: string }>> {
  const entries = await pMap(
    days,
    async day => {
      const manifest = await getManifest(postType, day)
      if (!manifest) return null
      return {
        loc: buildSitemapUrl(buildPostDayIndexRoutePath(postType, day)),
      }
    },
    { concurrency: POST_DAY_MANIFEST_LOOKUP_CONCURRENCY, stopOnError: false },
  )
  return entries.filter((entry): entry is { loc: string } => entry !== null)
}

export async function buildRootIndexEntries(
  getFamilyManifest = getSitemapFamilyManifest,
): Promise<Array<{ loc: string }>> {
  const familyEntries = await Promise.all(
    SITEMAP_CONFIG.FAMILY_TYPES.map(async family => {
      const manifest = await getFamilyManifest(family)
      if (!manifest) return null
      return buildSitemapFamilyIndexEntry(family)
    }),
  )
  return [
    {
      loc: buildSitemapUrl(buildStaticPagesRoutePath()),
    },
    {
      loc: buildSitemapUrl(buildPostsIndexRoutePath()),
    },
    ...familyEntries.filter((entry): entry is { loc: string } => entry !== null),
  ]
}
