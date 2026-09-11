import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { AsideAccordion } from './aside-accordion'

describe('AsideAccordion', () => {
  it('renders the title', () => {
    render(<AsideAccordion title='My Section'>Content here</AsideAccordion>)
    expect(screen.getByText('My Section')).toBeDefined()
  })

  it('renders children when defaultOpen is true', () => {
    render(<AsideAccordion title='Section'>Child content</AsideAccordion>)
    expect(screen.getByText('Child content')).toBeDefined()
  })

  it('opens by default', () => {
    render(<AsideAccordion title='Section'>Content</AsideAccordion>)
    const trigger = screen.getByRole('button', { name: 'Section' })
    expect(trigger.getAttribute('aria-expanded')).toBe('true')
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

  it('renders children with correct content', () => {
    render(
      <AsideAccordion title='Section'>
        <p>Paragraph content</p>
      </AsideAccordion>,
    )
    expect(screen.getByText('Paragraph content')).toBeDefined()
  })
})
