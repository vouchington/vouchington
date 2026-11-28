import { MOCK_ITEM } from '@/test-helpers/components/news/news-item-actions-buttons.mock-support'

import { describe, expect, it } from 'vitest'

import { render, screen } from '@testing-library/react'
import { NewsItemActions } from '../news-item-actions'

const trailingAction = <span data-pw='trailing'>Next</span>

describe('NewsItemActions hide/save buttons and leading/trailing actions', () => {
  it('renders trailingAction', () => {
    render(
      <NewsItemActions
        item={MOCK_ITEM}
        relatedPosts={[]}
        trailingAction={trailingAction}
      />,
    )

    expect(screen.getByTestId('trailing')).toBeInTheDocument()
  })

  it('does not render trailingAction wrapper when trailingAction is not provided', () => {
    render(
      <NewsItemActions
        item={MOCK_ITEM}
        relatedPosts={[]}
      />,
    )

    expect(screen.queryByTestId('trailing')).toBeNull()
  })
})
