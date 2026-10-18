import { createSpeculationRules } from '@vouchington/utils/speculation-rules'
import { escapeInlineScriptJson } from '@vouchington/utils/json-ld'

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
    JSON.stringify(
      createSpeculationRules({
        excludedHrefPatterns: SPECULATION_EXCLUDED_HREF_PATTERNS,
        excludedSelectors: SPECULATION_EXCLUDED_SELECTORS,
        noVarySearchHeader: NO_VARY_SEARCH_HEADER,
      }),
    ),
  )
}
