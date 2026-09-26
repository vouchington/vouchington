import { describe, expect, it } from 'vitest'
import { isIgnoredForNameInflection } from '../../../test-helpers/data-stores/psql/schema-static-analysis/name-helpers.mts'
import { isAllowedUuidConventionViolation } from '../../../test-helpers/data-stores/psql/schema-static-analysis/conventions.mts'

describe('publication cleanup schema policy', () => {
  it('exempts only the checked singleton and its deletion-stable cursor', () => {
    expect(isIgnoredForNameInflection('post_publication_identity_cleanup_progress')).toBe(true)
    expect(isIgnoredForNameInflection('post_publication_identity_cleanup_attempt')).toBe(false)
    expect(
      isAllowedUuidConventionViolation({
        table_name: 'post_publication_identity_cleanup_progress',
        column_name: 'cursor_snapshot_id',
        problem: 'uuid-column-without-key',
      }),
    ).toBe(true)
    expect(
      isAllowedUuidConventionViolation({
        table_name: 'post_publication_identity_cleanup_progress',
        column_name: 'snapshot_id',
        problem: 'uuid-column-without-key',
      }),
    ).toBe(false)
  })
})
