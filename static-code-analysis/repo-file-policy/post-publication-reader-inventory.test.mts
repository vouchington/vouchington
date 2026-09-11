import { describe, expect, it } from 'vitest'
import { checkPostPublicationReaderInventory } from './post-publication-reader-inventory.mts'
import {
  canonicalBuilder,
  inventoryPath,
  makeContext,
} from './post-publication-reader-inventory.test-support.mts'

describe('post-publication reader inventory', () => {
  it('accepts a tracked, classified completed inventory', () => {
    const errors: string[] = []
    checkPostPublicationReaderInventory(
      makeContext({
        version: 1,
        canonical_builder: canonicalBuilder,
        implemented: [{ path: 'backend/direct.mts', classification: 'direct-sql' }],
        pr2_baseline: [],
        classified_exceptions: [],
      }),
      errors,
    )
    expect(errors).toEqual([])
  })

  it('rejects implemented readers that stop composing the canonical helper', () => {
    const errors: string[] = []
    checkPostPublicationReaderInventory(
      makeContext(
        {
          version: 1,
          canonical_builder: canonicalBuilder,
          implemented: [{ path: 'backend/direct.mts', classification: 'direct-sql' }],
          pr2_baseline: [],
          classified_exceptions: [],
        },
        { direct: '// buildDirectPostEligibilityFilter()\nexport const bypass = true' },
      ),
      errors,
    )
    expect(errors).toContain(
      `${inventoryPath}: implemented backend/direct.mts must compose buildDirectPostEligibilityFilter, buildDirectPostAccessFilter`,
    )
  })

  it('rejects canonical helper calls whose results are never appended to the reader query', () => {
    const errors: string[] = []
    checkPostPublicationReaderInventory(
      makeContext(
        {
          version: 1,
          canonical_builder: canonicalBuilder,
          implemented: [{ path: 'backend/direct.mts', classification: 'direct-sql' }],
          pr2_baseline: [],
          classified_exceptions: [],
        },
        {
          direct: `import {
  buildDirectPostEligibilityFilter,
} from '@modules/feed-query-builders'
import { buildDirectPostAccessFilter } from './direct-access-filter.mts'
const unused = buildDirectPostEligibilityFilter()
query.append(sql\`SELECT * FROM posts\`)
void unused
buildDirectPostAccessFilter()`,
        },
      ),
      errors,
    )
    expect(errors).toContain(
      `${inventoryPath}: implemented backend/direct.mts must compose buildDirectPostEligibilityFilter, buildDirectPostAccessFilter`,
    )
  })

  it('accepts canonical helper results assigned to a variable then appended to the reader query', () => {
    const errors: string[] = []
    checkPostPublicationReaderInventory(
      makeContext(
        {
          version: 1,
          canonical_builder: canonicalBuilder,
          implemented: [{ path: 'backend/direct.mts', classification: 'direct-sql' }],
          pr2_baseline: [],
          classified_exceptions: [],
        },
        {
          direct: `import {
  buildDirectPostEligibilityFilter,
} from '@modules/feed-query-builders'
import { buildDirectPostAccessFilter } from './direct-access-filter.mts'
const eligibility = buildDirectPostEligibilityFilter()
query.append(eligibility)
query.append(buildDirectPostAccessFilter())`,
        },
      ),
      errors,
    )
    expect(errors).toEqual([])
  })

  it('accepts a SQL builder returned for composition by its caller', () => {
    const errors: string[] = []
    checkPostPublicationReaderInventory(
      makeContext(
        {
          version: 1,
          canonical_builder: canonicalBuilder,
          implemented: [{ path: 'backend/direct.mts', classification: 'direct-sql' }],
          pr2_baseline: [],
          classified_exceptions: [],
        },
        {
          direct: `import { buildDirectPostEligibilityFilter } from '@modules/feed-query-builders'
return buildDirectPostEligibilityFilter()`,
        },
      ),
      errors,
    )
    expect(errors).toEqual([])
  })

  it('accepts a conditional SQL builder pushed into a compositional filter collection', () => {
    const errors: string[] = []
    checkPostPublicationReaderInventory(
      makeContext(
        {
          version: 1,
          canonical_builder: canonicalBuilder,
          implemented: [{ path: 'backend/direct.mts', classification: 'public-sql' }],
          pr2_baseline: [],
          classified_exceptions: [],
        },
        {
          direct: `import { buildPublicPostEligibilityFilter } from '@modules/feed-query-builders'
filters.push(isPublic ? buildPublicPostEligibilityFilter() : sql\`TRUE\`)
return filters`,
        },
      ),
      errors,
    )
    expect(errors).toEqual([])
  })

  it('rejects a canonical filter pushed into an unconsumed collection', () => {
    const errors: string[] = []
    checkPostPublicationReaderInventory(
      makeContext(
        {
          version: 1,
          canonical_builder: canonicalBuilder,
          implemented: [{ path: 'backend/direct.mts', classification: 'public-sql' }],
          pr2_baseline: [],
          classified_exceptions: [],
        },
        {
          direct: `import { buildPublicPostEligibilityFilter } from '@modules/feed-query-builders'
const filters = []
filters.push(buildPublicPostEligibilityFilter())
const query = sql\`SELECT * FROM posts\`
read(query)`,
        },
      ),
      errors,
    )
    expect(errors).toContain(
      `${inventoryPath}: implemented backend/direct.mts must compose buildPublicPostEligibilityFilter`,
    )
  })

  it('accepts an awaited authorization boundary without requiring SQL composition', () => {
    const errors: string[] = []
    checkPostPublicationReaderInventory(
      makeContext(
        {
          version: 1,
          canonical_builder: canonicalBuilder,
          implemented: [{ path: 'backend/direct.mts', classification: 'public-boundary' }],
          pr2_baseline: [],
          classified_exceptions: [],
        },
        {
          direct:
            "import { getPublicPostIds } from '@services/posts'\nconst ids = await getPublicPostIds()\nreturn ids",
        },
      ),
      errors,
    )
    expect(errors).toEqual([])
  })

  it('rejects an unused boundary helper decoy', () => {
    const errors: string[] = []
    checkPostPublicationReaderInventory(
      makeContext(
        {
          version: 1,
          canonical_builder: canonicalBuilder,
          implemented: [{ path: 'backend/direct.mts', classification: 'public-boundary' }],
          pr2_baseline: [],
          classified_exceptions: [],
        },
        { direct: "import { getPublicPostIds } from '@services/posts'\ngetPublicPostIds([])" },
      ),
      errors,
    )
    expect(errors).toContain(
      `${inventoryPath}: implemented backend/direct.mts must compose getPublicPostIds`,
    )
  })

  it('rejects a canonical binding that is reassigned before the query appends it', () => {
    const errors: string[] = []
    checkPostPublicationReaderInventory(
      makeContext(
        {
          version: 1,
          canonical_builder: canonicalBuilder,
          implemented: [{ path: 'backend/direct.mts', classification: 'public-sql' }],
          pr2_baseline: [],
          classified_exceptions: [],
        },
        {
          direct: `import { buildPublicPostEligibilityFilter } from '@modules/feed-query-builders'
let eligibility = buildPublicPostEligibilityFilter()
eligibility = sql\`TRUE\`
query.append(eligibility)`,
        },
      ),
      errors,
    )
    expect(errors).toContain(
      `${inventoryPath}: implemented backend/direct.mts must compose buildPublicPostEligibilityFilter`,
    )
  })

  it('rejects a canonical helper appended only to an unconsumed local SQL statement', () => {
    const errors: string[] = []
    checkPostPublicationReaderInventory(
      makeContext(
        {
          version: 1,
          canonical_builder: canonicalBuilder,
          implemented: [{ path: 'backend/direct.mts', classification: 'public-sql' }],
          pr2_baseline: [],
          classified_exceptions: [],
        },
        {
          direct: `import { buildPublicPostEligibilityFilter } from '@modules/feed-query-builders'
const deadQuery = sql\`SELECT * FROM posts\`
deadQuery.append(buildPublicPostEligibilityFilter())
const readerQuery = sql\`SELECT * FROM posts\`
read(readerQuery)`,
        },
      ),
      errors,
    )
    expect(errors).toContain(
      `${inventoryPath}: implemented backend/direct.mts must compose buildPublicPostEligibilityFilter`,
    )
  })

  it('rejects a homonymous helper imported from another module', () => {
    const errors: string[] = []
    checkPostPublicationReaderInventory(
      makeContext(
        {
          version: 1,
          canonical_builder: canonicalBuilder,
          implemented: [{ path: 'backend/direct.mts', classification: 'direct-sql' }],
          pr2_baseline: [],
          classified_exceptions: [],
        },
        {
          direct:
            "import { buildDirectPostEligibilityFilter } from '@services/unrelated'\nbuildDirectPostEligibilityFilter()",
        },
      ),
      errors,
    )
    expect(errors).toContain(
      `${inventoryPath}: implemented backend/direct.mts must compose buildDirectPostEligibilityFilter, buildDirectPostAccessFilter`,
    )
  })
})
