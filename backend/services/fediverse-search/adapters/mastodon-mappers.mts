import type { FediverseSearchResult } from '../types.mts'

export type MastodonAccount = {
  username: string
  display_name?: string
  url: string
  avatar?: string
  note?: string
  created_at?: string
}

export function mapMastodonAccount(
  account: MastodonAccount,
  fallbackHost: string,
): FediverseSearchResult {
  const hostname = extractHostname(account.url, fallbackHost)
  const title = account.display_name || account.username
  return {
    provider: 'mastodon',
    result_type: 'profile',
    source_hostname: hostname,
    external_url: account.url,
    title,
    summary: stripHtml(account.note ?? ''),
    author_name: title,
    author_url: account.url,
    published_at: account.created_at ?? null,
    thumbnail_url: account.avatar ?? null,
  }
}

function extractHostname(url: string, fallback: string): string {
  try {
    return new URL(url).hostname
  } catch {
    return fallback
  }
}

function stripHtml(html: string): string {
  return html
    .replace(/<[^>]*>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}
