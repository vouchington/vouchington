import { describe, expect, it } from 'vitest'
import {
  buildOrderedInputCtes,
  normalizeBatchIdentifiers,
  partitionBatchIdentifiers,
  scatterOrderedRows,
} from './ordered-identifiers.mts'

describe('ordered batch identifier helpers', () => {
  it('normalizes identifiers with original indexes', () => {
    const normalized = normalizeBatchIdentifiers([' Alpha ', 'BETA'], input => ({
      value: input.trim().toLowerCase(),
      type: 'slug',
    }))

    expect(normalized).toEqual([
      { value: 'alpha', type: 'slug', index: 0 },
      { value: 'beta', type: 'slug', index: 1 },
    ])
  })

  it('partitions normalized identifiers by type while preserving partition order', () => {
    const normalized = normalizeBatchIdentifiers(['id-1', 'slug-1', 'id-2'], (input, index) => ({
      value: input,
      type: index === 1 ? 'slug' : 'id',
    }))

    const partitions = partitionBatchIdentifiers(normalized)

    expect(partitions.get('id')).toEqual([
      { value: 'id-1', type: 'id', index: 0 },
      { value: 'id-2', type: 'id', index: 2 },
    ])
    expect(partitions.get('slug')).toEqual([{ value: 'slug-1', type: 'slug', index: 1 }])
  })

  it('builds ordered SQL input CTEs and matching value arrays', () => {
    const normalized = normalizeBatchIdentifiers(
      ['00000000-0000-0000-0000-000000000001', 'host.example'],
      (input, index) => ({
        value: input,
        type: index === 0 ? 'id' : 'hostname',
      }),
    )
    const partitions = partitionBatchIdentifiers(normalized)

    const inputCtes = buildOrderedInputCtes([
      { cteName: 'id_input', sqlType: 'uuid', inputs: partitions.get('id') ?? [] },
      { cteName: 'hostname_input', sqlType: 'text', inputs: partitions.get('hostname') ?? [] },
    ])

    expect(inputCtes.values).toEqual([
      ['00000000-0000-0000-0000-000000000001'],
      [0],
      ['host.example'],
      [1],
    ])
    expect(inputCtes.ctes).toContain('id_input AS')
    expect(inputCtes.ctes).toContain('unnest($1::uuid[])')
    expect(inputCtes.ctes).toContain('hostname_input AS')
    expect(inputCtes.ctes).toContain('unnest($3::text[])')
  })

  it('scatters rows into caller order with nulls for missing rows and duplicate values preserved', () => {
    const rows = [
      { input_order: 2, value: 'third' },
      { input_order: 0, value: 'first' },
    ]

    const results = scatterOrderedRows(4, rows, row => row.value)

    expect(results).toEqual(['first', null, 'third', null])
  })

  it('throws on invalid input_order values', () => {
    expect(() =>
      scatterOrderedRows(1, [{ input_order: 1, value: 'bad' }], row => row.value),
    ).toThrow('Invalid input_order')
  })
})
