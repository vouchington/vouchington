import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import { FediverseInstanceMetadata } from '../fediverse-instance-metadata'

const topic = {
  id: 'topic-1',
  slug: 'social-example',
  topic_type: 'fediverse_instance' as const,
  hostname: {
    __entity_type: 'hostname' as const,
    id: 'hostname-1',
    hostname: 'social.example',
    topic_id: 'topic-1',
  },
}

describe('FediverseInstanceMetadata', () => {
  it('renders classified public metadata with locale-aware counts and trust', () => {
    render(
      <FediverseInstanceMetadata
        topic={topic}
        attributes={{
          software: 'mastodon',
          protocol: 'activitypub',
          nodeinfo_software_version: '4.4.0',
          total_users: 1200,
          monthly_active_users: 340,
          open_registrations: true,
        }}
        hostnameElection={{
          __entity_type: 'hostname_election',
          id: 'hostname-1',
          votes_score_net: 10,
          votes_count_up: 12,
          votes_count_down: 2,
        }}
      />,
    )

    expect(screen.getByText('mastodon 4.4.0')).toBeDefined()
    expect(screen.getByText('activitypub')).toBeDefined()
    expect(screen.getByText('1,200')).toBeDefined()
    expect(screen.getByText('340')).toBeDefined()
    expect(screen.getByText('Open')).toBeDefined()
    expect(screen.getByText('Trusted')).toBeDefined()
  })

  it('renders explicit unavailable and unrated fallbacks', () => {
    render(
      <FediverseInstanceMetadata
        topic={topic}
        attributes={null}
        hostnameElection={null}
      />,
    )

    expect(screen.getAllByText('Unknown')).toHaveLength(5)
    expect(screen.getByText('Unrated')).toBeDefined()
  })

  it('renders a localized unrated link instead of a domain badge without a hostname', () => {
    render(
      <FediverseInstanceMetadata
        topic={{ ...topic, hostname: null }}
        attributes={null}
        hostnameElection={null}
      />,
    )

    const unratedLink = screen.getByRole('link', { name: 'Unrated' })
    expect(unratedLink.getAttribute('href')).toBe('/instance/social-example')
    expect(screen.queryByTitle('Unrated: no votes yet')).toBeNull()
  })
})
