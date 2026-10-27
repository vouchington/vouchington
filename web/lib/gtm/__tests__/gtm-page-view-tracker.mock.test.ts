import { createElement } from 'react'
import { render } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createNavMock, navMockModule } from 'vouchington-tooling/next-navigation-mock'

vi.mock<typeof import('next/navigation')>(import('next/navigation'), () => navMockModule)

import { GtmPageViewTracker } from '../gtm-page-view-tracker'

const nav = createNavMock()

describe('GtmPageViewTracker', () => {
  beforeEach(() => {
    nav.reset()
    delete window.dataLayer
  })

  afterEach(() => {
    delete window.dataLayer
    nav.reset()
  })

  it('pushes page views for the current pathname and subsequent route changes', () => {
    nav.setPathname('/')
    const { container, rerender } = render(
      createElement(GtmPageViewTracker, { gtmId: 'GTM-ABC123' }),
    )

    expect(container.firstChild).toBeNull()
    expect(window.dataLayer).toEqual([{ event: 'page_view', page_path: '/' }])

    nav.setPathname('/topics')
    rerender(createElement(GtmPageViewTracker, { gtmId: 'GTM-ABC123' }))

    expect(window.dataLayer).toEqual([
      { event: 'page_view', page_path: '/' },
      { event: 'page_view', page_path: '/topics' },
    ])
  })

  it('does not push a page view when gtmId is absent', () => {
    nav.setPathname('/topics')

    render(createElement(GtmPageViewTracker))

    expect(window.dataLayer).toBeUndefined()
  })

  it('does not push a page view when gtmId is invalid', () => {
    nav.setPathname('/topics')

    render(createElement(GtmPageViewTracker, { gtmId: 'invalid-id' }))

    expect(window.dataLayer).toBeUndefined()
  })
})
