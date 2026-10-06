import { configure, render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { CommunityCard } from '../community-card'
import { makeCommunity } from '@/test-helpers/api-responses/communities'

configure({ testIdAttribute: 'data-pw' })

const staffClient = {
  client_id: 'voucha_fixture_agent',
  client_name: 'Fixture Agent',
  metadata_url: null,
  verified: true,
}

const renderCard = (overrides: Parameters<typeof makeCommunity>[0]) =>
  render(
    <CommunityCard
      community={makeCommunity(overrides)}
      hideJoinButton
    />,
  )

describe('provenance on community cards', () => {
  it('shows the public label next to the name', () => {
    renderCard({ provenance: { via: 'api', app: null } })
    expect(screen.getByTestId('community-provenance-badge')).toHaveTextContent('via API')
  })

  it('shows no label for a community created on the web', () => {
    renderCard({})
    expect(screen.queryByText(/^via /)).toBeNull()
    expect(screen.queryByText(/^Channel:/)).toBeNull()
  })

  it('shows staff the channel but leaves the client to the detail page', () => {
    renderCard({
      provenance: { via: 'mcp', app: null },
      staff_provenance: { created_via: 'mcp', oauth_client: staffClient },
    })
    expect(screen.getByTestId('community-provenance-channel')).toHaveTextContent('Channel: mcp')
    expect(screen.queryByTestId('community-provenance-client')).toBeNull()
    expect(screen.queryByTestId('community-provenance-client-verification')).toBeNull()
  })
})
