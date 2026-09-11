import { ShareLandingPageBanner } from '@/components/users/share-landing-page-banner'
import { UserActionsAside } from '@/components/users/user-actions-aside'
import { UserSignalElectionCard } from '@/components/users/user-signal-election-card'
import { UserVouchElectionCard } from '@/components/users/user-vouch-election-card'
import { UserTagsAsideView } from '@/components/users/user-tags-aside-view'
import { Check, X } from 'lucide-react'
import { AsideStack } from './entity-story-frame'
import { storyCurrentUser } from './entity-fixtures'
import { profileUser } from './users-story-fixtures'

export function UserAsides() {
  return (
    <AsideStack>
      <ShareLandingPageBanner username={storyCurrentUser.username!} />
      <UserActionsAside userId={profileUser.id} />
      <UserSignalElectionCard
        userId={profileUser.id}
        title='Shared Signal Check'
        description='Configurable user signal card used by trust checks.'
        submitVote={async () => undefined}
        errorMessage='Failed to update signal.'
        data-pw='storybook-user-signal-card'
        actions={[
          {
            choice: 'vouch',
            label: 'Approve',
            ariaLabel: 'Approve Alex Morgan',
            tooltip: 'Submit a positive signal',
            successMessage: 'Approved.',
            icon: Check,
          },
          {
            choice: 'disavow',
            label: 'Reject',
            ariaLabel: 'Reject Alex Morgan',
            tooltip: 'Submit a negative signal',
            successMessage: 'Rejected.',
            icon: X,
            variant: 'destructive',
          },
        ]}
      />
      <UserVouchElectionCard
        userId={profileUser.id}
        displayName='Alex Morgan'
        submitVote={async () => undefined}
        onDisavowSubmitted={() => undefined}
        data-pw='storybook-user-vouch-card'
      />
      <UserTagsAsideView
        userId={profileUser.id}
        canManageUserTags
        relations={[]}
        catalog={[
          { id: 'bot-topic', slug: 'bot', label: 'Bot' },
          { id: 'spammer-topic', slug: 'spammer', label: 'Spammer' },
        ]}
      />
    </AsideStack>
  )
}
