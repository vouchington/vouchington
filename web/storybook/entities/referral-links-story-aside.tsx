import { ReferralLinksAsideContent } from '@/components/referral-links/referral-links-aside-content'
import { AsideStack } from './entity-story-frame'
import { emptyResponse, sampleResponse } from './referral-links-story-fixtures'

export function ReferralLinksAside() {
  return (
    <AsideStack>
      <ReferralLinksAsideContent
        topicId='rp-chase'
        topicType='referral-program'
        response={sampleResponse}
      />
    </AsideStack>
  )
}

export function EmptyReferralLinksAside() {
  return (
    <AsideStack>
      <ReferralLinksAsideContent
        topicId='rp-chase'
        topicSlug='chase-sapphire-preferred'
        topicType='referral-program'
        response={emptyResponse}
      />
    </AsideStack>
  )
}
