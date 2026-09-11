import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'

import { ContentRemovedNotice } from '../content-removed-notice'

describe('ContentRemovedNotice', () => {
  it('renders the moderation removal heading', () => {
    const { container } = render(<ContentRemovedNotice />)
    expect(container.querySelector('[data-pw="content-removed-notice"]')).not.toBeNull()
    expect(screen.getByText('This content was removed by a moderator.')).toBeDefined()
  })

  it('renders the fallback reason message', () => {
    render(<ContentRemovedNotice />)
    expect(screen.getByText('No additional reason was provided.')).toBeDefined()
  })

  it('renders the fallback reason when reason is null', () => {
    render(<ContentRemovedNotice reason={null} />)
    expect(screen.getByText('No additional reason was provided.')).toBeDefined()
  })

  it('renders the provided reason instead of the fallback', () => {
    render(<ContentRemovedNotice reason='This post violates our community guidelines.' />)
    expect(screen.getByText('This post violates our community guidelines.')).toBeDefined()
    expect(screen.queryByText('No additional reason was provided.')).toBeNull()
  })

  it('links "View appeals" to /my/appeals', () => {
    render(<ContentRemovedNotice />)
    const link = screen.getByRole('link', { name: 'View appeals' })
    expect(link).toHaveAttribute('href', '/my/appeals')
  })
})
