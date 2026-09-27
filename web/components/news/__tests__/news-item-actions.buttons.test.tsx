import {
  MOCK_ITEM,
  mockAuthState,
} from '@/test-helpers/components/news/news-item-actions-buttons.mock-support'

import { afterEach, describe, expect, it } from 'vitest'

import { render, screen } from '@testing-library/react'
import { NewsItemActions } from '../news-item-actions'

describe('NewsItemActions hide/save buttons and leading/trailing actions', () => {
  afterEach(() => {
    mockAuthState.isAuthenticated = true
  })

  it('derives signed-in action visibility from auth context', () => {
    render(
      <NewsItemActions
        item={MOCK_ITEM}
        relatedPosts={[]}
      />,
    )

    expect(screen.getByTestId('hide-button')).toBeDefined()
  })

  it('always renders NewsDiscussMenu', () => {
    render(
      <NewsItemActions
        item={MOCK_ITEM}
        relatedPosts={[]}
      />,
    )
    expect(screen.getByTestId('news-discuss-menu')).toBeDefined()
  })

  it('renders HideButton when logged in', () => {
    render(
      <NewsItemActions
        item={MOCK_ITEM}
        relatedPosts={[]}
      />,
    )

    expect(screen.getByTestId('hide-button')).toBeDefined()
  })

  it('does NOT render HideButton when not logged in', () => {
    mockAuthState.isAuthenticated = false
    render(
      <NewsItemActions
        item={MOCK_ITEM}
        relatedPosts={[]}
      />,
    )

    expect(screen.queryByTestId('hide-button')).toBeNull()
  })

  it('passes initialActive=true to HideButton when viewerBookmarks.hide is true', () => {
    render(
      <NewsItemActions
        item={MOCK_ITEM}
        relatedPosts={[]}
        viewerBookmarks={{ hide: true }}
      />,
    )

    const hideButton = screen.getByTestId('hide-button')
    expect(hideButton.getAttribute('data-active')).toBe('true')
  })

  it('passes initialActive=false to HideButton when viewerBookmarks.hide is false', () => {
    render(
      <NewsItemActions
        item={MOCK_ITEM}
        relatedPosts={[]}
        viewerBookmarks={{ hide: false }}
      />,
    )

    const hideButton = screen.getByTestId('hide-button')
    expect(hideButton.getAttribute('data-active')).toBe('false')
  })

  it('renders SaveButton before HideButton in the action row', () => {
    const { container } = render(
      <NewsItemActions
        item={MOCK_ITEM}
        relatedPosts={[]}
      />,
    )
    const row = container.querySelector('[data-pw="news-item-actions-row"]')
    expect(row).not.toBeNull()
    const saveButton = row?.querySelector('[data-testid="save-button"]')
    const hideButton = row?.querySelector('[data-testid="hide-button"]')
    expect(saveButton).not.toBeNull()
    expect(hideButton).not.toBeNull()
    expect(
      saveButton!.compareDocumentPosition(hideButton!) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy()
  })
})
