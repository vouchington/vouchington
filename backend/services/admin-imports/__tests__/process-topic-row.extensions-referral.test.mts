import { describe, it, expect, beforeAll } from 'vitest'
import { createTestUser } from '@voucha/test-helpers'
import { getTopicAliases } from '@services/topics/get-topic-aliases'
import { getSpendingCategoryAttributes } from '@services/topics/spending-categories'
import { getRetailerAttributes } from '@services/topics/retailers'
import { getTopicParents } from '@services/topics/hierarchy'
import { getReferralProgramAttributes } from '@services/topics/referral-programs'
import { getReferralLinkValidationBySlug } from '@services/referral-program-link-validations/validations'
import { getReferralLinkValidationRules } from '@services/referral-program-link-validations/rules/get'
import { createImportBatch } from '../create-batch.mts'
import { processTopicRow } from '../process-topic-row.mts'
import { getTopicByAny } from '@services/topics/get'
import type { PrivateUser } from '@services/users/types'
import type { ImportRow } from '../types.mts'

describe('process-topic-row (extensions and referral)', () => {
  const randomSuffix = () => Math.random().toString(36).slice(2, 10)

  let admin: PrivateUser

  beforeAll(async () => {
    admin = await createTestUser({ administrator: true })
  })

  async function makeRow(
    creator: PrivateUser,
    inputData: Record<string, string>,
  ): Promise<ImportRow> {
    const { rows } = await createImportBatch(creator, 'topic', [inputData] as Record<
      string,
      unknown
    >[])
    return rows[0]
  }

  it('creates aliases when aliases field provided', async () => {
    const suffix = randomSuffix()
    const slug = `alias-topic-${suffix}`
    const row = await makeRow(admin, {
      slug,
      name: `Alias Topic ${suffix}`,
      aliases: `Alt Name ${suffix}|Another Name ${suffix}`,
    })

    const topicId = await processTopicRow(admin, row)

    const { results: aliases } = await getTopicAliases(topicId)
    expect(aliases).toContain(`alt name ${suffix}`)
    expect(aliases).toContain(`another name ${suffix}`)
  })

  it('creates spending_category extension', async () => {
    const suffix = randomSuffix()
    const slug = `spending-cat-${suffix}`
    const row = await makeRow(admin, {
      slug,
      name: `Spending Category ${suffix}`,
      topic_type: 'topic',
      extensions: 'spending_category',
    })

    const topicId = await processTopicRow(admin, row)

    const topic = await getTopicByAny(topicId)
    const attrs = await getSpendingCategoryAttributes(topic!)
    expect(attrs).not.toBeNull()
  })

  it('creates retailer extension for any topic type', async () => {
    const suffix = randomSuffix()
    const slug = `retailer-topic-${suffix}`
    const row = await makeRow(admin, {
      slug,
      name: `Retailer Topic ${suffix}`,
      topic_type: 'topic',
      extensions: 'retailer',
    })

    const topicId = await processTopicRow(admin, row)

    const topic = await getTopicByAny(topicId)
    const attrs = await getRetailerAttributes(topic!)
    expect(attrs).not.toBeNull()
  })

  it('ignores unrecognized extension values', async () => {
    const suffix = randomSuffix()
    const slug = `unknown-ext-${suffix}`
    const row = await makeRow(admin, {
      slug,
      name: `Unknown Extension Topic ${suffix}`,
      topic_type: 'topic',
      extensions: 'not_a_real_extension',
    })

    // Should not throw even though the extension value matches no known handler
    const topicId = await processTopicRow(admin, row)

    const topic = await getTopicByAny(topicId)
    const spendingAttrs = await getSpendingCategoryAttributes(topic!)
    const retailerAttrs = await getRetailerAttributes(topic!)
    expect(spendingAttrs).toBeNull()
    expect(retailerAttrs).toBeNull()
  })

  it('creates parent relations when parent_slugs provided', async () => {
    const suffix = randomSuffix()
    const parentSlug = `parent-topic-${suffix}`
    const childSlug = `child-topic-${suffix}`

    // Create parent first
    const parentRow = await makeRow(admin, {
      slug: parentSlug,
      name: `Parent ${suffix}`,
    })
    await processTopicRow(admin, parentRow)

    // Create child with parent_slugs
    const childRow = await makeRow(admin, {
      slug: childSlug,
      name: `Child ${suffix}`,
      parent_slugs: parentSlug,
    })
    const childId = await processTopicRow(admin, childRow)

    const parents = await getTopicParents(childId)
    expect(parents.length).toBeGreaterThanOrEqual(1)
    expect(parents.some(p => p.slug === parentSlug)).toBe(true)
  })

  it('creates parent relations for multiple parent slugs', async () => {
    const suffix = randomSuffix()
    const parentSlugA = `parent-a-${suffix}`
    const parentSlugB = `parent-b-${suffix}`
    const childSlug = `child-multi-parent-${suffix}`

    const parentRowA = await makeRow(admin, {
      slug: parentSlugA,
      name: `Parent A ${suffix}`,
    })
    await processTopicRow(admin, parentRowA)
    const parentRowB = await makeRow(admin, {
      slug: parentSlugB,
      name: `Parent B ${suffix}`,
    })
    await processTopicRow(admin, parentRowB)

    const childRow = await makeRow(admin, {
      slug: childSlug,
      name: `Child Multi Parent ${suffix}`,
      parent_slugs: `${parentSlugA}|${parentSlugB}`,
    })
    const childId = await processTopicRow(admin, childRow)

    const parents = await getTopicParents(childId)
    expect(parents.some(p => p.slug === parentSlugA)).toBe(true)
    expect(parents.some(p => p.slug === parentSlugB)).toBe(true)
  })

  it('skips parent relation when parent slug not found', async () => {
    const suffix = randomSuffix()
    const row = await makeRow(admin, {
      slug: `orphan-${suffix}`,
      name: `Orphan Topic ${suffix}`,
      parent_slugs: `nonexistent-parent-${suffix}`,
    })

    // Should not throw
    const topicId = await processTopicRow(admin, row)
    expect(topicId).toBeTruthy()
  })

  it('does not treat parent_slugs values as topic IDs', async () => {
    const suffix = randomSuffix()
    const parentRow = await makeRow(admin, {
      slug: `uuid-parent-${suffix}`,
      name: `UUID Parent ${suffix}`,
    })
    const parentId = await processTopicRow(admin, parentRow)

    const childRow = await makeRow(admin, {
      slug: `uuid-parent-child-${suffix}`,
      name: `UUID Parent Child ${suffix}`,
      parent_slugs: parentId,
    })
    const childId = await processTopicRow(admin, childRow)

    const parents = await getTopicParents(childId)
    expect(parents.some(p => p.id === parentId)).toBe(false)
  })

  it('creates referral program with validation rules and company link', async () => {
    const suffix = randomSuffix()
    const companySlug = `acme-corp-${suffix}`
    const programSlug = `acme-referral-${suffix}`
    const validationSlug = `acme_referral_${suffix}`

    // Create company topic first
    const companyRow = await makeRow(admin, {
      slug: companySlug,
      name: `Acme Corp ${suffix}`,
      topic_type: 'topic',
    })
    await processTopicRow(admin, companyRow)

    // Process referral program row
    const programRow = await makeRow(admin, {
      slug: programSlug,
      name: `Acme Referral Program ${suffix}`,
      topic_type: 'referral_program',
      referral_validation_slug: validationSlug,
      referral_user_help_text: `Paste your Acme referral link ${suffix}`,
      referral_hostname: `join.acme-${suffix}.com`,
      referral_pathname: '/%',
      referral_example_url: `https://join.acme-${suffix}.com/abc123`,
      referral_company_slug: companySlug,
    })
    const topicId = await processTopicRow(admin, programRow)

    const topic = await getTopicByAny(topicId)
    expect(topic!.topic_type).toBe('referral_program')

    const attrs = await getReferralProgramAttributes(topic!)
    expect(attrs).not.toBeNull()
    expect(attrs!.enabled_at).not.toBeNull()
    expect(attrs!.company_id).not.toBeNull()
    expect(attrs!.referral_program_link_validation_ids).toHaveLength(1)

    const validation = await getReferralLinkValidationBySlug(validationSlug)
    expect(validation).not.toBeNull()
    expect(validation!.user_help_text).toBe(`Paste your Acme referral link ${suffix}`)

    const { results: rules } = await getReferralLinkValidationRules(validation!.id)
    expect(rules).toHaveLength(1)
    expect(rules[0]!.hostname).toBe(`join.acme-${suffix}.com`)
    expect(rules[0]!.pathname).toBe('/%')
    expect(rules[0]!.example_urls).toContain(`https://join.acme-${suffix}.com/abc123`)
  })

  it('referral program import is idempotent (same row processed twice)', async () => {
    const suffix = randomSuffix()
    const validationSlug = `idempotent_referral_${suffix}`

    const programRow = await makeRow(admin, {
      slug: `idempotent-referral-${suffix}`,
      name: `Idempotent Referral Program ${suffix}`,
      topic_type: 'referral_program',
      referral_validation_slug: validationSlug,
      referral_user_help_text: 'Paste your referral link',
      referral_hostname: `ref-${suffix}.example.com`,
      referral_pathname: '/r/%',
      referral_example_url: `https://ref-${suffix}.example.com/r/abc`,
    })

    const topicId1 = await processTopicRow(admin, programRow)
    const topicId2 = await processTopicRow(admin, programRow)

    expect(topicId1).toBe(topicId2)

    const topic = await getTopicByAny(topicId1)
    const attrs = await getReferralProgramAttributes(topic!)
    expect(attrs).not.toBeNull()
    // Only one validation should be linked even after two runs
    expect(attrs!.referral_program_link_validation_ids).toHaveLength(1)

    // Only one rule should exist even after two runs
    const validation = await getReferralLinkValidationBySlug(validationSlug)
    const { results: rules } = await getReferralLinkValidationRules(validation!.id)
    expect(rules).toHaveLength(1)
  })
})
