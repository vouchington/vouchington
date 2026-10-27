import { beforeAll, describe, it } from 'vitest'
import { createReferralProgramFixture, createTestUser } from '@voucha/test-helpers'
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
  const suffix = crypto.randomUUID()
  const personalSlug = `test-personal-${suffix}`
  const businessSlug = `test-business-${suffix}`
  const parentSlug = `all-cards-${suffix}`
  const expectedCatalog: AmexCardSlug[] = [
    { kind: 'personal', slug: personalSlug },
    { kind: 'business', slug: businessSlug },
  ]
  let programIds: string[]

  beforeAll(async () => {
    const user = await createTestUser()
    programIds = []
    for (const pathname of [
      `/en-us/referral/personal/${personalSlug}%`,
      `/en-us/referral/business/${businessSlug}%`,
      `/en-us/referral/${parentSlug}%`,
    ]) {
      const program = await createReferralProgramFixture({
        createdById: user.id,
        hostname: '*.americanexpress.com',
        pathname,
      })
      programIds.push(program.referralProgramId)
    }
  })

  it('returns personal/business slugs without pathname wildcards, excluding the all-cards parent', async () => {
    const catalog = await getAmexCardSlugCatalog()
    const owned = catalog.filter(({ slug }) => slug.includes(suffix))

    assert.deepEqual(
      owned.toSorted((a, b) => a.kind.localeCompare(b.kind)),
      expectedCatalog.toSorted((a, b) => a.kind.localeCompare(b.kind)),
    )
    assert.ok(!owned.some(({ slug }) => slug === parentSlug))
  })

  it('each owned catalog slug constructs a URL that resolves to its referral program', async () => {
    const catalog = await getAmexCardSlugCatalog()
    const owned = catalog.filter(({ slug }) => slug.includes(suffix))
    const finalUrl =
      'https://www.americanexpress.com/en-us/credit-cards/referral/prospect/all-cards/personal?CORID=abc123&GENCODE=def456&ref=JONATOycVU'

    const childUrls = constructChildUrls(finalUrl, owned)
    assert.equal(childUrls.length, expectedCatalog.length)

    for (const [index, url] of childUrls.entries()) {
      const result = await isUrlReferralLink(url)
      assert.equal(result.is_valid, true)
      const programIndex = expectedCatalog.findIndex(
        ({ kind, slug }) => kind === owned[index]!.kind && slug === owned[index]!.slug,
      )
      assert.notEqual(programIndex, -1)
      assert.equal(result.referral_program_id, programIds[programIndex])
    }
  })
})
