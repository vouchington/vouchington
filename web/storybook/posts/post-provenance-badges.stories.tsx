import type { ComponentProps } from 'react'
import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { PostProvenanceBadges } from '@/components/posts/post-provenance-badges'
import { StoryFrame } from '@/storybook/story-frame'

const meta = {
  title: 'Posts/Post Provenance Badges',
  component: PostProvenanceBadges,
} satisfies Meta<typeof PostProvenanceBadges>

export default meta
type Story = StoryObj<typeof meta>

const verifiedApp = {
  kind: 'verified',
  client_id: 'voucha_fixture_agent',
  client_name: 'Fixture Agent',
} as const

const strip = (props: ComponentProps<typeof PostProvenanceBadges>) => (
  <StoryFrame width='max-w-xl'>
    <div className='flex flex-wrap items-center gap-1.5'>
      <PostProvenanceBadges {...props} />
    </div>
  </StoryFrame>
)

export const ViaApi: Story = {
  render: () => strip({ provenance: { via: 'api', app: null } }),
}

export const ViaMcp: Story = {
  render: () => strip({ provenance: { via: 'mcp', app: null } }),
}

export const ViaVerifiedApp: Story = {
  render: () => strip({ provenance: { via: 'mcp', app: verifiedApp } }),
}

export const ViaHostname: Story = {
  render: () =>
    strip({ provenance: { via: 'api', app: { kind: 'hostname', hostname: 'agent.example' } } }),
}

/** A reviewed app whose key has no catalog copy falls back to the channel label. */
export const ViaKnownAppWithoutCopy: Story = {
  render: () => strip({ provenance: { via: 'mcp', app: { kind: 'known', key: 'fixture-agent' } } }),
}

export const StaffCardChannel: Story = {
  render: () =>
    strip({
      provenance: { via: 'mcp', app: verifiedApp },
      staffProvenance: {
        created_via: 'mcp',
        oauth_client: {
          client_id: 'voucha_fixture_agent',
          client_name: 'Fixture Agent',
          metadata_url: null,
          verified: true,
        },
      },
    }),
}

export const StaffDetailClient: Story = {
  render: () =>
    strip({
      provenance: { via: 'api', app: { kind: 'hostname', hostname: 'agent.example' } },
      staffProvenance: {
        created_via: 'api',
        oauth_client: {
          client_id: 'https://agent.example/oauth/client.json',
          client_name: 'agent.example',
          metadata_url: 'https://agent.example/oauth/client.json',
          verified: false,
        },
      },
      showClient: true,
    }),
}

export const StaffWebPost: Story = {
  render: () =>
    strip({ staffProvenance: { created_via: 'web', oauth_client: null }, showClient: true }),
}
