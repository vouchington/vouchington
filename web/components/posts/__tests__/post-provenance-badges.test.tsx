import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { PostProvenanceBadges } from '../post-provenance-badges'

const staffClient = {
  client_id: 'voucha_fixture_agent',
  client_name: 'Fixture Agent',
  metadata_url: null,
  verified: true,
}

describe('PostProvenanceBadges', () => {
  it.each([
    [{ via: 'api', app_name: null }, 'via API'],
    [{ via: 'mcp', app_name: null }, 'via MCP'],
    [{ via: 'mcp', app_name: 'Fixture Agent' }, 'via Fixture Agent'],
    [{ via: 'api', app_name: 'agent.example' }, 'via agent.example'],
  ] as const)('renders the public label for %j', (provenance, text) => {
    render(<PostProvenanceBadges provenance={provenance} />)
    expect(screen.getByText(text)).toHaveAttribute('data-pw', 'post-provenance-badge')
    expect(screen.queryByText(/^Channel:/)).toBeNull()
  })

  it('renders nothing for a post with no provenance fields', () => {
    const { container } = render(<PostProvenanceBadges />)
    expect(container).toBeEmptyDOMElement()
  })

  it('renders an app name as text, never as markup', () => {
    render(<PostProvenanceBadges provenance={{ via: 'mcp', app_name: '<b>Agent</b>' }} />)
    expect(screen.getByText('via <b>Agent</b>')).toBeInTheDocument()
    expect(document.querySelector('b')).toBeNull()
  })

  it('shows staff the raw channel on every post, and no client on cards', () => {
    render(
      <PostProvenanceBadges
        staffProvenance={{ created_via: 'swift', oauth_client: null }}
        showClient
      />,
    )
    expect(screen.getByText('Channel: swift')).toHaveAttribute('data-pw', 'post-provenance-channel')
    expect(screen.queryByText(/^Client:/)).toBeNull()

    render(
      <PostProvenanceBadges staffProvenance={{ created_via: 'mcp', oauth_client: staffClient }} />,
    )
    expect(screen.getByText('Channel: mcp')).toBeInTheDocument()
    expect(screen.queryByText(/^Client:/)).toBeNull()
  })

  it('shows staff the raw OAuth client and its verification on detail pages', () => {
    render(
      <PostProvenanceBadges
        provenance={{ via: 'mcp', app_name: 'Fixture Agent' }}
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
      <PostProvenanceBadges
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
      <PostProvenanceBadges
        staffProvenance={{ created_via: 'mcp' }}
        showClient
      />,
    )
    expect(screen.getByText('Channel: mcp')).toBeInTheDocument()
    expect(screen.queryByText(/^Client:/)).toBeNull()
  })
})
