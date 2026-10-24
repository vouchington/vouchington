import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { UserHostnameRelationList } from '@/components/users/user-hostname-relation-list'
import { USER_RELATION_ACTIONS } from '@/components/users/user-relation-actions'
import { UserUrlRelationList } from '@/components/users/user-url-relation-list'
import { hostnames, urlsResponse } from '@/storybook/entities/fixtures/hostnames'
import { storyCurrentUser } from '@/storybook/entities/fixtures/users'
import {
  clearStoryMutationFixture,
  setStoryMutationFixture,
} from '@/storybook/mocks/story-mutation-fixture'
import { StoryFrame } from '@/storybook/story-frame'
import type { PublicUrl } from '@/types/api-responses'

const meta = {
  title: 'Users/Relation Lists',
  parameters: { auth: { currentUser: storyCurrentUser } },
  beforeEach() {
    setStoryMutationFixture()
    return () => {
      clearStoryMutationFixture()
    }
  },
} satisfies Meta

export default meta
type Story = StoryObj<typeof meta>

const urls = urlsResponse.results as unknown as PublicUrl[]

export const HostnamesReadOnly: Story = {
  render: () => (
    <StoryFrame width='max-w-2xl'>
      <UserHostnameRelationList
        hostnames={hostnames}
        emptyTitle='No domains'
        emptyDescription='Domains will appear here.'
      />
    </StoryFrame>
  ),
}

export const HostnamesManaged: Story = {
  render: () => (
    <StoryFrame width='max-w-2xl'>
      <UserHostnameRelationList
        hostnames={hostnames.slice(0, 2)}
        emptyTitle='No domains'
        emptyDescription='Domains will appear here.'
        relationAction={USER_RELATION_ACTIONS.domain.muted}
      />
    </StoryFrame>
  ),
}

export const HostnamesEmpty: Story = {
  render: () => (
    <StoryFrame width='max-w-2xl'>
      <UserHostnameRelationList
        hostnames={[]}
        emptyTitle='No muted domains'
        emptyDescription='Domains you mute will appear here.'
      />
    </StoryFrame>
  ),
}

export const UrlsReadOnly: Story = {
  render: () => (
    <StoryFrame width='max-w-2xl'>
      <UserUrlRelationList
        urls={urls}
        emptyTitle='No links'
        emptyDescription='Links will appear here.'
      />
    </StoryFrame>
  ),
}

export const UrlsManaged: Story = {
  render: () => (
    <StoryFrame width='max-w-2xl'>
      <UserUrlRelationList
        urls={urls.slice(0, 2)}
        emptyTitle='No links'
        emptyDescription='Links will appear here.'
        relationAction={USER_RELATION_ACTIONS.url.saved}
      />
    </StoryFrame>
  ),
}

export const UrlsEmpty: Story = {
  render: () => (
    <StoryFrame width='max-w-2xl'>
      <UserUrlRelationList
        urls={[]}
        emptyTitle='No saved links'
        emptyDescription='Links you save will appear here.'
      />
    </StoryFrame>
  ),
}
