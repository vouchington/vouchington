import { describe, it } from 'vitest'
import { runInventoryReaderCase } from '../test-helpers/post-publication-reader-case.mts'

const cases = [
  {
    title: 'accepts a tracked, classified completed inventory',
    classification: 'direct-sql',
    expected: null,
  },
  {
    title: 'rejects implemented readers that stop composing the canonical helper',
    classification: 'direct-sql',
    direct: '// buildDirectPostEligibilityFilter()\nexport const bypass = true',
    expected: 'must compose buildDirectPostEligibilityFilter, buildDirectPostAccessFilter',
  },
  {
    title: 'rejects canonical helper calls whose results are never appended to the reader query',
    classification: 'direct-sql',
    direct: `import {
  buildDirectPostEligibilityFilter,
} from '@modules/feed-query-builders'
import { buildDirectPostAccessFilter } from './direct-access-filter.mts'
const unused = buildDirectPostEligibilityFilter()
query.append(sql\`SELECT * FROM posts\`)
void unused
buildDirectPostAccessFilter()`,
    expected: 'must compose buildDirectPostEligibilityFilter, buildDirectPostAccessFilter',
  },
  {
    title:
      'accepts canonical helper results assigned to a variable then appended to the reader query',
    classification: 'direct-sql',
    direct: `import {
  buildDirectPostEligibilityFilter,
} from '@modules/feed-query-builders'
import { buildDirectPostAccessFilter } from './direct-access-filter.mts'
const eligibility = buildDirectPostEligibilityFilter()
query.append(eligibility)
query.append(buildDirectPostAccessFilter())`,
    expected: null,
  },
  {
    title: 'accepts a SQL builder returned for composition by its caller',
    classification: 'direct-sql',
    direct: `import { buildDirectPostEligibilityFilter } from '@modules/feed-query-builders'
return buildDirectPostEligibilityFilter()`,
    expected: null,
  },
  {
    title: 'accepts a conditional SQL builder pushed into a compositional filter collection',
    classification: 'public-sql',
    direct: `import { buildPublicPostEligibilityFilter } from '@modules/feed-query-builders'
filters.push(isPublic ? buildPublicPostEligibilityFilter() : sql\`TRUE\`)
return filters`,
    expected: null,
  },
  {
    title: 'rejects a canonical filter pushed into an unconsumed collection',
    classification: 'public-sql',
    direct: `import { buildPublicPostEligibilityFilter } from '@modules/feed-query-builders'
const filters = []
filters.push(buildPublicPostEligibilityFilter())
const query = sql\`SELECT * FROM posts\`
read(query)`,
    expected: 'must compose buildPublicPostEligibilityFilter',
  },
  {
    title: 'accepts an awaited authorization boundary without requiring SQL composition',
    classification: 'public-boundary',
    direct:
      "import { getPublicPostIds } from '@services/posts'\nconst ids = await getPublicPostIds()\nreturn ids",
    expected: null,
  },
  {
    title: 'rejects an unused boundary helper decoy',
    classification: 'public-boundary',
    direct: "import { getPublicPostIds } from '@services/posts'\ngetPublicPostIds([])",
    expected: 'must compose getPublicPostIds',
  },
  {
    title: 'rejects a canonical binding that is reassigned before the query appends it',
    classification: 'public-sql',
    direct: `import { buildPublicPostEligibilityFilter } from '@modules/feed-query-builders'
let eligibility = buildPublicPostEligibilityFilter()
eligibility = sql\`TRUE\`
query.append(eligibility)`,
    expected: 'must compose buildPublicPostEligibilityFilter',
  },
  {
    title: 'rejects a canonical helper appended only to an unconsumed local SQL statement',
    classification: 'public-sql',
    direct: `import { buildPublicPostEligibilityFilter } from '@modules/feed-query-builders'
const deadQuery = sql\`SELECT * FROM posts\`
deadQuery.append(buildPublicPostEligibilityFilter())
const readerQuery = sql\`SELECT * FROM posts\`
read(readerQuery)`,
    expected: 'must compose buildPublicPostEligibilityFilter',
  },
  {
    title: 'rejects a homonymous helper imported from another module',
    classification: 'direct-sql',
    direct:
      "import { buildDirectPostEligibilityFilter } from '@services/unrelated'\nbuildDirectPostEligibilityFilter()",
    expected: 'must compose buildDirectPostEligibilityFilter, buildDirectPostAccessFilter',
  },
]

const assertions = {
  expect: (run: () => void) => run(),
}

describe('post-publication reader inventory', () => {
  it.each(cases)('$title', testCase => assertions.expect(() => runInventoryReaderCase(testCase)))
})
