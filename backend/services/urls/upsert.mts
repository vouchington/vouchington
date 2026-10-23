import { isPublicHostname, normalizeUrlForUrlTable } from '@modules/utils/urls'
import { assertUrlsAllowedByWebRisk } from '@services/web-risk/check'
import { persistAssessedUrls, type AddUrlOptions, type AssessedUrls } from './upsert-persist.mts'

export const { addUrls, addUrl, assessUrls } = createUrlUpsert()

/** One unlocked provider assessment followed by one batch persistence implementation. */
export function createUrlUpsert(
  checkUrls: (urls: readonly string[]) => Promise<void> = assertUrlsAllowedByWebRisk,
) {
  const assessUrls = async (
    hrefs: readonly string[],
    { preserveHttp = false }: Pick<AddUrlOptions, 'preserveHttp'> = {},
  ): Promise<AssessedUrls> => {
    // Public-host checks are best-effort in batch mode — skip non-public items only.
    // Only reject actual IP literals, not domain names with a private-looking prefix.
    const urls = hrefs.flatMap(href => {
      const url = normalizeUrlForUrlTable(href, { preserveHttp })
      return isPublicHostname(url.hostname) ? [url] : []
    })
    if (urls.length === 0) return []

    // Deduplicate by url.toString() (the conflict key), keeping the first occurrence,
    // matching the same guard in upsertUrlHostnames. Without this, two entries with the
    // same normalized URL in a single INSERT ... ON CONFLICT DO UPDATE causes Postgres
    // error 21000 ("command cannot affect row a second time").
    const seen = new Set<string>()
    const uniqueUrls = urls.filter(url => {
      const key = url.toString()
      if (seen.has(key)) return false
      seen.add(key)
      return true
    })

    await checkUrls(uniqueUrls.map(url => url.toString()))
    return uniqueUrls
  }
  const addUrls = async (userId: string | null, hrefs: string[], options: AddUrlOptions = {}) => {
    const assessed = await assessUrls(hrefs, options)
    return persistAssessedUrls(userId, assessed, options)
  }
  const addUrl = (userId: string | null, href: string, options?: AddUrlOptions) =>
    addUrls(userId, [href], options).then(urls => urls[0] ?? null)
  return { assessUrls, addUrls, addUrl }
}
