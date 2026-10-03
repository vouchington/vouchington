import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { UserAccountBadge } from '../user-account-badge'

describe('UserAccountBadge', () => {
  it.each([
    ['official', 'Official'],
    ['system', 'System'],
    ['ai_agent', 'AI Agent'],
  ] as const)('renders the %s label', (accountType, label) => {
    render(
      <UserAccountBadge
        accountType={accountType}
        className='uppercase'
      />,
    )
    expect(screen.getByText(label)).toHaveClass('text-[10px]', 'uppercase')
    expect(screen.getByText(label)).toHaveAttribute('data-pw', 'user-account-badge')
  })

  it('renders nothing for a member', () => {
    const { container } = render(<UserAccountBadge accountType={null} />)
    expect(container).toBeEmptyDOMElement()
  })
})
