import { createTopicReferralLinksPage } from '@/lib/routes/topic-referral-factories'
export const dynamic = 'force-dynamic'
const { generateMetadata, default: Page } = createTopicReferralLinksPage('card')
export { generateMetadata }
export default Page
