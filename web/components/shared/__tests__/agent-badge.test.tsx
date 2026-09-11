import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { AgentBadge } from '../agent-badge'

describe('AgentBadge', () => {
  it('renders the agent label with a Playwright test hook', () => {
    render(<AgentBadge />)

    const badge = screen.getByText('agent')
    expect(badge).toHaveAttribute('data-pw', 'agent-badge')
  })

  it('merges custom classes onto the badge', () => {
    render(<AgentBadge className='uppercase' />)

    expect(screen.getByText('agent')).toHaveClass('text-[10px]', 'uppercase')
  })
})
