import { describe, expect, it, vi } from 'vitest'
import { entityRelationMetadatum } from '@voucha/types/entities/entity-relations-metadata'
import {
  getTestEntityRelationTable,
  getTestEntityRelationVoteTable,
} from './entity-relation-fixture-tables.mts'

describe('live relation fixture tables', () => {
  // Schema generators consume this metadata; fixture literals must preserve every family.
  it.each(entityRelationMetadatum)('accepts canonical relation $table_name', metadata => {
    expect(getTestEntityRelationTable(metadata.table_name)).toBe(metadata.table_name)
  })

  it.each(entityRelationMetadatum.filter(metadata => metadata.election))(
    'preserves the canonical elected vote table $table_name',
    metadata => {
      expect(getTestEntityRelationVoteTable(metadata.table_name)).toBe(
        `${metadata.table_name}__votes`,
      )
    },
  )

  it.each(entityRelationMetadatum.filter(metadata => !metadata.election))(
    'rejects non-elected vote family $table_name',
    metadata => {
      expect(() => getTestEntityRelationVoteTable(metadata.table_name)).toThrow(
        'Invalid election relation:',
      )
    },
  )

  it.each(['constructor', 'toString', '__proto__', 'unknown', ''])(
    'rejects inherited or unknown key %s',
    key => {
      expect(() => getTestEntityRelationTable(key)).toThrow('Invalid relation table name:')
      expect(() => getTestEntityRelationVoteTable(key)).toThrow('Invalid election relation:')
    },
  )

  it('rejects non-string selectors without coercing them into table names', () => {
    const coerce = vi.fn<() => string>(() => 'relation__post__category__topic')
    const objectKey = { [Symbol.toPrimitive]: coerce }
    for (const key of [undefined, null, true, 1, Symbol('relation'), ['relation'], objectKey]) {
      expect(() => getTestEntityRelationTable(key as unknown as string)).toThrow(
        'Invalid relation table type',
      )
      expect(() => getTestEntityRelationVoteTable(key as unknown as string)).toThrow(
        'Invalid election relation type',
      )
    }
    expect(coerce).not.toHaveBeenCalled()
  })
})
