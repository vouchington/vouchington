import { describe, it } from 'vitest'
import assert from 'node:assert/strict'
import { isUrlReferralLink } from '@services/referral-program-link-validations'
import {
  constructChildUrls,
  getAmexCardSlugCatalog,
  type AmexCardSlug,
} from './construct-amex-children.mts'

describe('constructChildUrls', () => {
  const FINAL_URL =
    'https://www.americanexpress.com/en-us/credit-cards/referral/prospect/all-cards/personal?CORID=abc123&GENCODE=def456&extlink=1&ref=JONATOycVU&v=2&xl=cp15'

  it('builds one URL per catalog entry, copying the full captured param set verbatim', () => {
    const catalog: AmexCardSlug[] = [
      { kind: 'personal', slug: 'gold-card' },
      { kind: 'business', slug: 'businessgold-card' },
    ]

    const urls = constructChildUrls(FINAL_URL, catalog)

    assert.deepEqual(urls, [
      'https://www.americanexpress.com/en-us/referral/personal/gold-card?CORID=abc123&GENCODE=def456&extlink=1&ref=JONATOycVU&v=2&xl=cp15',
      'https://www.americanexpress.com/en-us/referral/business/businessgold-card?CORID=abc123&GENCODE=def456&extlink=1&ref=JONATOycVU&v=2&xl=cp15',
    ])
  })

  it('returns an empty array for an empty catalog', () => {
    assert.deepEqual(constructChildUrls(FINAL_URL, []), [])
  })

  it('constructs a bare URL when the landed URL carries no query params', () => {
    const urls = constructChildUrls('https://www.americanexpress.com/en-us/referral/all-cards', [
      { kind: 'personal', slug: 'platinum-card' },
    ])

    assert.deepEqual(urls, [
      'https://www.americanexpress.com/en-us/referral/personal/platinum-card',
    ])
  })
})

describe('getAmexCardSlugCatalog', () => {
  it('returns only the seeded per-card personal/business slugs, excluding the all-cards parent', async () => {
    const catalog = await getAmexCardSlugCatalog()

    assert.equal(catalog.length, 22, 'expected 14 personal + 8 business seeded card rows')
    assert.ok(
      catalog.every(({ kind }) => kind === 'personal' || kind === 'business'),
      'every catalog entry must be personal or business',
    )
    assert.ok(
      !catalog.some(({ slug }) => slug === 'all-cards'),
      'the all-cards parent program must not appear in the per-card catalog',
    )
    assert.ok(catalog.some(({ kind, slug }) => kind === 'personal' && slug === 'gold-card'))
    assert.ok(catalog.some(({ kind, slug }) => kind === 'business' && slug === 'businessgold-card'))
  })

  it('every catalog slug constructs a URL that resolves via isUrlReferralLink', async () => {
    const catalog = await getAmexCardSlugCatalog()
    const finalUrl =
      'https://www.americanexpress.com/en-us/credit-cards/referral/prospect/all-cards/personal?CORID=abc123&GENCODE=def456&ref=JONATOycVU'

    const childUrls = constructChildUrls(finalUrl, catalog)
    assert.equal(childUrls.length, catalog.length)

    for (const [index, url] of childUrls.entries()) {
      const result = await isUrlReferralLink(url)
      assert.equal(
        result.is_valid,
        true,
        `expected constructed URL for catalog entry ${JSON.stringify(catalog[index])} (${url}) to resolve`,
      )
    }
  })
})
