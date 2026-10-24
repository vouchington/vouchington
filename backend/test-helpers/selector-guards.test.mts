import { describe, expect, it } from 'vitest'
import { countTestRelationRows } from './data-stores/psql/moderation-admission-relations.mts'
import {
  hasTestRetainedIdentityRoot,
  readTestRetainedIdentityTraversalBound,
} from './entities/retained-identities.mts'
import { setTestPostClearanceStatus } from './entities/post-clearance.mts'

describe('test fixture selector guards', () => {
  it('rejects an unknown retained identity family before a query', async () => {
    const family = 'unexpected' as Parameters<typeof hasTestRetainedIdentityRoot>[0]

    await expect(hasTestRetainedIdentityRoot(family, 'unused-id')).rejects.toThrow(
      'Unknown retained identity family',
    )
    await expect(readTestRetainedIdentityTraversalBound(family, 10)).rejects.toThrow(
      'Unknown retained identity family',
    )
  })

  it('rejects an unknown clearance status before a write', async () => {
    const status = 'unexpected' as Parameters<typeof setTestPostClearanceStatus>[1]

    await expect(setTestPostClearanceStatus('unused-id', status)).rejects.toThrow(
      'Unknown clearance status',
    )
  })

  it('rejects an unknown moderation relation before a read', async () => {
    const relation = 'unexpected' as Parameters<typeof countTestRelationRows>[0]

    await expect(countTestRelationRows(relation, 'unused-id')).rejects.toThrow('Unknown relation')
  })
})
