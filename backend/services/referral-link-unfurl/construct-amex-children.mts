import { read, type QueryOptions } from '@data-stores/psql'
import sql from 'sql-template-strings'

const AMEX_HOSTNAME = '*.americanexpress.com'
const AMEX_REFERRAL_ORIGIN = 'https://www.americanexpress.com'
const PATHNAME_PREFIXES = {
  personal: '/en-us/referral/personal/',
  business: '/en-us/referral/business/',
} as const

export type AmexCardKind = keyof typeof PATHNAME_PREFIXES

export interface AmexCardSlug {
  kind: AmexCardKind
  slug: string
}

/**
 * Derives the Amex per-card slug catalog from the seeded referral programs
 * (`seed/referral-programs-topics.csv`) rather than any separate catalog artifact —
 * the seeded rows are the single source of truth. Adding a card means adding one CSV row.
 */
export async function getAmexCardSlugCatalog(options?: QueryOptions): Promise<AmexCardSlug[]> {
  const { rows } = await read(
    sql`/* getAmexCardSlugCatalog */
      SELECT DISTINCT rpvr.pathname
      FROM topics__referral_programs rp
      JOIN topics__referral_program_link_validations trplv
        ON trplv.referral_program_id = rp.topic_id
      JOIN referral_program_link_validations rpv
        ON rpv.id = trplv.referral_program_link_validation_id
      JOIN referral_program_link_validations_rules rpvr
        ON rpvr.referral_program_link_validation_id = rpv.id
      WHERE rp.enabled_at IS NOT NULL
        AND rp.disabled_at IS NULL
        AND rpvr.is_referral_link_url = true
        AND rpvr.hostname = ${AMEX_HOSTNAME}
        AND (
          rpvr.pathname LIKE ${`${PATHNAME_PREFIXES.personal}%`}
          OR rpvr.pathname LIKE ${`${PATHNAME_PREFIXES.business}%`}
        )
    `,
    options,
  )

  const catalog: AmexCardSlug[] = []
  for (const row of rows as { pathname: string }[]) {
    const entry = parseCardSlugFromPathname(row.pathname)
    if (entry) catalog.push(entry)
  }
  return catalog
}

function parseCardSlugFromPathname(pathname: string): AmexCardSlug | null {
  for (const kind of Object.keys(PATHNAME_PREFIXES) as AmexCardKind[]) {
    const prefix = PATHNAME_PREFIXES[kind]
    if (!pathname.startsWith(prefix)) continue
    // Seeded pathnames are SQL LIKE patterns (`.../gold-card%`); strip the trailing
    // wildcard marker to recover the literal slug.
    const slug = pathname.slice(prefix.length).replace(/%+$/, '')
    if (slug) return { kind, slug }
  }
  return null
}

/**
 * Builds one per-card Amex referral URL per catalog entry, copying the full query
 * param set captured on `finalUrl` (the parent's post-redirect landed URL) verbatim.
 * Pure/synchronous — no browser, no DB — so it's unit-testable with fixtures alone.
 */
export function constructChildUrls(finalUrl: string, catalog: AmexCardSlug[]): string[] {
  const { search } = new URL(finalUrl)
  return catalog.map(({ kind, slug }) => {
    const childUrl = new URL(`${AMEX_REFERRAL_ORIGIN}${PATHNAME_PREFIXES[kind]}${slug}`)
    childUrl.search = search
    return childUrl.toString()
  })
}
