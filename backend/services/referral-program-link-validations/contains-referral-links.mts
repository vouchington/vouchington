import { createAsyncGeneratorFromCursor } from '@data-stores/psql/cursors'
import type { QueryOptions, TransactionQuery } from '@data-stores/psql/types'
import sql from 'sql-template-strings'
import { matchDomain, matchesPathnamePattern } from '@ts-shared/utils/urls'

type ReferralLinkMatch = {
  url: string
  referral_program_id: string
}

export type ContainsReferralLinksResult = {
  has_referral_links: boolean
  matched_urls: ReferralLinkMatch[]
}

interface StreamedRule {
  hostname: string
  pathname: string
  referral_program_id: string
}

export type ContainsReferralLinksOptions = QueryOptions

export async function containsReferralLinks(
  urls: string[],
  options: ContainsReferralLinksOptions = {},
): Promise<ContainsReferralLinksResult> {
  const parsed = new Map<string, { hostname: string; pathname: string }>()

  for (const url of urls) {
    try {
      const u = new URL(url)
      parsed.set(url, { hostname: u.hostname, pathname: u.pathname })
    } catch {
      // skip invalid URLs
    }
  }

  if (parsed.size === 0) {
    return { has_referral_links: false, matched_urls: [] }
  }

  const unmatched = new Map(parsed)
  const matched_urls: ReferralLinkMatch[] = []

  const query = sql`/* containsReferralLinks */
    SELECT
      rpvr.hostname,
      rpvr.pathname,
      rp.topic_id AS referral_program_id
    FROM topics__referral_programs rp
    JOIN topics__referral_program_link_validations trplv
      ON trplv.referral_program_id = rp.topic_id
    JOIN referral_program_link_validations rpv
      ON rpv.id = trplv.referral_program_link_validation_id
    JOIN referral_program_link_validations_rules rpvr
      ON rpvr.referral_program_link_validation_id = rpv.id
    WHERE rp.enabled_at IS NOT NULL
      AND rp.disabled_at IS NULL
      AND rpvr.is_referral_link_url = TRUE
    ORDER BY
      CASE WHEN rpvr.hostname NOT LIKE '*.%' THEN 0 ELSE 1 END,
      LENGTH(rpvr.hostname) DESC,
      LENGTH(rpvr.pathname) DESC,
      rp.topic_id ASC
  `

  const cursor = createAsyncGeneratorFromCursor<StreamedRule>(query, resolveCursorOptions(options))

  for await (const rule of cursor) {
    for (const [url, { hostname, pathname }] of unmatched) {
      if (!matchDomain(hostname, rule.hostname)) continue
      if (!matchesPathnamePattern(pathname, rule.pathname)) continue

      matched_urls.push({ url, referral_program_id: rule.referral_program_id })
      unmatched.delete(url)
    }

    if (unmatched.size === 0) break
  }

  return { has_referral_links: matched_urls.length > 0, matched_urls }
}

function resolveCursorOptions(options: ContainsReferralLinksOptions) {
  if (options.query && !hasCursorClient(options.query)) {
    throw new Error(
      'containsReferralLinks requires query.client to preserve transaction visibility',
    )
  }
  const client = options.query?.client ?? options.client
  return {
    batchSize: 500,
    readOnly: client ? false : (options.readOnly ?? true),
    ...(client ? { client } : {}),
  }
}

function hasCursorClient(query: QueryOptions['query']): query is TransactionQuery {
  return Boolean(query && 'client' in query)
}
