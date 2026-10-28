import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { AsideAccordion } from './aside-accordion'

describe('AsideAccordion', () => {
  it('renders its title and children expanded by default', () => {
    render(
      <AsideAccordion title='My Section'>
        <p>Paragraph content</p>
      </AsideAccordion>,
    )
    const trigger = screen.getByRole('button', { name: 'My Section' })
    expect(trigger.getAttribute('aria-expanded')).toBe('true')
    expect(screen.getByText('Paragraph content')).toBeVisible()
  })

  it('starts collapsed when defaultOpen is false', () => {
    render(
      <AsideAccordion
        title='Section'
        defaultOpen={false}
      >
        Content
      </AsideAccordion>,
    )
    const trigger = screen.getByRole('button', { name: 'Section' })
    expect(trigger.getAttribute('aria-expanded')).toBe('false')
  })
})
