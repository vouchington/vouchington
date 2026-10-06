import { makeFeed } from '@/test-helpers/components/sources/source-list-item-rendering.mock-support'

import { describe, expect, it } from 'vitest'

import { configure, render, screen } from '@testing-library/react'

import { SourceListItem } from '../source-list-item'

configure({ testIdAttribute: 'data-pw' })

const staffClient = {
  client_id: 'voucha_fixture_agent',
  client_name: 'Fixture Agent',
  metadata_url: null,
  verified: true,
}

const renderItem = (overrides: Parameters<typeof makeFeed>[0]) =>
  render(
    <SourceListItem
      feed={makeFeed(overrides)}
      isFollowing={false}
      isFollowingTopic={false}
    />,
  )

describe('provenance on source cards', () => {
  it('shows the public label in the card meta row', () => {
    renderItem({ provenance: { via: 'mcp', app: null } })
    expect(screen.getByTestId('source-provenance-badge')).toHaveTextContent('via MCP')
  })

  it('shows no label for a source added on the web', () => {
    renderItem({})
    expect(screen.queryByTestId('source-provenance-badge')).toBeNull()
    expect(screen.queryByTestId('source-provenance-channel')).toBeNull()
  })

  it('shows staff the channel but leaves the client to the detail page', () => {
    renderItem({
      provenance: { via: 'api', app: null },
      staff_provenance: { created_via: 'api', oauth_client: staffClient },
    })
    expect(screen.getByTestId('source-provenance-channel')).toHaveTextContent('Channel: api')
    expect(screen.queryByTestId('source-provenance-client')).toBeNull()
    expect(screen.queryByTestId('source-provenance-client-verification')).toBeNull()
  })
})
