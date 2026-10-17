import { describe, expect, it } from 'vitest'
import { createSameIdElectionRelations } from '@voucha/test-helpers/entities/entity-relation-election-collisions'
import { mergeVoteStreams, streamRelationVotes } from './stream-relation-votes.mts'
import { streamVotes } from './stream.mts'

describe('relation vote export', () => {
  it('exports both families sharing a target UUID in event order without leaking its sort key', async () => {
    const fixture = await createSameIdElectionRelations({
      postCategory: 3,
      topicRelated: 7,
      viewerVotes: { postCategory: 1, topicRelated: -1 },
    })
    const events: Record<string, unknown>[] = []
    for await (const event of streamRelationVotes(fixture.viewer.id)) events.push(event)
    expect(
      events
        .filter(row => row.entity_id === fixture.id)
        .map(row => row.choice)
        .toSorted(),
    ).toEqual(['confirm', 'dispute'])
    expect(events.map(row => row.sort_id)).toEqual(events.map(row => row.sort_id).toSorted())
    const exported: Record<string, unknown>[] = []
    for await (const event of streamVotes(fixture.viewer.id)) exported.push(event)
    expect(exported.filter(row => row.entity_id === fixture.id)).toHaveLength(2)
    expect(exported.every(row => !Object.hasOwn(row, 'sort_id'))).toBe(true)
  })

  it('merges both ordered sources and closes both on consumer cancellation', async () => {
    const closed: string[] = []
    async function* source(name: string, ids: string[]) {
      try {
        for (const sort_id of ids) yield { sort_id }
      } finally {
        closed.push(name)
      }
    }
    const merged = mergeVoteStreams(source('left', ['01', '03']), source('right', ['02', '04']))
    expect(await merged.next()).toMatchObject({ value: { sort_id: '01' } })
    expect(await merged.next()).toMatchObject({ value: { sort_id: '02' } })
    await merged.return(undefined)
    expect(closed.toSorted()).toEqual(['left', 'right'])
    const ordered: Record<string, unknown>[] = []
    for await (const row of mergeVoteStreams(source('a', ['01', '03']), source('b', ['02', '04'])))
      ordered.push(row)
    expect(ordered.map(row => row.sort_id)).toEqual(['01', '02', '03', '04'])
  })
  it('closes both sources when one source rejects cancellation', async () => {
    const closed: string[] = []
    async function* source(name: string, sortId: string, rejectClose: boolean) {
      try {
        yield { sort_id: sortId }
      } finally {
        closed.push(name)
        // oxlint-disable-next-line no-unsafe-finally -- model an external cursor rejecting cancellation.
        if (rejectClose) throw new Error('source close failed')
      }
    }
    const merged = mergeVoteStreams(source('left', '01', true), source('right', '02', false))
    await merged.next()
    await expect(merged.return(undefined)).rejects.toThrow('source close failed')
    expect(closed.toSorted()).toEqual(['left', 'right'])
  })
})
