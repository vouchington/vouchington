import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { ProvenanceBadges } from '../provenance-badges'
import type { ProvenanceTestIdPrefix } from '../provenance-test-ids'

const staffClient = {
  client_id: 'voucha_fixture_agent',
  client_name: 'Fixture Agent',
  metadata_url: null,
  verified: true,
}

const verifiedApp = {
  kind: 'verified',
  client_id: 'voucha_fixture_agent',
  client_name: 'Fixture Agent',
} as const

describe('ProvenanceBadges', () => {
  it.each([
    [{ via: 'api', app: null }, 'via API'],
    [{ via: 'mcp', app: null }, 'via MCP'],
    [{ via: 'mcp', app: verifiedApp }, 'via Fixture Agent'],
    [{ via: 'api', app: { kind: 'hostname', hostname: 'agent.example' } }, 'via agent.example'],
    // No catalog copy exists for this key, so the badge falls back to the channel.
    [{ via: 'mcp', app: { kind: 'known', key: 'no-copy-app' } }, 'via MCP'],
  ] as const)('renders the public label for %j', (provenance, text) => {
    render(
      <ProvenanceBadges
        testIdPrefix='post'
        provenance={provenance}
      />,
    )
    expect(screen.getByText(text)).toHaveAttribute('data-pw', 'post-provenance-badge')
    expect(screen.queryByText(/^Channel:/)).toBeNull()
    expect(screen.queryByText(/no-copy-app/)).toBeNull()
  })

  it('renders nothing for an entity with no provenance fields', () => {
    const { container } = render(<ProvenanceBadges testIdPrefix='post' />)
    expect(container).toBeEmptyDOMElement()
  })

  it('renders a client name as text, never as markup', () => {
    render(
      <ProvenanceBadges
        testIdPrefix='post'
        provenance={{
          via: 'mcp',
          app: { kind: 'verified', client_id: 'voucha_markup', client_name: '<b>Agent</b>' },
        }}
      />,
    )
    expect(screen.getByText('via <b>Agent</b>')).toBeInTheDocument()
    expect(document.querySelector('b')).toBeNull()
  })

  it('shows staff the raw channel on every entity, and no client on cards', () => {
    render(
      <ProvenanceBadges
        testIdPrefix='post'
        staffProvenance={{ created_via: 'swift', oauth_client: null }}
        showClient
      />,
    )
    expect(screen.getByText('Channel: swift')).toHaveAttribute('data-pw', 'post-provenance-channel')
    expect(screen.queryByText(/^Client:/)).toBeNull()

    render(
      <ProvenanceBadges
        testIdPrefix='post'
        staffProvenance={{ created_via: 'mcp', oauth_client: staffClient }}
      />,
    )
    expect(screen.getByText('Channel: mcp')).toBeInTheDocument()
    expect(screen.queryByText(/^Client:/)).toBeNull()
  })

  it('shows staff the raw OAuth client and its verification on detail pages', () => {
    render(
      <ProvenanceBadges
        testIdPrefix='post'
        provenance={{ via: 'mcp', app: verifiedApp }}
        staffProvenance={{ created_via: 'mcp', oauth_client: staffClient }}
        showClient
      />,
    )
    expect(screen.getByText('Client: Fixture Agent (voucha_fixture_agent)')).toHaveAttribute(
      'data-pw',
      'post-provenance-client',
    )
    expect(screen.getByText('Verified')).toHaveAttribute(
      'data-pw',
      'post-provenance-client-verification',
    )
  })

  it('marks an unverified client', () => {
    render(
      <ProvenanceBadges
        testIdPrefix='post'
        staffProvenance={{
          created_via: 'api',
          oauth_client: { ...staffClient, verified: false },
        }}
        showClient
      />,
    )
    expect(screen.getByText('Unverified')).toBeInTheDocument()
  })

  it('shows the channel but no client when the author is hidden from staff', () => {
    render(
      <ProvenanceBadges
        testIdPrefix='post'
        staffProvenance={{ created_via: 'mcp' }}
        showClient
      />,
    )
    expect(screen.getByText('Channel: mcp')).toBeInTheDocument()
    expect(screen.queryByText(/^Client:/)).toBeNull()
  })

  it.each<ProvenanceTestIdPrefix>(['post', 'community', 'topic', 'list', 'source'])(
    'prefixes every id of the %s badges with the entity',
    prefix => {
      render(
        <ProvenanceBadges
          testIdPrefix={prefix}
          provenance={{ via: 'mcp', app: verifiedApp }}
          staffProvenance={{ created_via: 'mcp', oauth_client: staffClient }}
          showClient
        />,
      )
      expect(screen.getByText('via Fixture Agent')).toHaveAttribute(
        'data-pw',
        `${prefix}-provenance-badge`,
      )
      expect(screen.getByText('Channel: mcp')).toHaveAttribute(
        'data-pw',
        `${prefix}-provenance-channel`,
      )
      expect(screen.getByText(/^Client:/)).toHaveAttribute('data-pw', `${prefix}-provenance-client`)
      expect(screen.getByText('Verified')).toHaveAttribute(
        'data-pw',
        `${prefix}-provenance-client-verification`,
      )
    },
  )
})
