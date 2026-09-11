import { describe, it, expect } from 'vitest'
import { validateTopicRows } from '../validate-topics.mts'

const randomSuffix = () => Math.random().toString(36).slice(2, 10)

describe('validateTopicRows (extensions)', () => {
  it('accepts valid extensions', () => {
    const suffix = randomSuffix()
    const result = validateTopicRows([{ slug: `topic-${suffix}`, extensions: 'spending_category' }])
    expect(result.valid).toBe(true)
  })

  it('accepts multiple valid extensions', () => {
    const suffix = randomSuffix()
    const result = validateTopicRows([
      { slug: `topic-${suffix}`, extensions: 'spending_category|retailer' },
    ])
    expect(result.valid).toBe(true)
  })

  it('rejects invalid extension values', () => {
    const suffix = randomSuffix()
    const result = validateTopicRows([{ slug: `topic-${suffix}`, extensions: 'invalid_extension' }])
    expect(result.valid).toBe(false)
    expect(result.rows[0].errors[0]).toMatch(/extensions contains invalid value/)
  })

  it('rejects mixed valid and invalid extensions', () => {
    const suffix = randomSuffix()
    const result = validateTopicRows([
      { slug: `topic-${suffix}`, extensions: 'spending_category|bogus' },
    ])
    expect(result.valid).toBe(false)
    expect(result.rows[0].errors[0]).toMatch(/bogus/)
  })

  it('accepts retailer extension for the default topic type', () => {
    const suffix = randomSuffix()
    const result = validateTopicRows([
      { slug: `topic-${suffix}`, topic_type: 'topic', extensions: 'retailer' },
    ])
    expect(result.valid).toBe(true)
  })

  it('accepts retailer extension regardless of topic_type', () => {
    const suffix = randomSuffix()
    const result = validateTopicRows([
      { slug: `topic-${suffix}`, topic_type: 'card', extensions: 'retailer' },
    ])
    expect(result.valid).toBe(true)
  })

  it('ignores empty extensions', () => {
    const suffix = randomSuffix()
    const result = validateTopicRows([{ slug: `topic-${suffix}`, extensions: '' }])
    expect(result.valid).toBe(true)
  })
})

describe('validateTopicRows (referral_program)', () => {
  it('rejects referral-only fields on non-referral topics', () => {
    const suffix = randomSuffix()
    const result = validateTopicRows([
      {
        slug: `topic-${suffix}`,
        topic_type: 'topic',
        referral_validation_slug: `valid_${suffix}`,
      },
    ])

    expect(result.valid).toBe(false)
    expect(result.rows[0].errors).toContain(
      'referral_validation_slug must be empty for topic_type other than referral_program',
    )
  })

  it('rejects invalid referral company slugs', () => {
    const suffix = randomSuffix()
    const result = validateTopicRows([
      {
        slug: `referral-${suffix}`,
        topic_type: 'referral_program',
        referral_validation_slug: `valid_${suffix}`,
        referral_hostname: 'example.com',
        referral_pathname: '/signup',
        referral_company_slug: 'Invalid Slug',
      },
    ])

    expect(result.valid).toBe(false)
    expect(result.rows[0].errors).toEqual(['referral_company_slug must be a valid slug'])
  })

  it('rejects missing and malformed referral program required fields', () => {
    const suffix = randomSuffix()
    const result = validateTopicRows([
      {
        slug: `referral-missing-${suffix}`,
        topic_type: 'referral_program',
      },
      {
        slug: `referral-invalid-${suffix}`,
        topic_type: 'referral_program',
        referral_validation_slug: 'Invalid-Slug',
        referral_hostname: 'example.com',
        referral_pathname: '/signup',
      },
    ])

    expect(result.valid).toBe(false)
    expect(result.rows[0].errors).toEqual([
      'referral_validation_slug is required for topic_type=referral_program',
      'referral_hostname is required for topic_type=referral_program',
      'referral_pathname is required for topic_type=referral_program',
    ])
    expect(result.rows[1].errors).toEqual(['referral_validation_slug must match ^[a-z0-9_]+$'])
  })

  it('rejects duplicate referral validation slugs in a batch', () => {
    const suffix = randomSuffix()
    const validationSlug = `valid_${suffix}`
    const rows = [1, 2].map(index => ({
      slug: `referral-${index}-${suffix}`,
      topic_type: 'referral_program',
      referral_validation_slug: validationSlug,
      referral_hostname: 'example.com',
      referral_pathname: '/signup',
    }))

    const result = validateTopicRows(rows)

    expect(result.valid).toBe(false)
    expect(result.rows[0].errors).toEqual([])
    expect(result.rows[1].errors).toEqual([
      `referral_validation_slug "${validationSlug}" is duplicated in this batch`,
    ])
  })

  it('accepts referral_example_url fragments for referral program topic', () => {
    const suffix = randomSuffix()
    const result = validateTopicRows([
      {
        slug: `referral-${suffix}`,
        topic_type: 'referral_program',
        referral_validation_slug: `valid_${suffix}`,
        referral_hostname: 'example.com',
        referral_pathname: '/signup',
        referral_example_url: 'https://example.com/signup#section',
      },
    ])
    expect(result.valid).toBe(true)
  })

  it('rejects invalid referral_example_url for referral program topic', () => {
    const suffix = randomSuffix()
    const result = validateTopicRows([
      {
        slug: `referral-${suffix}`,
        topic_type: 'referral_program',
        referral_validation_slug: `valid_${suffix}`,
        referral_hostname: 'example.com',
        referral_pathname: '/signup',
        referral_example_url: 'not-a-url',
      },
    ])
    expect(result.valid).toBe(false)
    expect(result.rows[0].errors).toEqual(['referral_example_url must be a valid URL'])
  })

  it('rejects malformed parseable referral_example_url values', () => {
    const suffix = randomSuffix()
    const result = validateTopicRows([
      {
        slug: `referral-${suffix}`,
        topic_type: 'referral_program',
        referral_validation_slug: `valid_${suffix}`,
        referral_hostname: 'example.com',
        referral_pathname: '/signup',
        referral_example_url: 'https:foo',
      },
      {
        slug: `referral-extra-${suffix}`,
        topic_type: 'referral_program',
        referral_validation_slug: `valid_extra_${suffix}`,
        referral_hostname: 'example.com',
        referral_pathname: '/signup',
        referral_example_url: 'https:///signup',
      },
    ])
    expect(result.valid).toBe(false)
    expect(result.rows[0].errors).toEqual(['referral_example_url must be a valid URL'])
    expect(result.rows[1].errors).toEqual(['referral_example_url must be a valid URL'])
  })
})
