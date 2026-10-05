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

const strip = (props: ComponentProps<typeof PostProvenanceBadges>) => (
  <StoryFrame width='max-w-xl'>
    <div className='flex flex-wrap items-center gap-1.5'>
      <PostProvenanceBadges {...props} />
    </div>
  </StoryFrame>
)

export const ViaApi: Story = {
  render: () => strip({ provenance: { via: 'api', app_name: null } }),
}

export const ViaMcp: Story = {
  render: () => strip({ provenance: { via: 'mcp', app_name: null } }),
}

export const ViaNamedApp: Story = {
  render: () => strip({ provenance: { via: 'mcp', app_name: 'Fixture Agent' } }),
}

export const StaffCardChannel: Story = {
  render: () =>
    strip({
      provenance: { via: 'mcp', app_name: 'Fixture Agent' },
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
      provenance: { via: 'api', app_name: 'agent.example' },
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
