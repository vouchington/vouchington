import { describe, expect, it } from 'vitest'
import { queryOrderedIdentifierBatch } from './ordered-query.mts'

describe('queryOrderedIdentifierBatch', () => {
  it('returns an empty array without reading rows when there are no identifiers', async () => {
    const results = await queryOrderedIdentifierBatch<string, 'id', undefined>([], undefined, {
      normalize: input => ({ value: input, type: 'id' }),
      partitions: [{ cteName: 'id_input', sqlType: 'uuid', type: 'id' }],
      statement: () => 'unused',
      readRows: () => Promise.reject(new Error('readRows should not run')),
    })

    expect(results).toEqual([])
  })

  it('builds ordered input CTEs and scatters rows without input_order', async () => {
    let seenSql = ''
    let seenValues: unknown[] = []

    const results = await queryOrderedIdentifierBatch<
      { id: string },
      'id' | 'slug',
      { label: string }
    >(
      ['slug-b', 'id-a'],
      { label: 'options' },
      {
        normalize: (input, index) => ({
          value: input,
          type: index === 1 ? 'id' : 'slug',
        }),
        partitions: [
          { cteName: 'id_input', sqlType: 'uuid', type: 'id' },
          { cteName: 'slug_input', sqlType: 'text', type: 'slug' },
        ],
        statement: inputCtes => `WITH ${inputCtes}, body`,
        readRows: (sql, values, options) => {
          expect(options).toEqual({ label: 'options' })
          seenSql = sql
          seenValues = values
          return Promise.resolve([{ id: 'row-a', input_order: 1 }])
        },
      },
    )

    expect(seenSql).toContain('id_input AS')
    expect(seenSql).toContain('unnest($1::uuid[])')
    expect(seenSql).toContain('slug_input AS')
    expect(seenSql).toContain('unnest($3::text[])')
    expect(seenSql).toContain(', body')
    expect(seenValues).toEqual([['id-a'], [1], ['slug-b'], [0]])
    expect(results).toEqual([null, { id: 'row-a' }])
    expect(results[1]).not.toHaveProperty('input_order')
  })
})
