import assert from 'http-assert'
import extract from '@modules/markdown-extraction'
import { extractDomain } from '@ts-shared/utils/urls'
import { isUrlBlocked } from '@services/urls-domains-blacklist/domains'
import { assertUrlAllowedByWebRisk } from '@services/web-risk/check'

export async function assertNoBlockedDomains(markdown: string): Promise<void> {
  const { link_urls, image_urls } = await extract(markdown)
  const allUrls = [...link_urls, ...image_urls]
  const domainsToCheck = [
    ...new Set(
      allUrls.flatMap(url => {
        const domain = extractDomain(url)
        return domain !== 'unknown' ? [domain] : []
      }),
    ),
  ]

  const results = await Promise.all(
    domainsToCheck.map(async domain => ({ domain, blocked: await isUrlBlocked(domain) })),
  )
  for (const result of results) {
    assert(!result.blocked, 400, `Domain is blocked: ${result.domain}`)
  }
  await Promise.all([...new Set(allUrls)].map(url => assertUrlAllowedByWebRisk(url)))
}

export async function assertUrlNotBlocked(url: string): Promise<void> {
  const domain = extractDomain(url)
  if (domain === 'unknown') return
  const blocked = await isUrlBlocked(domain)
  assert(!blocked, 400, `Domain is blocked: ${domain}`)
  await assertUrlAllowedByWebRisk(url)
}
