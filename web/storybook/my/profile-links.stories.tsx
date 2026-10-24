import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { ProfileLinkRow } from '@/components/my/profile-link-row'
import { ProfileLinks } from '@/components/my/profile-links'
import { clearMyAccountFixture, setMyAccountFixture } from '@/storybook/mocks/my-account-fixture'
import { StoryFrame } from '@/storybook/story-frame'
import type { ProfileLink } from '@/types/user'

const meta = {
  title: 'My/Profile Links',
  beforeEach() {
    setMyAccountFixture()
    return () => clearMyAccountFixture()
  },
} satisfies Meta

export default meta
type Story = StoryObj<typeof meta>

const links: ProfileLink[] = [
  {
    id: 'profile-link-1',
    user_id: 'user-1',
    link_type: 'url',
    sort_order: 0,
    url: 'https://portfolio.example',
    handle: null,
    name: 'My Portfolio',
    image_id: null,
    created_at: '2026-01-04T12:00:00.000Z',
    updated_at: '2026-01-04T12:00:00.000Z',
  },
  {
    id: 'profile-link-2',
    user_id: 'user-1',
    link_type: 'github',
    sort_order: 1,
    url: null,
    handle: 'alexmorgan',
    name: null,
    image_id: null,
    created_at: '2026-01-05T12:00:00.000Z',
    updated_at: '2026-01-05T12:00:00.000Z',
  },
]

export const Links: Story = {
  render: () => (
    <StoryFrame>
      <ProfileLinks initialLinks={links} />
    </StoryFrame>
  ),
}

export const Row: Story = {
  render: () => (
    <StoryFrame>
      <ProfileLinkRow
        link={links[0]!}
        loading={false}
        canMoveUp
        canMoveDown
        onMoveUp={() => {}}
        onMoveDown={() => {}}
        onEdit={() => {}}
        onDelete={() => {}}
      />
    </StoryFrame>
  ),
}
