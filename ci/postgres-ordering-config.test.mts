import { describe, expect, it } from 'vitest'

import {
  directiveInventory,
  scopedOrderingPaths,
  uncoveredOrderingPaths,
} from './postgres-ordering-policy.mts'

describe('PostgreSQL ordering policy predicates', () => {
  it('counts each directive in included production source, including SQL', () => {
    const sources = new Map([
      ['backend/services/writer.mts', '/* deadlock-safe */\n/* deadlock-safe */'],
      ['backend/data-stores/psql/config-driven/live.sql', '/* deadlock-safe */'],
      ['backend/services/writer.test.mts', '/* deadlock-safe */'],
      ['backend/services/ordinary.mts', 'select 1'],
    ])
    const included = scopedOrderingPaths([...sources.keys()], {
      include: ['backend/**/*.mts', 'backend/**/*.sql'],
      exclude: ['**/*.test.*'],
    })

    expect(directiveInventory(included, path => sources.get(path)!)).toEqual([
      'backend/data-stores/psql/config-driven/live.sql:1',
      'backend/services/writer.mts:2',
    ])
  })

  it('rejects an uncovered production writer while keeping test files out of the partition', () => {
    const files = [
      'backend/services/plain.mts',
      'backend/services/catalog.mts',
      'backend/services/plain.test.mts',
    ]
    const plain = {
      include: ['backend/**/*.mts'],
      exclude: ['backend/services/catalog.mts', '**/*.test.*'],
    }
    const catalog = {
      include: ['backend/services/catalog.mts'],
      exclude: ['**/*.test.*'],
    }

    expect(scopedOrderingPaths(files, plain)).toEqual(['backend/services/plain.mts'])
    expect(uncoveredOrderingPaths(files, plain, catalog)).toEqual([])
    expect(
      uncoveredOrderingPaths([...files, 'backend/services/orphan.ts'], plain, catalog),
    ).toEqual(['backend/services/orphan.ts'])
  })
})
