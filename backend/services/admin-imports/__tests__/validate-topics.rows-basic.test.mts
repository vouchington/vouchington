import { describe, it, expect } from 'vitest'
import { validateTopicRows } from '../validate-topics.mts'

const randomSuffix = () => Math.random().toString(36).slice(2, 10)

describe('validateTopicRows (basic)', () => {
  it('accepts valid topic rows with slug only', () => {
    const suffix = randomSuffix()
    const result = validateTopicRows([
      { slug: `topic-a-${suffix}`, name: `Topic A ${suffix}`, topic_type: 'topic' },
      { slug: `topic-b-${suffix}`, name: '' },
    ])
    expect(result.valid).toBe(true)
    expect(result.rows).toHaveLength(2)
    expect(result.rows.every(r => r.valid)).toBe(true)
  })

  it('rejects rows missing slug', () => {
    const result = validateTopicRows([{ slug: '', name: 'Some Name' }])
    expect(result.valid).toBe(false)
    expect(result.rows[0].errors).toContain('slug is required')
  })

  it('rejects slugs with uppercase letters', () => {
    const result = validateTopicRows([{ slug: 'Invalid-Slug', name: 'Some Name' }])
    expect(result.valid).toBe(false)
    expect(result.rows[0].errors[0]).toMatch(/lowercase/)
  })

  it('rejects slugs with special characters', () => {
    const result = validateTopicRows([{ slug: 'invalid slug!', name: 'Some Name' }])
    expect(result.valid).toBe(false)
    expect(result.rows[0].errors[0]).toMatch(/lowercase/)
  })

  it('rejects duplicate slugs within the batch', () => {
    const slug = `dup-slug-${randomSuffix()}`
    const result = validateTopicRows([
      { slug, name: 'Name A' },
      { slug, name: 'Name B' },
    ])
    expect(result.valid).toBe(false)
    const dupRow = result.rows.find(r => r.errors.some(e => e.includes('duplicated')))
    expect(dupRow).toBeDefined()
  })

  it('rejects invalid topic_type', () => {
    const result = validateTopicRows([
      { slug: `slug-${randomSuffix()}`, topic_type: 'not_a_valid_type' },
    ])
    expect(result.valid).toBe(false)
    expect(result.rows[0].errors[0]).toMatch(/topic_type must be one of/)
  })

  it('accepts valid topic types', () => {
    const suffix = randomSuffix()
    const result = validateTopicRows([{ slug: `card-${suffix}`, topic_type: 'card' }])
    expect(result.valid).toBe(true)
  })

  it('rejects topic_type=fediverse_instance', () => {
    const result = validateTopicRows([
      { slug: `instance-${randomSuffix()}`, topic_type: 'fediverse_instance' },
    ])
    expect(result.valid).toBe(false)
    expect(result.rows[0].errors).toContain(
      'topic_type=fediverse_instance is not supported by CSV import',
    )
  })

  it('rejects name longer than 200 characters', () => {
    const result = validateTopicRows([{ slug: `slug-${randomSuffix()}`, name: 'a'.repeat(201) }])
    expect(result.valid).toBe(false)
    expect(result.rows[0].errors[0]).toMatch(/200 characters/)
  })

  it('returns per-row errors for mixed valid/invalid batch', () => {
    const suffix = randomSuffix()
    const result = validateTopicRows([
      { slug: `good-${suffix}`, name: `Good Topic ${suffix}` },
      { slug: '', name: 'No Slug' },
    ])
    expect(result.valid).toBe(false)
    expect(result.rows[0].valid).toBe(true)
    expect(result.rows[1].valid).toBe(false)
    expect(result.rows[1].errors).toContain('slug is required')
  })

  it('accepts row with only slug (minimal row)', () => {
    const suffix = randomSuffix()
    const result = validateTopicRows([{ slug: `minimal-${suffix}` }])
    expect(result.valid).toBe(true)
  })

  it('accepts aliases, parent_slugs, and notes columns', () => {
    const suffix = randomSuffix()
    const result = validateTopicRows([
      {
        slug: `topic-${suffix}`,
        name: `Topic ${suffix}`,
        aliases: 'Alias One|Alias Two',
        parent_slugs: 'parent-a|parent-b',
        notes: 'Some human-readable notes',
      },
    ])
    expect(result.valid).toBe(true)
  })

  it('accepts full seed CSV row format for a plain topic', () => {
    const suffix = randomSuffix()
    const result = validateTopicRows([
      {
        slug: `topic-${suffix}`,
        name: `Topic ${suffix}`,
        topic_type: 'topic',
        aliases: 'Alt Name',
        parent_slugs: 'parent-topic',
        extensions: '',
        notes: 'Top-level vertical',
      },
    ])
    expect(result.valid).toBe(true)
  })
})
