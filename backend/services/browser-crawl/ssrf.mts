import net from 'node:net'
import {
  isPrivateIp,
  isBlockedHostname,
  normalizeUrlHostname,
  type BlockedHostnamePolicy,
} from 'ssrf-guard'
import { CrawlerSsrfError } from '@modules/on-error/errors'

const BLOCKED_HOSTNAME_POLICY: BlockedHostnamePolicy = {
  exact: ['localhost'],
  suffixes: ['.local'],
}

const DEFAULT_ALLOWED_SCHEMES = ['http:', 'https:'] as const

export function assertSafeUrlSync(
  rawUrl: string,
  allowedSchemes: readonly string[] = DEFAULT_ALLOWED_SCHEMES,
): void {
  let url: URL
  try {
    url = new URL(rawUrl)
  } catch {
    throw new Error(`Invalid URL: ${rawUrl}`)
  }
  if (!allowedSchemes.some(scheme => scheme.toLowerCase() === url.protocol)) {
    throw new CrawlerSsrfError(rawUrl, `Scheme not allowed: ${url.protocol}`)
  }
  const hostname = normalizeUrlHostname(url.hostname)
  if (isBlockedHostname(hostname, BLOCKED_HOSTNAME_POLICY)) {
    throw new CrawlerSsrfError(rawUrl, `Hostname not allowed: ${hostname}`)
  }
  if (net.isIP(hostname) !== 0 && isPrivateIp(hostname)) {
    throw new CrawlerSsrfError(rawUrl, `IP address is private: ${hostname}`)
  }
}
