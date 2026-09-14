import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { createTranslator } from '@ts-shared/ui-messages'
import { loadJsonMessages } from '@/lib/i18n/load-json-messages'
import { UserLink } from '@/components/users/user-link'
import { UserProfileLinks } from '@/components/users/profile-links'
import { UserList, UserListItem } from '@/components/users/user-list'
import { UserSearchListItemContent } from '@/components/users/user-search-list-item-content'
import { UserSearchResultCard } from '@/components/users/user-search-result-card'
import { UserProfileHeader } from '@/components/users/user-profile-header'
import { UserProfileTabs } from '@/components/users/user-profile-tabs'
import { Input } from '@/components/ui/input'
import { EntityStoryFrame, StoryGrid, StoryCard } from './entity-story-frame'
import { publicUsers, storyCurrentUser, userMetrics } from './entity-fixtures'
import { UserAsides } from './users-story-asides'
import { profileLinkGithub, profileLinkSite, profileUser } from './users-story-fixtures'
const meta = {
  title: 'Entities/Users',
  parameters: { auth: { currentUser: storyCurrentUser } },
} satisfies Meta

export default meta
type Story = StoryObj<typeof meta>

const t = createTranslator('en', await loadJsonMessages('en'))

export const Links: Story = {
  render: () => (
    <EntityStoryFrame title='User links'>
      <StoryGrid>
        {publicUsers.map(user => (
          <StoryCard
            key={user.id}
            title={user.username ?? user.id}
          >
            <UserLink user={user} />
          </StoryCard>
        ))}
      </StoryGrid>
    </EntityStoryFrame>
  ),
}

export const ListPage: Story = {
  render: () => (
    <EntityStoryFrame
      title='Users'
      aside={UserAsides}
    >
      <UserList
        users={publicUsers}
        emptyTitle='No users found'
        emptyDescription='Try a different search.'
      />
    </EntityStoryFrame>
  ),
}

export const SearchResultCard: Story = {
  render: () => (
    <EntityStoryFrame title='User search result'>
      <UserSearchResultCard
        user={publicUsers[0]!}
        currentUserId={storyCurrentUser.id}
      />
    </EntityStoryFrame>
  ),
}

export const CanonicalListItem: Story = {
  render: () => (
    <EntityStoryFrame title='Canonical user list item'>
      <UserListItem
        user={publicUsers[0]!}
        currentUserId={storyCurrentUser.id}
      />
    </EntityStoryFrame>
  ),
}

export const SearchListItemContent: Story = {
  render: () => (
    <EntityStoryFrame title='User search list item content'>
      <div className='rounded-md border bg-card p-4'>
        <UserSearchListItemContent
          user={publicUsers[0]!}
          currentUserId={storyCurrentUser.id}
        />
      </div>
    </EntityStoryFrame>
  ),
}

export const ListForm: Story = {
  render: () => (
    <EntityStoryFrame title='User search form'>
      <div className='rounded-md border bg-card p-4'>
        <Input
          aria-label='Search users'
          defaultValue='alex'
          placeholder='Search users...'
          type='search'
        />
      </div>
    </EntityStoryFrame>
  ),
}

export const MainPageContent: Story = {
  render: () => (
    <EntityStoryFrame
      title='User profile'
      aside={UserAsides}
    >
      <UserProfileHeader
        user={profileUser}
        metrics={userMetrics}
        profileLinks={[]}
        aboutHtml='<p>Alex publishes practical reviews, card setup notes, and referral resources.</p>'
      />
      <UserProfileTabs
        usernameOrId={profileUser.username!}
        metrics={userMetrics}
      />
    </EntityStoryFrame>
  ),
}

export const UserVariations: Story = {
  render: () => (
    <EntityStoryFrame title='User variations'>
      <StoryGrid>
        {publicUsers.map(user => (
          <StoryCard
            key={user.id}
            title={
              user.is_official_account
                ? 'official account'
                : user.display_account
                  ? 'display account'
                  : 'member'
            }
          >
            <UserProfileHeader
              user={{ ...storyCurrentUser, ...user }}
              metrics={userMetrics}
              profileLinks={[]}
              aboutHtml='<p>Fixture profile content for Storybook coverage.</p>'
            />
          </StoryCard>
        ))}
      </StoryGrid>
    </EntityStoryFrame>
  ),
}

export const ProfileLinks: Story = {
  render: () => (
    <EntityStoryFrame title='Profile links'>
      <StoryGrid>
        <StoryCard title='Badges'>
          <UserProfileLinks
            variant='badges'
            links={[profileLinkGithub]}
            t={t}
          />
        </StoryCard>
        <StoryCard title='Icons'>
          <UserProfileLinks
            variant='icons'
            links={[profileLinkSite, profileLinkGithub]}
            t={t}
          />
        </StoryCard>
      </StoryGrid>
    </EntityStoryFrame>
  ),
}

export const Asides: Story = {
  render: () => (
    <EntityStoryFrame title='User asides'>
      <UserAsides />
    </EntityStoryFrame>
  ),
}
