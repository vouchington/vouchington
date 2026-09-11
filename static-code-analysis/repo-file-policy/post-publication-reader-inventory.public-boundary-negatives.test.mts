import { describe, expect, it } from 'vitest'
import { checkPostPublicationReaderInventory } from './post-publication-reader-inventory.mts'
import {
  canonicalBuilder,
  inventoryPath,
  makeContext,
} from './post-publication-reader-inventory.test-support.mts'

const boundaryCompositionError = `${inventoryPath}: implemented backend/direct.mts must compose getPublicPostIds`

function getBoundaryErrors(direct: string): string[] {
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
      { direct },
    ),
    errors,
  )
  return errors
}

describe('post-publication public-boundary validation', () => {
  it('accepts public IDs used to filter the emitted candidates', () => {
    const errors = getBoundaryErrors(`import { getPublicPostIds } from '@services/posts'
const publicPostIds = await getPublicPostIds(results.map(result => result.id))
return results.filter(result => publicPostIds.has(result.id))`)
    expect(errors).toEqual([])
  })

  it('accepts a chained public-ID filter', () => {
    const errors = getBoundaryErrors(`import { getPublicPostIds } from '@services/posts'
return getPublicPostIds(results.map(result => result.id)).then(publicPostIds =>
  results.filter(result => publicPostIds.has(result.id)),
)`)
    expect(errors).toEqual([])
  })

  it('rejects irrelevant property access on public IDs', () => {
    const errors = getBoundaryErrors(`import { getPublicPostIds } from '@services/posts'
const publicPostIds = await getPublicPostIds(postIds)
publicPostIds.size
return postIds`)
    expect(errors).toContain(boundaryCompositionError)
  })

  it('rejects passing public IDs to an unrelated call', () => {
    const errors = getBoundaryErrors(`import { getPublicPostIds } from '@services/posts'
const publicPostIds = await getPublicPostIds(postIds)
log(publicPostIds)
return postIds`)
    expect(errors).toContain(boundaryCompositionError)
  })

  it('rejects a shadowed public-ID binding used by a filter', () => {
    const errors = getBoundaryErrors(`import { getPublicPostIds } from '@services/posts'
const publicPostIds = await getPublicPostIds(postIds)
const visible = results.filter(publicPostIds => publicPostIds.has('unrelated'))
return visible`)
    expect(errors).toContain(boundaryCompositionError)
  })

  it('rejects an unused filtered derivation before the original candidates are returned', () => {
    const errors = getBoundaryErrors(`import { getPublicPostIds } from '@services/posts'
const publicPostIds = await getPublicPostIds(postIds)
const unused = results.filter(result => publicPostIds.has(result.id))
return results`)
    expect(errors).toContain(boundaryCompositionError)
  })

  it('rejects an irrelevant conditional check before returning original candidates', () => {
    const errors = getBoundaryErrors(`import { getPublicPostIds } from '@services/posts'
const publicPostIds = await getPublicPostIds(postIds)
if (publicPostIds.has('unrelated')) log('irrelevant')
return results`)
    expect(errors).toContain(boundaryCompositionError)
  })

  it('rejects a map that returns unchanged candidates', () => {
    const errors = getBoundaryErrors(`import { getPublicPostIds } from '@services/posts'
const publicPostIds = await getPublicPostIds(postIds)
return results.map(result => {
  publicPostIds.has(result.id)
  return result
})`)
    expect(errors).toContain(boundaryCompositionError)
  })

  it('rejects an unused secondary transformation of filtered candidates', () => {
    const errors = getBoundaryErrors(`import { getPublicPostIds } from '@services/posts'
const publicPostIds = await getPublicPostIds(postIds)
const filtered = results.filter(result => publicPostIds.has(result.id))
const unused = filtered.map(result => result.id)
return results`)
    expect(errors).toContain(boundaryCompositionError)
  })

  it('rejects an assertion unrelated to the emitted candidates', () => {
    const errors = getBoundaryErrors(`import { getPublicPostIds } from '@services/posts'
const publicPostIds = await getPublicPostIds(postIds)
ctx.assert(publicPostIds.has('unrelated'))
return results`)
    expect(errors).toContain(boundaryCompositionError)
  })

  it('rejects merely inspecting a filtered derivation', () => {
    const errors = getBoundaryErrors(`import { getPublicPostIds } from '@services/posts'
const publicPostIds = await getPublicPostIds(postIds)
const filtered = results.filter(result => publicPostIds.has(result.id))
if (filtered[0]) log(filtered[0])
return results`)
    expect(errors).toContain(boundaryCompositionError)
  })

  it('rejects a chained boundary callback that discards its check', () => {
    const errors = getBoundaryErrors(`import { getPublicPostIds } from '@services/posts'
return getPublicPostIds(postIds).then(publicPostIds => {
  publicPostIds.has(results[0].id)
  return results
})`)
    expect(errors).toContain(boundaryCompositionError)
  })
})
