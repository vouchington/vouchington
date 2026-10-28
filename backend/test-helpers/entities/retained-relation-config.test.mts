import { describe, expect, it, vi } from 'vitest'
import {
  entityRelationMetadatum,
  getEntityRelationIntegrityTargetColumn,
} from '@voucha/types/entities/entity-relations-metadata'
import { getRetainedRelationConfig } from './retained-relation-config.mts'

describe('retained relation fixture configuration', () => {
  // Schema generators consume this canonical metadata; the literal fixture registry must track it.
  it.each(entityRelationMetadatum.filter(metadata => metadata.election))(
    'matches the canonical elected family $table_name',
    metadata => {
      expect(getRetainedRelationConfig(metadata.table_name)).toEqual({
        retainedTable: `retained_${metadata.table_name}`,
        integrityTargetColumn: getEntityRelationIntegrityTargetColumn(metadata),
      })
    },
  )

  it.each(entityRelationMetadatum.filter(metadata => !metadata.election))(
    'rejects the canonical non-elected family $table_name',
    metadata => {
      expect(() => getRetainedRelationConfig(metadata.table_name)).toThrow(
        'Unknown elected relation table:',
      )
    },
  )

  it.each(entityRelationMetadatum.filter(metadata => metadata.election).map(row => row.table_name))(
    'keeps the %s SQL identifiers immutable',
    relationTable => {
      const config = getRetainedRelationConfig(relationTable)
      expect(Reflect.set(config, 'retainedTable', 'untrusted_table')).toBe(false)
      expect(Reflect.set(config, 'integrityTargetColumn', 'untrusted_column')).toBe(false)
      expect(getRetainedRelationConfig(relationTable)).toEqual({
        retainedTable: `retained_${relationTable}`,
        integrityTargetColumn: `${relationTable}_id`,
      })
    },
  )

  it.each(['constructor', 'toString', '__proto__', 'unknown', ''])(
    'rejects an inherited or unknown selector %s',
    relationTable => {
      expect(() => getRetainedRelationConfig(relationTable)).toThrow(
        'Unknown elected relation table:',
      )
    },
  )

  it('rejects non-string selectors without coercion', () => {
    const coerce = vi.fn<() => string>(() => 'relation__post__category__topic')
    const objectKey = { [Symbol.toPrimitive]: coerce }
    for (const key of [undefined, null, true, 1, Symbol('relation'), ['relation'], objectKey]) {
      expect(() => getRetainedRelationConfig(key as unknown as string)).toThrow(
        'Invalid retained relation table',
      )
    }
    expect(coerce).not.toHaveBeenCalled()
  })
})
