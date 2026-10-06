import { describe, expect, it } from 'vitest'

import { mockMetrics, mockTopic } from '@/test-helpers/components/topics/topic-card.mock-support'

import { render, screen } from '@testing-library/react'

import { TopicCard } from '../topic-card'

const staffClient = {
  client_id: 'voucha_fixture_agent',
  client_name: 'Fixture Agent',
  metadata_url: null,
  verified: true,
}

describe('provenance on topic cards', () => {
  it('shows the public label next to the type badge', () => {
    render(
      <TopicCard
        topic={{ ...mockTopic, provenance: { via: 'api', app: null } }}
        metrics={mockMetrics}
      />,
    )
    expect(screen.getByTestId('topic-provenance-badge')).toHaveTextContent('via API')
  })

  it('shows no label for a topic created on the web', () => {
    render(<TopicCard topic={mockTopic} />)
    expect(screen.queryByTestId('topic-provenance-badge')).toBeNull()
    expect(screen.queryByTestId('topic-provenance-channel')).toBeNull()
  })

  it('shows staff the channel but leaves the client to the detail page', () => {
    render(
      <TopicCard
        topic={{
          ...mockTopic,
          provenance: { via: 'mcp', app: null },
          staff_provenance: { created_via: 'mcp', oauth_client: staffClient },
        }}
      />,
    )
    expect(screen.getByTestId('topic-provenance-channel')).toHaveTextContent('Channel: mcp')
    expect(screen.queryByTestId('topic-provenance-client')).toBeNull()
    expect(screen.queryByTestId('topic-provenance-client-verification')).toBeNull()
  })
})
