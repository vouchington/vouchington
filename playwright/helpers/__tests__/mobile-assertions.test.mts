import { afterEach, describe, expect, it, vi } from 'vitest'
import { getHorizontalOverflowState } from '../mobile-assertions.mts'

interface FakeElement {
  tagName: string
  id: string
  className: string | { baseVal: string }
  getAttribute: (name: string) => string | null
  getBoundingClientRect: () => Pick<DOMRect, 'right'>
}

function installDocument(
  scrollWidth: number,
  clientWidth: number,
  elements: FakeElement[] = [],
): void {
  vi.stubGlobal('document', {
    documentElement: { scrollWidth, clientWidth },
    querySelectorAll: () => elements,
  })
}

describe('getHorizontalOverflowState', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('reports no overflow when document width fits the viewport', () => {
    installDocument(320, 320)

    expect(getHorizontalOverflowState()).toEqual({
      overflow: false,
      scrollWidth: 320,
      clientWidth: 320,
      offenders: [],
    })
  })

  it('reports overflow without offenders when no element extends past the viewport', () => {
    installDocument(321, 320, [
      {
        tagName: 'DIV',
        id: 'within-viewport',
        className: 'content',
        getAttribute: () => 'content',
        getBoundingClientRect: () => ({ right: 321 }),
      },
    ])

    expect(getHorizontalOverflowState()).toEqual({
      overflow: true,
      scrollWidth: 321,
      clientWidth: 320,
      offenders: [],
    })
  })

  it('reports overflowing elements as offenders', () => {
    installDocument(500, 320, [
      {
        tagName: 'SECTION',
        id: 'offender',
        className: 'x'.repeat(61),
        getAttribute: () => 'x'.repeat(61),
        getBoundingClientRect: () => ({ right: 322.4 }),
      },
    ])

    expect(getHorizontalOverflowState()).toEqual({
      overflow: true,
      scrollWidth: 500,
      clientWidth: 320,
      offenders: [{ tag: 'SECTION', id: 'offender', cls: 'x'.repeat(60), right: 322 }],
    })
  })

  it.each(['icon', null])('reads SVG class attributes (%s) without stringifying className', cls => {
    installDocument(500, 320, [
      {
        tagName: 'svg',
        id: 'svg-offender',
        className: { baseVal: cls ?? '' },
        getAttribute: () => cls,
        getBoundingClientRect: () => ({ right: 400 }),
      },
    ])
    expect(getHorizontalOverflowState().offenders).toEqual([
      { tag: 'svg', id: 'svg-offender', cls: cls ?? '', right: 400 },
    ])
  })
})
