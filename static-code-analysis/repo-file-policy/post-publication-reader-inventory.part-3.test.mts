import { beforeAll, describe, expect, it } from 'vitest'
import { checkPostPublicationReaderInventory } from './post-publication-reader-inventory.mts'
import { discoverPublicPostReaders } from './post-publication-reader-inventory-source.mts'
import {
  canonicalBuilder,
  inventoryPath,
  makeContext,
} from './post-publication-reader-inventory.test-support.mts'
import { initSqlAst } from './sql-ast.mts'

describe('post-publication reader inventory', () => {
  beforeAll(() => initSqlAst())

  it('accepts a correlated eligibility EXISTS clause appended to its reader query', () => {
    const errors: string[] = []
    const direct = `import { read } from '@data-stores/psql'
const query = sql\`
            SELECT p.id
            FROM posts p
            WHERE p.deleted_at IS NULL
          \`
query.append(sql\`
  AND EXISTS (
    SELECT 1
    FROM view_public_post_eligibility eligibility
    WHERE eligibility.post_id = p.id
  )
\`)
read(query)`
    checkPostPublicationReaderInventory(
      makeContext(
        {
          version: 1,
          canonical_builder: canonicalBuilder,
          implemented: [{ path: 'backend/direct.mts', classification: 'public-view' }],
          pr2_baseline: [],
          classified_exceptions: [],
        },
        { direct },
      ),
      errors,
    )
    expect(errors).toEqual([])
  })

  it('rejects an unclassified reader added to a public surface', () => {
    const errors: string[] = []
    const unclassified = 'backend/services/posts/search/new-reader.mts'
    checkPostPublicationReaderInventory(
      makeContext(
        {
          version: 1,
          canonical_builder: canonicalBuilder,
          implemented: [{ path: 'backend/direct.mts', classification: 'direct-sql' }],
          pr2_baseline: [],
          classified_exceptions: [],
        },
        { extra: [unclassified, 'const query = sql`SELECT posts.id FROM posts`'] },
      ),
      errors,
    )
    expect(errors).toContain(`${inventoryPath}: unclassified public post reader ${unclassified}`)
  })

  it('rejects an unclassified post reader added to an API route', () => {
    const errors: string[] = []
    const unclassified = 'backend/api/v1/posts/new-reader.mts'
    checkPostPublicationReaderInventory(
      makeContext(
        {
          version: 1,
          canonical_builder: canonicalBuilder,
          implemented: [{ path: 'backend/direct.mts', classification: 'direct-sql' }],
          pr2_baseline: [],
          classified_exceptions: [],
        },
        { extra: [unclassified, 'const query = sql`SELECT posts.id FROM posts`'] },
      ),
      errors,
    )
    expect(errors).toContain(`${inventoryPath}: unclassified public post reader ${unclassified}`)
  })

  it('discovers post metrics readers outside the search subtree', () => {
    const context = makeContext(
      {
        version: 1,
        canonical_builder: canonicalBuilder,
        implemented: [{ path: 'backend/direct.mts', classification: 'direct-sql' }],
        pr2_baseline: [],
        classified_exceptions: [],
      },
      {
        extras: [
          ['backend/services/posts/metrics.mts', 'const query = sql`SELECT posts.id FROM posts`'],
          [
            'backend/services/posts/metrics-batch.mts',
            'const query = sql`SELECT posts.id FROM posts`',
          ],
        ],
      },
    )
    expect(discoverPublicPostReaders(context)).toEqual([
      'backend/services/posts/metrics.mts',
      'backend/services/posts/metrics-batch.mts',
    ])
  })

  it('rejects duplicate and untracked migration paths', () => {
    const errors: string[] = []
    checkPostPublicationReaderInventory(
      makeContext({
        version: 1,
        canonical_builder: canonicalBuilder,
        implemented: [{ path: 'backend/direct.mts', classification: 'direct-boundary' }],
        pr2_baseline: [
          { path: 'backend/missing.mts', classification: 'public-reader' },
          { path: 'backend/missing.mts', classification: 'public-reader' },
        ],
        classified_exceptions: [],
      }),
      errors,
    )
    expect(errors).toContain(
      `${inventoryPath}: pr2_baseline references untracked path backend/missing.mts`,
    )
    expect(errors).toContain(`${inventoryPath}: pr2_baseline duplicates backend/missing.mts`)
  })

  it('rejects a classified exception without a structured owning classification', () => {
    const errors: string[] = []
    checkPostPublicationReaderInventory(
      makeContext({
        version: 1,
        canonical_builder: canonicalBuilder,
        implemented: [{ path: 'backend/direct.mts', classification: 'direct-sql' }],
        pr2_baseline: [],
        classified_exceptions: [
          {
            path: 'backend/reader.mts',
            classification: 'raw-hydrator',
            reason: 'Bogus free-text exception.',
          },
        ],
      }),
      errors,
    )
    expect(errors).toContain(
      `${inventoryPath}: classified_exceptions requires a reason and structured owner`,
    )
  })

  it('rejects a classified exception whose owner classification does not match inventory', () => {
    const errors: string[] = []
    checkPostPublicationReaderInventory(
      makeContext({
        version: 1,
        canonical_builder: canonicalBuilder,
        implemented: [{ path: 'backend/direct.mts', classification: 'direct-sql' }],
        pr2_baseline: [],
        classified_exceptions: [
          {
            path: 'backend/reader.mts',
            classification: 'raw-hydrator',
            reason: 'Bogus mismatched owner.',
            owner_path: 'backend/direct.mts',
            owner_classification: 'public-sql',
          },
        ],
      }),
      errors,
    )
    expect(errors).toContain(
      `${inventoryPath}: classified_exceptions owner classification must match backend/direct.mts`,
    )
  })

  it('rejects a nonempty PR 2 baseline', () => {
    const errors: string[] = []
    checkPostPublicationReaderInventory(
      makeContext({
        version: 1,
        canonical_builder: canonicalBuilder,
        implemented: [{ path: 'backend/direct.mts', classification: 'direct-sql' }],
        pr2_baseline: [{ path: 'backend/reader.mts', classification: 'public-reader' }],
        classified_exceptions: [],
      }),
      errors,
    )
    expect(errors).toContain(`${inventoryPath}: pr2_baseline must be empty after PR 2`)
  })

  it('fails safely when the inventory shape is malformed', () => {
    const errors: string[] = []
    checkPostPublicationReaderInventory(makeContext({}), errors)
    expect(errors).toEqual([
      `${inventoryPath}: expected an inventory object with all reader arrays`,
    ])
  })

  it('fails safely when an inventory row is malformed', () => {
    const errors: string[] = []
    checkPostPublicationReaderInventory(
      makeContext({
        version: 1,
        canonical_builder: canonicalBuilder,
        implemented: [null],
        pr2_baseline: [],
        classified_exceptions: [],
      }),
      errors,
    )
    expect(errors).toContain(`${inventoryPath}: implemented contains an invalid row`)
  })

  it('requires the inventory whenever the canonical builder is tracked', () => {
    const errors: string[] = []
    const context = makeContext({})
    const trackedFileSet = new Set(context.trackedFileSet)
    trackedFileSet.delete(inventoryPath)
    trackedFileSet.add(canonicalBuilder)
    checkPostPublicationReaderInventory({ ...context, trackedFileSet }, errors)
    expect(errors).toEqual([`${inventoryPath}: missing required post-publication reader inventory`])
  })
})
