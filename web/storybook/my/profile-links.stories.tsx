import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { useState } from 'react'
import { ProfileLinkRow } from '@/components/my/profile-link-row'
import { ProfileLinks } from '@/components/my/profile-links'
import { ProfileLinkTypeSelect } from '@/components/my/profile-link-type-select'
import { landingPageCandidates } from '@/storybook/entities/fixtures/landing'
import { clearMyAccountFixture, setMyAccountFixture } from '@/storybook/mocks/my-account-fixture'
import { StoryFrame } from '@/storybook/story-frame'
import type { ProfileLinkType } from '@/types/user'

const meta = {
  title: 'My/Profile Links',
  beforeEach() {
    setMyAccountFixture()
    return () => clearMyAccountFixture()
  },
} satisfies Meta

export default meta
type Story = StoryObj<typeof meta>

const links = landingPageCandidates.profile_links

export const WithLinks: Story = {
  render: () => (
    <StoryFrame width='max-w-xl'>
      <ProfileLinks initialLinks={links} />
    </StoryFrame>
  ),
}

export const Empty: Story = {
  render: () => (
    <StoryFrame width='max-w-xl'>
      <ProfileLinks initialLinks={[]} />
    </StoryFrame>
  ),
}

const noop = () => undefined

export const RowMiddle: Story = {
  render: () => (
    <StoryFrame width='max-w-xl'>
      <ProfileLinkRow
        link={links[0]!}
        loading={false}
        canMoveUp
        canMoveDown
        onMoveUp={noop}
        onMoveDown={noop}
        onEdit={noop}
        onDelete={noop}
      />
    </StoryFrame>
  ),
}

export const RowHandleSaving: Story = {
  render: () => (
    <StoryFrame width='max-w-xl'>
      <ProfileLinkRow
        link={links[1]!}
        loading
        canMoveUp
        canMoveDown={false}
        onMoveUp={noop}
        onMoveDown={noop}
        onEdit={noop}
        onDelete={noop}
      />
    </StoryFrame>
  ),
}

function TypeSelectDemo() {
  const [value, setValue] = useState<ProfileLinkType>('github')
  return (
    <ProfileLinkTypeSelect
      value={value}
      onValueChange={setValue}
    />
  )
}

export const TypeSelect: Story = {
  render: () => (
    <StoryFrame width='max-w-xs'>
      <TypeSelectDemo />
    </StoryFrame>
  ),
}
