import { describe, it, expect } from 'vitest'
import { validateCrmContactHeaders, validateCrmContactRows } from './validate-crm-contacts.mts'

const r = () => Math.random().toString(36).slice(2, 10)

describe('validateCrmContactHeaders', () => {
  it('accepts all known columns', () => {
    const unknown = validateCrmContactHeaders([
      'name',
      'email',
      'phone',
      'vertical',
      'follower_count',
      'instagram',
      'tiktok',
      'youtube',
      'x',
      'linkedin',
      'notes',
    ])
    expect(unknown).toHaveLength(0)
  })

  it('accepts minimal columns', () => {
    const unknown = validateCrmContactHeaders(['name', 'email'])
    expect(unknown).toHaveLength(0)
  })

  it('returns unknown columns', () => {
    const unknown = validateCrmContactHeaders(['name', 'email', 'unknown_field'])
    expect(unknown).toEqual(['unknown_field'])
  })

  it('returns multiple unknown columns', () => {
    const unknown = validateCrmContactHeaders(['name', 'foo', 'bar'])
    expect(unknown).toEqual(['foo', 'bar'])
  })
})

describe('validateCrmContactRows', () => {
  it('accepts a valid row with name and email', () => {
    const suffix = r()
    const result = validateCrmContactRows([
      { name: `Test Contact ${suffix}`, email: `tests+test-${suffix}@voucha.ai` },
    ])
    expect(result.valid).toBe(true)
    expect(result.rows[0].valid).toBe(true)
    expect(result.rows[0].errors).toHaveLength(0)
  })

  it('accepts all optional fields', () => {
    const suffix = r()
    const result = validateCrmContactRows([
      {
        name: `Full Contact ${suffix}`,
        email: `tests+full-${suffix}@voucha.ai`,
        phone: '+1234567890',
        vertical: 'travel',
        follower_count: '10000',
        instagram: `@ig_${suffix}`,
        tiktok: `@tt_${suffix}`,
        youtube: `@yt_${suffix}`,
        x: `@x_${suffix}`,
        linkedin: `@li_${suffix}`,
        notes: 'Some notes',
      },
    ])
    expect(result.valid).toBe(true)
  })

  it('rejects rows missing name', () => {
    const suffix = r()
    const result = validateCrmContactRows([{ name: '', email: `tests+test-${suffix}@voucha.ai` }])
    expect(result.valid).toBe(false)
    expect(result.rows[0].errors).toContain('name is required')
  })

  it('rejects rows missing email', () => {
    const suffix = r()
    const result = validateCrmContactRows([{ name: `Name ${suffix}`, email: '' }])
    expect(result.valid).toBe(false)
    expect(result.rows[0].errors).toContain('email is required')
  })

  it('rejects invalid email format', () => {
    const suffix = r()
    const result = validateCrmContactRows([{ name: `Name ${suffix}`, email: 'not-an-email' }])
    expect(result.valid).toBe(false)
    expect(result.rows[0].errors[0]).toMatch(/valid email/)
  })

  it('rejects name longer than 500 characters', () => {
    const suffix = r()
    const result = validateCrmContactRows([
      { name: 'a'.repeat(501), email: `tests+test-${suffix}@voucha.ai` },
    ])
    expect(result.valid).toBe(false)
    expect(result.rows[0].errors[0]).toMatch(/500 characters/)
  })

  it('rejects email longer than 320 characters', () => {
    const localPart = 'a'.repeat(310)
    const result = validateCrmContactRows([
      { name: 'Test Name', email: `tests+${localPart}@voucha.ai` },
    ])
    expect(result.valid).toBe(false)
    expect(result.rows[0].errors[0]).toMatch(/320 characters/)
  })

  it('rejects invalid vertical', () => {
    const suffix = r()
    const result = validateCrmContactRows([
      {
        name: `Name ${suffix}`,
        email: `tests+test-${suffix}@voucha.ai`,
        vertical: 'invalid_vertical',
      },
    ])
    expect(result.valid).toBe(false)
    expect(result.rows[0].errors[0]).toMatch(/vertical must be one of/)
  })

  it('accepts valid verticals', () => {
    const suffix = r()
    for (const vertical of [
      'credit_cards',
      'travel',
      'cars',
      'ai',
      'technology',
      'finance',
      'lifestyle',
      'other',
    ]) {
      const result = validateCrmContactRows([
        { name: `Name ${suffix}`, email: `tests+${vertical}-${suffix}@voucha.ai`, vertical },
      ])
      expect(result.valid).toBe(true)
    }
  })

  it('rejects non-integer follower_count', () => {
    const suffix = r()
    const result = validateCrmContactRows([
      { name: `Name ${suffix}`, email: `tests+test-${suffix}@voucha.ai`, follower_count: '3.5' },
    ])
    expect(result.valid).toBe(false)
    expect(result.rows[0].errors[0]).toMatch(/non-negative integer/)
  })

  it('rejects negative follower_count', () => {
    const suffix = r()
    const result = validateCrmContactRows([
      { name: `Name ${suffix}`, email: `tests+test-${suffix}@voucha.ai`, follower_count: '-1' },
    ])
    expect(result.valid).toBe(false)
    expect(result.rows[0].errors[0]).toMatch(/non-negative integer/)
  })

  it('accepts valid follower_count', () => {
    const suffix = r()
    const result = validateCrmContactRows([
      { name: `Name ${suffix}`, email: `tests+test-${suffix}@voucha.ai`, follower_count: '50000' },
    ])
    expect(result.valid).toBe(true)
  })

  it('rejects duplicate emails in batch', () => {
    const suffix = r()
    const email = `tests+dup-${suffix}@voucha.ai`
    const result = validateCrmContactRows([
      { name: `Contact A ${suffix}`, email },
      { name: `Contact B ${suffix}`, email },
    ])
    expect(result.valid).toBe(false)
    const dupRow = result.rows.find(row => row.errors.some(e => e.includes('duplicated')))
    expect(dupRow).toBeDefined()
  })

  it('rejects social handle longer than 200 characters', () => {
    const suffix = r()
    const result = validateCrmContactRows([
      {
        name: `Name ${suffix}`,
        email: `tests+test-${suffix}@voucha.ai`,
        instagram: 'a'.repeat(201),
      },
    ])
    expect(result.valid).toBe(false)
    expect(result.rows[0].errors[0]).toMatch(/instagram handle must be at most 200 characters/)
  })

  it('returns per-row errors for mixed valid/invalid batch', () => {
    const suffix = r()
    const result = validateCrmContactRows([
      { name: `Good Contact ${suffix}`, email: `tests+good-${suffix}@voucha.ai` },
      { name: '', email: `tests+bad-${suffix}@voucha.ai` },
      { name: `Another Good ${suffix}`, email: `tests+another-${suffix}@voucha.ai` },
    ])
    expect(result.valid).toBe(false)
    expect(result.rows[0].valid).toBe(true)
    expect(result.rows[1].valid).toBe(false)
    expect(result.rows[1].errors).toContain('name is required')
    expect(result.rows[2].valid).toBe(true)
  })

  it('validates multiple rows all valid', () => {
    const suffix = r()
    const result = validateCrmContactRows([
      { name: `Contact 1 ${suffix}`, email: `tests+contact1-${suffix}@voucha.ai` },
      { name: `Contact 2 ${suffix}`, email: `tests+contact2-${suffix}@voucha.ai` },
      { name: `Contact 3 ${suffix}`, email: `tests+contact3-${suffix}@voucha.ai` },
    ])
    expect(result.valid).toBe(true)
    expect(result.rows.every(row => row.valid)).toBe(true)
  })
})
