import { describe, it, expect } from 'vitest'
import { configure, render, screen } from '@testing-library/react'
import { ManageTagsCard } from '../manage-tags-card'

configure({ testIdAttribute: 'data-pw' })

describe('ManageTagsCard', () => {
  it('renders heading and children with Card wrapper by default', () => {
    render(<ManageTagsCard heading='Category'>tag content</ManageTagsCard>)
    expect(screen.getByRole('heading', { name: 'Category' })).toBeDefined()
    expect(screen.getByText('tag content')).toBeDefined()
    expect(screen.getByTestId('card')).toBeDefined()
  })

  it('renders heading and children without Card wrapper when hideCardStyles is true', () => {
    render(
      <ManageTagsCard
        heading='Topics'
        hideCardStyles
      >
        tag content
      </ManageTagsCard>,
    )
    expect(screen.getByRole('heading', { name: 'Topics' })).toBeDefined()
    expect(screen.getByText('tag content')).toBeDefined()
    expect(screen.queryByTestId('card')).toBeNull()
  })
})
