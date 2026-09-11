import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { OfficialAccountBadge, UserOfficialBadge } from '../user-official-badge'

describe('OfficialAccountBadge', () => {
  it('renders the official label', () => {
    render(<OfficialAccountBadge />)

    expect(screen.getByText('official')).toBeInTheDocument()
  })

  it('merges custom classes onto the badge', () => {
    render(<OfficialAccountBadge className='uppercase' />)

    expect(screen.getByText('official')).toHaveClass('text-[10px]', 'uppercase')
  })
})

describe('UserOfficialBadge', () => {
  it('uses a neutral official badge when the account is not known to be an agent', () => {
    render(<UserOfficialBadge isOfficial />)

    expect(screen.getByText('official')).toBeInTheDocument()
    expect(screen.queryByText('agent')).not.toBeInTheDocument()
  })

  it('uses the agent badge for true agent accounts', () => {
    render(
      <UserOfficialBadge
        isOfficial
        isAgent
      />,
    )

    expect(screen.getByText('agent')).toBeInTheDocument()
    expect(screen.queryByText('official')).not.toBeInTheDocument()
  })

  it('renders nothing for non-official accounts', () => {
    const { container } = render(<UserOfficialBadge isOfficial={false} />)

    expect(container).toBeEmptyDOMElement()
  })
})
