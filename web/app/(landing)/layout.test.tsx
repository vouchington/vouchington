import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import LandingPageLayout from './layout'

describe('LandingPageLayout', () => {
  it('renders children with no site chrome wrapper', () => {
    render(
      <LandingPageLayout>
        <div data-pw='child'>content</div>
      </LandingPageLayout>,
    )
    expect(screen.getByText('content')).toBeDefined()
  })
})
