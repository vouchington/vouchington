import { describe, expect, it } from 'vitest'

import { normalizeExtensionVersionsForLiveComparison } from './verify-live-schema.mts'
import type { SchemaSnapshot } from '@vouchington/postgres/pg-schema-snapshot'

function emptySnapshot(extensions: SchemaSnapshot['extensions']): SchemaSnapshot {
  return {
    formatVersion: 2,
    tables: {},
    views: {},
    enums: {},
    extensions,
    functions: {},
    policies: {},
  }
}

describe('normalizeExtensionVersionsForLiveComparison', () => {
  it('replaces every extension version with a constant placeholder', () => {
    const snapshot = emptySnapshot({
      vector: { version: '0.8.1' },
      pgcrypto: { version: '1.3' },
    })

    expect(normalizeExtensionVersionsForLiveComparison(snapshot).extensions).toEqual({
      vector: { version: 'platform-provisioned' },
      pgcrypto: { version: 'platform-provisioned' },
    })
  })

  it('preserves extension presence -- keys are unchanged even when versions differ', () => {
    const snapshot = emptySnapshot({ vector: { version: '0.8.1' } })
    const otherSnapshot = emptySnapshot({ vector: { version: '0.8.6' } })

    expect(Object.keys(normalizeExtensionVersionsForLiveComparison(snapshot).extensions)).toEqual(
      Object.keys(normalizeExtensionVersionsForLiveComparison(otherSnapshot).extensions),
    )
  })

  it('leaves every other snapshot section untouched', () => {
    const snapshot: SchemaSnapshot = {
      ...emptySnapshot({ vector: { version: '0.8.1' } }),
      views: { widgets_view: { definition: 'SELECT 1', comment: null, materialized: false } },
    }

    expect(normalizeExtensionVersionsForLiveComparison(snapshot).views).toBe(snapshot.views)
  })
})
