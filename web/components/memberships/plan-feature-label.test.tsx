import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { PlanFeatureLabel } from './plan-feature-label'

describe('PlanFeatureLabel', () => {
  it('renders a stable data-pw hook for plain labels', () => {
    const { container } = render(<PlanFeatureLabel label='Browse all content' />)

    expect(screen.getByText('Browse all content').tagName).toBe('SPAN')
    expect(container.querySelector('[data-pw="plan-feature-label"]')).not.toBeNull()
    expect(screen.queryByRole('button')).toBeNull()
  })

  it('applies className to the plain label wrapper', () => {
    render(
      <PlanFeatureLabel
        label='Browse all content'
        className='text-muted-foreground'
      />,
    )

    expect(screen.getByText('Browse all content')).toHaveClass('text-muted-foreground')
  })

  it('renders a stable data-pw hook for tooltip labels', () => {
    const { container } = render(
      <PlanFeatureLabel
        label='Immediate access'
        tooltip='Start posting and rating right away'
        data-pw='custom-plan-feature-label'
      />,
    )

    expect(screen.getByRole('button', { name: 'Immediate access' })).toBeInTheDocument()
    expect(container.querySelector('[data-pw="custom-plan-feature-label"]')).toHaveClass(
      'min-w-0',
      'flex-1',
    )
  })
})
