import Link from 'next/link'
import { EmptyState } from '@/components/shared/empty-state'
import { Button } from '@/components/ui/button'

export function FeedReferralLinksEmptyState({
  title,
  description,
  findFriendsLabel,
  shareYourLinksLabel,
}: {
  title: string
  description: string
  findFriendsLabel: string
  shareYourLinksLabel: string
}) {
  return (
    <EmptyState
      icon='inbox'
      title={title}
      description={description}
    >
      <div className='flex gap-2'>
        <Button
          asChild
          variant='outline'
          size='default'
        >
          <Link
            data-pw='feed-referral-links-list-page-find-friends'
            href='/my/friend-recommendations'
            prefetch={false}
          >
            {findFriendsLabel}
          </Link>
        </Button>
        <Button
          asChild
          variant='outline'
          size='default'
        >
          <Link
            data-pw='feed-referral-links-list-page-share-your-links'
            href='/my/referral-links'
            prefetch={false}
          >
            {shareYourLinksLabel}
          </Link>
        </Button>
      </div>
    </EmptyState>
  )
}
