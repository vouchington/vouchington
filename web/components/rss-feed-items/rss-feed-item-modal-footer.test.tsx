import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { createRef } from 'react'
import { RssFeedItemModalFooter } from './rss-feed-item-modal-footer'

function renderFooter(props: { canNavigatePrevious?: boolean; canNavigateNext?: boolean }) {
  render(
    <RssFeedItemModalFooter
      {...props}
      navigatePrevious={vi.fn<VitestLooseMock>()}
      navigateNext={vi.fn<VitestLooseMock>()}
      previousButtonRef={createRef<HTMLButtonElement>()}
      nextButtonRef={createRef<HTMLButtonElement>()}
    />,
  )
}

describe('RssFeedItemModalFooter', () => {
  it('semantically disables missing previous and next controls', () => {
    renderFooter({ canNavigatePrevious: false, canNavigateNext: false })

    expect(screen.getByRole('button', { name: 'Previous' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Next' })).toBeDisabled()
  })

  it('keeps available previous and next controls enabled', () => {
    renderFooter({ canNavigatePrevious: true, canNavigateNext: true })

    expect(screen.getByRole('button', { name: 'Previous' })).not.toBeDisabled()
    expect(screen.getByRole('button', { name: 'Next' })).not.toBeDisabled()
  })
})
