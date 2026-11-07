import type { ReactNode } from 'react'
import { CommunityProxyBookmarkButton } from '@/components/communities/community-proxy-bookmark-button'
import { AsideStack, StoryCard } from './entity-story-frame'
import { communityEntities } from './communities-story-fixtures'

export function CommunityAsides({ children }: { children?: ReactNode }) {
  return (
    <AsideStack>
      <StoryCard title='Community state'>
        <p className='text-sm text-muted-foreground'>
          Public and private communities use the same detail shell with different visibility badges,
          membership controls, and proxy follow or mute controls.
        </p>
      </StoryCard>
      <StoryCard title='Proxy controls'>
        <div className='flex flex-wrap gap-2'>
          <CommunityProxyBookmarkButton
            communityId={communityEntities[0]!.id}
            kind='follow'
            initialActive={false}
            data-pw='storybook-proxy-follow'
          />
          <CommunityProxyBookmarkButton
            communityId={communityEntities[0]!.id}
            kind='mute'
            initialActive={false}
            data-pw='storybook-proxy-mute'
          />
        </div>
      </StoryCard>
      {children}
    </AsideStack>
  )
}
