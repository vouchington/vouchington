import { beforeAll, describe, expect, it } from 'vitest'
import { checkPostPublicationReaderInventory } from './post-publication-reader-inventory.mts'
import {
  canonicalBuilder,
  inventoryPath,
  makeContext,
} from './post-publication-reader-inventory.test-support.mts'
import { initSqlAst } from './sql-ast.mts'

describe('post-publication reader inventory', () => {
  beforeAll(() => initSqlAst())

  it('requires mixed readers to compose public and viewer discovery predicates', () => {
    const errors: string[] = []
    checkPostPublicationReaderInventory(
      makeContext(
        {
          version: 1,
          canonical_builder: canonicalBuilder,
          implemented: [{ path: 'backend/direct.mts', classification: 'mixed-discovery-sql' }],
          pr2_baseline: [],
          classified_exceptions: [],
        },
        {
          direct:
            "import { buildPublicPostEligibilityFilter } from '@modules/feed-query-builders'\nbuildPublicPostEligibilityFilter()",
        },
      ),
      errors,
    )
    expect(errors).toContain(
      `${inventoryPath}: implemented backend/direct.mts must compose buildPublicPostEligibilityFilter, buildViewerPostDiscoveryEligibilityFilter`,
    )
  })

  it('requires the descendants route to call the candidate-filtering boundary', () => {
    const errors: string[] = []
    checkPostPublicationReaderInventory(
      makeContext(
        {
          version: 1,
          canonical_builder: canonicalBuilder,
          implemented: [{ path: 'backend/direct.mts', classification: 'descendants-boundary' }],
          pr2_baseline: [],
          classified_exceptions: [],
        },
        {
          direct: "import { canViewPost } from '@services/posts'\ncanViewPost()",
        },
      ),
      errors,
    )
    expect(errors).toContain(
      `${inventoryPath}: implemented backend/direct.mts must compose getVisibleCommentDescendantIdsPage`,
    )
  })

  it('rejects a public-view reader that only names the view in a comment', () => {
    const errors: string[] = []
    checkPostPublicationReaderInventory(
      makeContext(
        {
          version: 1,
          canonical_builder: canonicalBuilder,
          implemented: [{ path: 'backend/direct.mts', classification: 'public-view' }],
          pr2_baseline: [],
          classified_exceptions: [],
        },
        { direct: '-- view_public_post_eligibility\nSELECT COUNT(*) FROM posts' },
      ),
      errors,
    )
    expect(errors).toContain(
      `${inventoryPath}: implemented backend/direct.mts must compose view_public_post_eligibility`,
    )
  })

  it('rejects a public-view reader with a complete fake JOIN in a SQL comment', () => {
    const errors: string[] = []
    checkPostPublicationReaderInventory(
      makeContext(
        {
          version: 1,
          canonical_builder: canonicalBuilder,
          implemented: [{ path: 'backend/direct.mts', classification: 'public-view' }],
          pr2_baseline: [],
          classified_exceptions: [],
        },
        {
          direct: `import { read } from '@data-stores/psql'
const query = sql\`
            /* JOIN view_public_post_eligibility eligibility
              ON eligibility.post_id = posts.id */
            SELECT COUNT(*) FROM posts
          \``,
        },
      ),
      errors,
    )
    expect(errors).toContain(
      `${inventoryPath}: implemented backend/direct.mts must compose view_public_post_eligibility`,
    )
  })

  it('rejects a public-view reader whose eligibility join is isolated in an unused CTE', () => {
    const errors: string[] = []
    checkPostPublicationReaderInventory(
      makeContext(
        {
          version: 1,
          canonical_builder: canonicalBuilder,
          implemented: [{ path: 'backend/direct.mts', classification: 'public-view' }],
          pr2_baseline: [],
          classified_exceptions: [],
        },
        {
          direct: `import { read } from '@data-stores/psql'
const query = sql\`
            WITH eligible_posts AS (
              SELECT posts.id
              FROM posts
              JOIN view_public_post_eligibility eligibility ON eligibility.post_id = posts.id
            )
            SELECT COUNT(*) FROM posts
          \``,
        },
      ),
      errors,
    )
    expect(errors).toContain(
      `${inventoryPath}: implemented backend/direct.mts must compose view_public_post_eligibility`,
    )
  })

  it('rejects a chained dead CTE that never feeds the reader select', () => {
    const errors: string[] = []
    checkPostPublicationReaderInventory(
      makeContext(
        {
          version: 1,
          canonical_builder: canonicalBuilder,
          implemented: [{ path: 'backend/direct.mts', classification: 'public-view' }],
          pr2_baseline: [],
          classified_exceptions: [],
        },
        {
          direct: `const query = sql\`
            WITH eligible_posts AS (
              SELECT posts.id
              FROM posts
              JOIN view_public_post_eligibility eligibility ON eligibility.post_id = posts.id
            ), chained_posts AS (
              SELECT * FROM eligible_posts
            )
            SELECT COUNT(*) FROM posts
          \``,
        },
      ),
      errors,
    )
    expect(errors).toContain(
      `${inventoryPath}: implemented backend/direct.mts must compose view_public_post_eligibility`,
    )
  })

  it('rejects a string literal that merely describes an eligibility join', () => {
    const errors: string[] = []
    checkPostPublicationReaderInventory(
      makeContext(
        {
          version: 1,
          canonical_builder: canonicalBuilder,
          implemented: [{ path: 'backend/direct.mts', classification: 'public-view' }],
          pr2_baseline: [],
          classified_exceptions: [],
        },
        {
          direct: `const fake = 'SELECT posts.id FROM posts JOIN view_public_post_eligibility eligibility ON eligibility.post_id = posts.id'
const query = sql\`SELECT COUNT(*) FROM posts\``,
        },
      ),
      errors,
    )
    expect(errors).toContain(
      `${inventoryPath}: implemented backend/direct.mts must compose view_public_post_eligibility`,
    )
  })

  it('accepts a static SQL select that joins eligibility to its posts alias', () => {
    const errors: string[] = []
    checkPostPublicationReaderInventory(
      makeContext(
        {
          version: 1,
          canonical_builder: canonicalBuilder,
          implemented: [{ path: 'backend/direct.mts', classification: 'public-view' }],
          pr2_baseline: [],
          classified_exceptions: [],
        },
        {
          direct: `import { read } from '@data-stores/psql'
const query = sql\`
            SELECT posts.id
            FROM posts
            JOIN view_public_post_eligibility eligibility ON eligibility.post_id = posts.id
          \`
read(query)`,
        },
      ),
      errors,
    )
    expect(errors).toEqual([])
  })

  it('rejects a decoy eligibility SQL statement that is never executed', () => {
    const errors: string[] = []
    checkPostPublicationReaderInventory(
      makeContext(
        {
          version: 1,
          canonical_builder: canonicalBuilder,
          implemented: [{ path: 'backend/direct.mts', classification: 'public-view' }],
          pr2_baseline: [],
          classified_exceptions: [],
        },
        {
          direct: `import { read } from '@data-stores/psql'
const decoyQuery = sql\`
            SELECT posts.id
            FROM posts
            JOIN view_public_post_eligibility eligibility ON eligibility.post_id = posts.id
          \`
ignore(decoyQuery)
const readerQuery = sql\`SELECT posts.id FROM posts\`
read(readerQuery)`,
        },
      ),
      errors,
    )
    expect(errors).toContain(
      `${inventoryPath}: implemented backend/direct.mts must compose view_public_post_eligibility`,
    )
  })

  it('accepts a manually declared, untagged static SQL template', () => {
    const errors: string[] = []
    checkPostPublicationReaderInventory(
      makeContext(
        {
          version: 1,
          canonical_builder: canonicalBuilder,
          implemented: [{ path: 'backend/direct.mts', classification: 'public-view' }],
          pr2_baseline: [],
          classified_exceptions: [],
        },
        {
          direct: `import { read } from '@data-stores/psql'
const query = \`
            SELECT posts.id
            FROM posts
            JOIN view_public_post_eligibility eligibility ON eligibility.post_id = posts.id
          \`
read(query)`,
        },
      ),
      errors,
    )
    expect(errors).toEqual([])
  })

  it('accepts eligibility joined within a consumed nested select scope', () => {
    const errors: string[] = []
    checkPostPublicationReaderInventory(
      makeContext(
        {
          version: 1,
          canonical_builder: canonicalBuilder,
          implemented: [{ path: 'backend/direct.mts', classification: 'public-view' }],
          pr2_baseline: [],
          classified_exceptions: [],
        },
        {
          direct: `import { read } from '@data-stores/psql'
const query = sql\`
            SELECT visible.id
            FROM (
              SELECT posts.id
              FROM posts
              JOIN view_public_post_eligibility eligibility ON eligibility.post_id = posts.id
            ) visible
          \`
read(query)`,
        },
      ),
      errors,
    )
    expect(errors).toEqual([])
  })
})
