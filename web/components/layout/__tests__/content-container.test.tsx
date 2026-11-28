import { describe, it, expect } from 'vitest'
import { render } from '@testing-library/react'
import { ContentContainer } from '../content-container'

describe('ContentContainer', () => {
  it('forwards additional HTML props to the div', () => {
    const { container } = render(
      <ContentContainer
        data-testid='my-container'
        aria-label='Content'
      />,
    )
    const el = container.firstElementChild
    expect(el?.getAttribute('data-testid')).toBe('my-container')
    expect(el?.getAttribute('aria-label')).toBe('Content')
  })

  it('renders children', () => {
    const { getByText } = render(<ContentContainer>Hello world</ContentContainer>)
    expect(getByText('Hello world')).toBeInTheDocument()
  })

  it('has data-pw content-container', () => {
    const { container } = render(<ContentContainer />)
    expect(container.firstElementChild?.getAttribute('data-pw')).toBe('content-container')
  })
})
