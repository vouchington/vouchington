import assert from 'http-assert'
import extract from '@modules/markdown-extraction'
import { extractDomain } from '@ts-shared/utils/urls'
import {
  getHostnamePolicies,
  normalizeHostnameForPolicy,
} from '@services/urls-domains-blacklist/domains'
import { assertUrlsAllowedByWebRisk, parseWebRiskUrl } from '@services/web-risk/check'

/**
 * One batched policy read covers the display domains and the hostnames Web Risk will check, so
 * neither the per-domain blocklist check nor the per-URL check queries again.
 */
async function assertDomainsAndUrlsAllowed(domains: string[], urls: string[]): Promise<void> {
  const webRiskHostnames = urls.flatMap(url => parseWebRiskUrl(url)?.hostname ?? [])
  const policies = await getHostnamePolicies([...domains, ...webRiskHostnames])
  for (const domain of domains) {
    const blocked = policies.get(normalizeHostnameForPolicy(domain))?.is_blocked === true
    assert(!blocked, 400, `Domain is blocked: ${domain}`)
  }
  await assertUrlsAllowedByWebRisk(urls, { policies })
}

export async function assertNoBlockedDomains(markdown: string): Promise<void> {
  const { link_urls, image_urls } = await extract(markdown)
  const allUrls = [...new Set([...link_urls, ...image_urls])]
  const domains = [
    ...new Set(
      allUrls.flatMap(url => {
        const domain = extractDomain(url)
        return domain !== 'unknown' ? [domain] : []
      }),
    ),
  ]
  await assertDomainsAndUrlsAllowed(domains, allUrls)
}

export async function assertUrlNotBlocked(url: string): Promise<void> {
  const domain = extractDomain(url)
  if (domain === 'unknown') return
  await assertDomainsAndUrlsAllowed([domain], [url])
}
