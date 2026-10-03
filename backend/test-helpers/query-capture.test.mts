import { describe, expect, it } from 'vitest'
import {
  countCapturedQueriesByAnnotation,
  filterCapturedQueriesByBoundIds,
  type CapturedTestQuery,
} from './query-capture.mts'

function capturedQuery(annotation: string, values: unknown[]): CapturedTestQuery {
  return { text: `/* ${annotation} */ SELECT 1`, values, timestamp: 0 }
}

describe('filterCapturedQueriesByBoundIds', () => {
  const ids = ['relation-a', 'relation-b']

  it('keeps queries that bind an id directly or inside an array value', () => {
    const direct = capturedQuery('direct', ['relation-a', 1, 2])
    const inArray = capturedQuery('inArray', [['other', 'relation-b'], 'other'])
    const queries = [direct, capturedQuery('unrelated', ['relation-c', ['relation-d']]), inArray]

    expect(filterCapturedQueriesByBoundIds(queries, ids)).toEqual([direct, inArray])
  })

  it('drops queries that bind no id, including those with no values', () => {
    const queries = [capturedQuery('none', []), capturedQuery('numeric', [1, null, undefined])]

    expect(filterCapturedQueriesByBoundIds(queries, ids)).toEqual([])
  })

  it('keeps nothing when asked for no ids', () => {
    expect(filterCapturedQueriesByBoundIds([capturedQuery('any', ['relation-a'])], [])).toEqual([])
  })

  it('scopes an annotation count to the fixture ids', () => {
    const annotation = 'updateEntityRelationVoteStatsIfChanged'
    const queries = [
      capturedQuery(annotation, ['stray-relation', 1]),
      capturedQuery(annotation, ['relation-a', 1]),
    ]

    expect(countCapturedQueriesByAnnotation(queries, annotation)).toBe(2)
    expect(
      countCapturedQueriesByAnnotation(filterCapturedQueriesByBoundIds(queries, ids), annotation),
    ).toBe(1)
  })
})
