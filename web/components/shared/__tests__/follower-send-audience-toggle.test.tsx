import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { FollowerSendAudienceToggle } from '../follower-send-audience-toggle'

describe('FollowerSendAudienceToggle', () => {
  it('names the single-select audience radiogroup', () => {
    const onAudienceChange = vi.fn<(audience: 'all_followers' | 'selected_followers') => void>()

    render(
      <FollowerSendAudienceToggle
        audience='all_followers'
        onAudienceChange={onAudienceChange}
      />,
    )

    expect(screen.getByRole('radiogroup', { name: 'Send audience' })).toBeInTheDocument()
  })

  it('reports selected audience changes', () => {
    const onAudienceChange = vi.fn<(audience: 'all_followers' | 'selected_followers') => void>()

    render(
      <FollowerSendAudienceToggle
        audience='all_followers'
        onAudienceChange={onAudienceChange}
      />,
    )

    fireEvent.click(screen.getByRole('radio', { name: 'Selected followers' }))

    expect(onAudienceChange).toHaveBeenCalledWith('selected_followers')
  })
})
