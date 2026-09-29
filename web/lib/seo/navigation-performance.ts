import { escapeInlineScriptJson } from '@/lib/utils/inline-script-json'

// Same names, in the same order, as NO_VARY_SEARCH_PARAM_NAMES. A browser may reuse a
// query-free prefetch for these click ids only because the Worker cache key ignores them too.
export const NO_VARY_SEARCH_HEADER =
  'params=("utm_source" "utm_medium" "utm_campaign" "utm_term" "utm_content" "gclid" "gbraid" "wbraid" "dclid" "fbclid" "msclkid" "ttclid" "twclid" "srsltid" "igshid" "igsh" "_gl" "mc_cid" "mc_eid"), key-order'

const SPECULATION_EXCLUDED_HREF_PATTERNS = [
  '/*?*',
  '/api/*',
  '/infra/*',
  '/md/*',
  '/rss*',
  '/login*',
  '/logout*',
  '/admin',
  '/admin/*',
  '/my',
  '/my/*',
  '/chat/*',
  '/*/create',
  '/*/create/*',
  '/*/edit',
  '/*/edit/*',
  '/*/settings',
  '/*/settings/*',
  '/*review-queue*',
]

const SPECULATION_EXCLUDED_SELECTORS = [
  'a[target]',
  'a[download]',
  'a[rel~="nofollow"]',
  'a[data-no-speculation]',
]

export function serializeSpeculationRules(): string {
  return escapeInlineScriptJson(
    JSON.stringify({
      prefetch: [
        {
          source: 'document',
          where: {
            and: [
              { href_matches: '/*' },
              ...SPECULATION_EXCLUDED_HREF_PATTERNS.map(pattern => ({
                not: { href_matches: pattern },
              })),
              ...SPECULATION_EXCLUDED_SELECTORS.map(selector => ({
                not: { selector_matches: selector },
              })),
            ],
          },
          eagerness: 'conservative',
          expects_no_vary_search: NO_VARY_SEARCH_HEADER,
        },
      ],
    }),
  )
}

export function getPreconnectOrigin(rawOrigin: string | undefined): string | null {
  const trimmed = rawOrigin?.trim()
  if (!trimmed) return null

  try {
    const url = new URL(trimmed)
    if (url.protocol !== 'https:' && url.protocol !== 'http:') return null
    return url.origin
  } catch {
    return null
  }
}
