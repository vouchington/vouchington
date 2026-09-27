import {
  MOCK_ITEM,
  mockAuthState,
} from '@/test-helpers/components/news/news-item-actions-buttons.mock-support'

import { describe, expect, it } from 'vitest'

import { render, screen } from '@testing-library/react'
import { NewsItemActions } from '../news-item-actions'

const leadingAction = <span data-testid='leading'>Show more</span>

describe('NewsItemActions hide/save buttons and leading/trailing actions', () => {
  it('renders SaveButton when logged in', () => {
    render(
      <NewsItemActions
        item={MOCK_ITEM}
        relatedPosts={[]}
      />,
    )

    expect(screen.getByTestId('save-button')).toBeDefined()
  })

  it('does NOT render SaveButton when not logged in', () => {
    mockAuthState.isAuthenticated = false
    render(
      <NewsItemActions
        item={MOCK_ITEM}
        relatedPosts={[]}
      />,
    )

    expect(screen.queryByTestId('save-button')).toBeNull()
    mockAuthState.isAuthenticated = true
  })

  it('passes initialActive=true to SaveButton when viewerBookmarks.save is true', () => {
    render(
      <NewsItemActions
        item={MOCK_ITEM}
        relatedPosts={[]}
        viewerBookmarks={{ save: true }}
      />,
    )

    const saveButton = screen.getByTestId('save-button')
    expect(saveButton.getAttribute('data-active')).toBe('true')
  })

  it('passes initialActive=false to SaveButton when viewerBookmarks.save is false', () => {
    render(
      <NewsItemActions
        item={MOCK_ITEM}
        relatedPosts={[]}
        viewerBookmarks={{ save: false }}
      />,
    )

    const saveButton = screen.getByTestId('save-button')
    expect(saveButton.getAttribute('data-active')).toBe('false')
  })

  it('renders leadingAction before other actions', () => {
    render(
      <NewsItemActions
        item={MOCK_ITEM}
        relatedPosts={[]}
        leadingAction={leadingAction}
      />,
    )

    const leading = screen.getByTestId('leading')
    expect(leading).toBeDefined()
    expect(leading.textContent).toBe('Show more')
  })
})
