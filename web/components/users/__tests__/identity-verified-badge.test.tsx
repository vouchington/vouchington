import { describe, it, expect } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { IdentityVerifiedBadge } from '../identity-verified-badge'

describe('IdentityVerifiedBadge', () => {
  it('renders the badge trigger with expected text', () => {
    render(<IdentityVerifiedBadge />)
    expect(screen.getByText('ID Verified')).toBeDefined()
  })

  it('has data-pw attribute on the badge trigger', () => {
    render(<IdentityVerifiedBadge />)
    const trigger = screen.getByRole('button', { name: /id verified/i })
    expect(trigger.getAttribute('data-pw')).toBe('identity-verified-badge')
  })

  it('opens the dialog when badge is clicked', () => {
    render(<IdentityVerifiedBadge />)
    // Dialog title should not be visible before clicking
    expect(screen.queryByRole('dialog')).toBeNull()

    fireEvent.click(screen.getByText('ID Verified'))

    expect(screen.getByRole('dialog')).toBeDefined()
    expect(screen.getByRole('heading', { name: 'ID Verified' })).toBeDefined()
  })

  it('dialog contains the expected disclaimer copy', () => {
    render(<IdentityVerifiedBadge />)
    fireEvent.click(screen.getByText('ID Verified'))

    expect(
      screen.getByText(
        /This account completed an identity verification check\. Legal name is private unless the user chooses to show it\. This badge does not mean the account is endorsed by us or that its posts are trustworthy\./,
      ),
    ).toBeDefined()
  })

  it('applies custom className to the badge trigger', () => {
    const { container } = render(<IdentityVerifiedBadge className='custom-class' />)
    expect(container.querySelector('.custom-class')).toBeDefined()
  })
})
