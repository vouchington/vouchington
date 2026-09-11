import { createElement } from 'react'
import { describe, expect, it, vi, beforeEach } from 'vitest'
import { render } from '@testing-library/react'
let mockPathname = '/'
const { pushEvent } = vi.hoisted(() => ({
  pushEvent: vi.fn<VitestLooseMock>(),
}))

vi.mock(import('next/navigation'), () => ({
  usePathname: () => mockPathname,
}))

vi.mock(import('../data-layer'), () => ({
  pushEvent,
}))

import { GtmPageViewTracker } from '../gtm-page-view-tracker'

describe('GtmPageViewTracker', () => {
  beforeEach(() => {
    mockPathname = '/'
    pushEvent.mockReset()
  })

  it('pushes a page_view event on mount and pathname change when gtmId is valid', () => {
    const { rerender } = render(createElement(GtmPageViewTracker, { gtmId: 'GTM-ABC123' }))

    expect(pushEvent).toHaveBeenCalledTimes(1)
    expect(pushEvent).toHaveBeenCalledWith({ event: 'page_view', page_path: '/' })

    mockPathname = '/topics'
    rerender(createElement(GtmPageViewTracker, { gtmId: 'GTM-ABC123' }))

    expect(pushEvent).toHaveBeenCalledTimes(2)
    expect(pushEvent).toHaveBeenLastCalledWith({ event: 'page_view', page_path: '/topics' })
  })

  it('does nothing when gtmId is absent', () => {
    render(createElement(GtmPageViewTracker))

    expect(pushEvent).not.toHaveBeenCalled()
  })

  it('does nothing when gtmId is invalid', () => {
    render(createElement(GtmPageViewTracker, { gtmId: 'invalid-id' }))

    expect(pushEvent).not.toHaveBeenCalled()
  })
})
