import { beforeAll, describe, it } from 'vitest'
import { initSqlAst } from './sql-ast.mts'
import { runInventoryReaderCase } from '../test-helpers/post-publication-reader-case.mts'

const view = 'must compose view_public_post_eligibility'

const cases = [
  {
    title: 'requires mixed readers to compose public and viewer discovery predicates',
    classification: 'mixed-discovery-sql',
    direct:
      "import { buildPublicPostEligibilityFilter } from '@modules/feed-query-builders'\nbuildPublicPostEligibilityFilter()",
    expected:
      'must compose buildPublicPostEligibilityFilter, buildViewerPostDiscoveryEligibilityFilter',
  },
  {
    title: 'requires the descendants route to call the candidate-filtering boundary',
    classification: 'descendants-boundary',
    direct: "import { canViewPost } from '@services/posts'\ncanViewPost()",
    expected: 'must compose getVisibleCommentDescendantIdsPage',
  },
  {
    title: 'rejects a public-view reader that only names the view in a comment',
    classification: 'public-view',
    direct: '-- view_public_post_eligibility\nSELECT COUNT(*) FROM posts',
    expected: view,
  },
  {
    title: 'rejects a public-view reader with a complete fake JOIN in a SQL comment',
    classification: 'public-view',
    direct: `import { read } from '@data-stores/psql'
const query = sql\`
            /* JOIN view_public_post_eligibility eligibility
              ON eligibility.post_id = posts.id */
            SELECT COUNT(*) FROM posts
          \``,
    expected: view,
  },
  {
    title: 'rejects a public-view reader whose eligibility join is isolated in an unused CTE',
    classification: 'public-view',
    direct: `import { read } from '@data-stores/psql'
const query = sql\`
            WITH eligible_posts AS (
              SELECT posts.id
              FROM posts
              JOIN view_public_post_eligibility eligibility ON eligibility.post_id = posts.id
            )
            SELECT COUNT(*) FROM posts
          \``,
    expected: view,
  },
  {
    title: 'rejects a chained dead CTE that never feeds the reader select',
    classification: 'public-view',
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
    expected: view,
  },
  {
    title: 'rejects a string literal that merely describes an eligibility join',
    classification: 'public-view',
    direct: `const fake = 'SELECT posts.id FROM posts JOIN view_public_post_eligibility eligibility ON eligibility.post_id = posts.id'
const query = sql\`SELECT COUNT(*) FROM posts\``,
    expected: view,
  },
  {
    title: 'accepts a static SQL select that joins eligibility to its posts alias',
    classification: 'public-view',
    direct: `import { read } from '@data-stores/psql'
const query = sql\`
            SELECT posts.id
            FROM posts
            JOIN view_public_post_eligibility eligibility ON eligibility.post_id = posts.id
          \`
read(query)`,
    expected: null,
  },
  {
    title: 'rejects a decoy eligibility SQL statement that is never executed',
    classification: 'public-view',
    direct: `import { read } from '@data-stores/psql'
const decoyQuery = sql\`
            SELECT posts.id
            FROM posts
            JOIN view_public_post_eligibility eligibility ON eligibility.post_id = posts.id
          \`
ignore(decoyQuery)
const readerQuery = sql\`SELECT posts.id FROM posts\`
read(readerQuery)`,
    expected: view,
  },
  {
    title: 'accepts a manually declared, untagged static SQL template',
    classification: 'public-view',
    direct: `import { read } from '@data-stores/psql'
const query = \`
            SELECT posts.id
            FROM posts
            JOIN view_public_post_eligibility eligibility ON eligibility.post_id = posts.id
          \`
read(query)`,
    expected: null,
  },
  {
    title: 'accepts eligibility joined within a consumed nested select scope',
    classification: 'public-view',
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
    expected: null,
  },
]

const assertions = {
  expect: (run: () => void) => run(),
}

describe('post-publication reader inventory', () => {
  beforeAll(() => initSqlAst())

  it.each(cases)('$title', testCase => assertions.expect(() => runInventoryReaderCase(testCase)))
})
