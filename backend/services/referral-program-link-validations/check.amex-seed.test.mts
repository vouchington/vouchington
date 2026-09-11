import { describe, it } from 'vitest'
import assert from 'node:assert/strict'
import { isUrlReferralLink } from './check.mts'
import { getTopicBySlug } from '@services/topics/get'

// Seed/resolution integration test for the Amex referral program rows in
// `seed/referral-programs-topics.csv` (plan #8351 §B). Every URL here is authored
// independently of the CSV so a stale hostname, pathname, or slug typo in the seed
// file fails this test rather than only "resolves to *something*".
const AMEX_CARD_CASES: ReadonlyArray<{ url: string; expectedTopicSlug: string }> = [
  {
    url: 'https://www.americanexpress.com/en-us/referral/all-cards?ref=abc123',
    expectedTopicSlug: 'amex-referral-program',
  },
  {
    url: 'https://www.americanexpress.com/en-us/referral/personal/gold-card?ref=abc123',
    expectedTopicSlug: 'amex-referral-personal-gold',
  },
  {
    url: 'https://www.americanexpress.com/en-us/referral/personal/platinum-card?ref=abc123',
    expectedTopicSlug: 'amex-referral-personal-platinum',
  },
  {
    url: 'https://www.americanexpress.com/en-us/referral/personal/blue-cash-preferred-credit-card?ref=abc123',
    expectedTopicSlug: 'amex-referral-personal-blue-cash-preferred',
  },
  {
    url: 'https://www.americanexpress.com/en-us/referral/personal/blue-cash-everyday-credit-card?ref=abc123',
    expectedTopicSlug: 'amex-referral-personal-blue-cash-everyday',
  },
  {
    url: 'https://www.americanexpress.com/en-us/referral/personal/hilton-honors-surpass-credit-card?ref=abc123',
    expectedTopicSlug: 'amex-referral-personal-hilton-honors-surpass',
  },
  {
    url: 'https://www.americanexpress.com/en-us/referral/personal/delta-skymiles-gold-american-express-card?ref=abc123',
    expectedTopicSlug: 'amex-referral-personal-delta-skymiles-gold',
  },
  {
    url: 'https://www.americanexpress.com/en-us/referral/personal/hilton-honors-credit-card?ref=abc123',
    expectedTopicSlug: 'amex-referral-personal-hilton-honors',
  },
  {
    url: 'https://www.americanexpress.com/en-us/referral/personal/delta-skymiles-blue-american-express-card?ref=abc123',
    expectedTopicSlug: 'amex-referral-personal-delta-skymiles-blue',
  },
  {
    url: 'https://www.americanexpress.com/en-us/referral/personal/delta-skymiles-reserve-american-express-card?ref=abc123',
    expectedTopicSlug: 'amex-referral-personal-delta-skymiles-reserve',
  },
  {
    url: 'https://www.americanexpress.com/en-us/referral/personal/marriott-bonvoy-bevy-card?ref=abc123',
    expectedTopicSlug: 'amex-referral-personal-marriott-bonvoy-bevy',
  },
  {
    url: 'https://www.americanexpress.com/en-us/referral/personal/marriott-bonvoy-brilliant-card?ref=abc123',
    expectedTopicSlug: 'amex-referral-personal-marriott-bonvoy-brilliant',
  },
  {
    url: 'https://www.americanexpress.com/en-us/referral/personal/delta-skymiles-platinum-american-express-card?ref=abc123',
    expectedTopicSlug: 'amex-referral-personal-delta-skymiles-platinum',
  },
  {
    url: 'https://www.americanexpress.com/en-us/referral/personal/hilton-honors-aspire-credit-card?ref=abc123',
    expectedTopicSlug: 'amex-referral-personal-hilton-honors-aspire',
  },
  {
    url: 'https://www.americanexpress.com/en-us/referral/personal/american-express-green-card?ref=abc123',
    expectedTopicSlug: 'amex-referral-personal-green',
  },
  {
    url: 'https://www.americanexpress.com/en-us/referral/business/businessgold-card?ref=abc123',
    expectedTopicSlug: 'amex-referral-business-gold',
  },
  {
    url: 'https://www.americanexpress.com/en-us/referral/business/bluebusinessplus-credit-card?ref=abc123',
    expectedTopicSlug: 'amex-referral-business-blue-business-plus',
  },
  {
    url: 'https://www.americanexpress.com/en-us/referral/business/business-platinum-charge-card?ref=abc123',
    expectedTopicSlug: 'amex-referral-business-platinum',
  },
  {
    url: 'https://www.americanexpress.com/en-us/referral/business/marriott-bonvoy-business-american-express-card?ref=abc123',
    expectedTopicSlug: 'amex-referral-business-marriott-bonvoy',
  },
  {
    url: 'https://www.americanexpress.com/en-us/referral/business/business-green-rewards-charge-card?ref=abc123',
    expectedTopicSlug: 'amex-referral-business-green-rewards',
  },
  {
    url: 'https://www.americanexpress.com/en-us/referral/business/delta-skymiles-gold?ref=abc123',
    expectedTopicSlug: 'amex-referral-business-delta-skymiles-gold',
  },
  {
    url: 'https://www.americanexpress.com/en-us/referral/business/delta-skymiles-reserve?ref=abc123',
    expectedTopicSlug: 'amex-referral-business-delta-skymiles-reserve',
  },
  {
    url: 'https://www.americanexpress.com/en-us/referral/business/delta-skymiles-platinum?ref=abc123',
    expectedTopicSlug: 'amex-referral-business-delta-skymiles-platinum',
  },
]

describe('check (Amex seed resolution)', () => {
  it('every seeded Amex card slug resolves to its own referral_program topic', async () => {
    for (const { url, expectedTopicSlug } of AMEX_CARD_CASES) {
      const expectedTopic = await getTopicBySlug(expectedTopicSlug)
      assert.ok(expectedTopic, `expected topic "${expectedTopicSlug}" to be seeded`)

      const result = await isUrlReferralLink(url)
      assert.equal(result.is_valid, true, `expected ${url} to resolve (${expectedTopicSlug})`)
      assert.equal(
        result.referral_program_id,
        expectedTopic.id,
        `expected ${url} to resolve to "${expectedTopicSlug}"`,
      )
    }
  })

  it('all-cards link resolves to the parent program, not a per-card child program', async () => {
    const parentTopic = await getTopicBySlug('amex-referral-program')
    assert.ok(parentTopic)

    const result = await isUrlReferralLink(
      'https://www.americanexpress.com/en-us/referral/all-cards?ref=abc123',
    )
    assert.equal(result.is_valid, true)
    assert.equal(result.referral_program_id, parentTopic.id)
  })

  it('a per-card link does not fall back to the parent all-cards program', async () => {
    const parentTopic = await getTopicBySlug('amex-referral-program')
    const goldTopic = await getTopicBySlug('amex-referral-personal-gold')
    assert.ok(parentTopic)
    assert.ok(goldTopic)

    const result = await isUrlReferralLink(
      'https://www.americanexpress.com/en-us/referral/personal/gold-card?ref=abc123',
    )
    assert.equal(result.is_valid, true)
    assert.equal(result.referral_program_id, goldTopic.id)
    assert.notEqual(result.referral_program_id, parentTopic.id)
  })

  it('*.americanexpress.com wildcard matches both the apex and www host', async () => {
    const goldTopic = await getTopicBySlug('amex-referral-personal-gold')
    assert.ok(goldTopic)

    const wwwResult = await isUrlReferralLink(
      'https://www.americanexpress.com/en-us/referral/personal/gold-card?ref=abc123',
    )
    const apexResult = await isUrlReferralLink(
      'https://americanexpress.com/en-us/referral/personal/gold-card?ref=abc123',
    )

    assert.equal(wwwResult.is_valid, true)
    assert.equal(apexResult.is_valid, true)
    assert.equal(wwwResult.referral_program_id, goldTopic.id)
    assert.equal(apexResult.referral_program_id, goldTopic.id)
  })
})
