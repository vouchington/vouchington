import { describe, expect, it } from 'vitest'
import { walkSourceWindow } from '../source-window.mts'

type Item = { id: string; ok: boolean }

function parent(id: string, items: Item[]) {
  return {
    items,
    openCursor: (item: Item) => `${id}:${item.id}`,
    exhaustedCursor: `${id}:done`,
  }
}

describe('walkSourceWindow', () => {
  it('stops at a full child window and does not return the next parent', () => {
    const walked = walkSourceWindow({
      parents: [
        parent('a', [
          { id: '1', ok: true },
          { id: '2', ok: true },
        ]),
        parent('b', [{ id: '9', ok: true }]),
      ],
      childLimit: 1,
      resultLimit: 10,
      parentHasMore: false,
      accept: item => (item.ok ? item.id : null),
    })

    expect(walked.results).toEqual(['1'])
    expect(walked.hasNextPage).toBe(true)
    expect(walked.resume).toBe('a:1')
  })

  it('advances past ineligible rows and continues a short parent', () => {
    const walked = walkSourceWindow({
      parents: [
        parent('a', [
          { id: '1', ok: false },
          { id: '2', ok: true },
        ]),
        parent('b', [{ id: '3', ok: true }]),
      ],
      childLimit: 5,
      resultLimit: 10,
      parentHasMore: false,
      accept: item => (item.ok ? item.id : null),
    })

    expect(walked.results).toEqual(['2', '3'])
    expect(walked.hasNextPage).toBe(false)
    expect(walked.resume).toBeNull()
  })

  it('keeps a cursor when every inspected row is ineligible and more parents exist', () => {
    const walked = walkSourceWindow({
      parents: [parent('a', [{ id: '1', ok: false }])],
      childLimit: 5,
      resultLimit: 10,
      parentHasMore: true,
      accept: item => (item.ok ? item.id : null),
    })

    expect(walked.results).toEqual([])
    expect(walked.hasNextPage).toBe(true)
    expect(walked.resume).toBe('a:done')
    expect(walked.start).toBeNull()
  })

  it('resumes at the last returned row when the result limit fills', () => {
    const walked = walkSourceWindow({
      parents: [
        parent('a', [
          { id: '1', ok: false },
          { id: '2', ok: true },
          { id: '3', ok: true },
        ]),
      ],
      childLimit: 5,
      resultLimit: 1,
      parentHasMore: false,
      accept: item => (item.ok ? item.id : null),
    })

    expect(walked.results).toEqual(['2'])
    expect(walked.hasNextPage).toBe(true)
    expect(walked.resume).toBe('a:2')
    expect(walked.start).toBe('a:2')
  })
})
