import { MOCK_ITEM } from '@/test-helpers/components/news/news-item-actions-buttons.mock-support'

import { describe, expect, it } from 'vitest'

import { render, screen } from '@testing-library/react'
import { NewsItemActions } from '../news-item-actions'

const trailingAction = <span data-testid='trailing'>Next</span>

describe('NewsItemActions hide/save buttons and leading/trailing actions', () => {
  it('renders trailingAction', () => {
    render(
      <NewsItemActions
        item={MOCK_ITEM}
        relatedPosts={[]}
        trailingAction={trailingAction}
      />,
    )

    expect(screen.getByTestId('trailing')).toBeDefined()
  })

  it('does not render trailingAction wrapper when trailingAction is not provided', () => {
    const { container } = render(
      <NewsItemActions
        item={MOCK_ITEM}
        relatedPosts={[]}
      />,
    )

    const actionsDiv = container.querySelector('.scrollbar-hide')
    expect(actionsDiv?.querySelectorAll('.ml-auto').length).toBe(0)
  })
})
