import { createTopicReferralLinksPage } from '@/lib/routes/topic-referral-factories'
export const dynamic = 'force-dynamic'
const { generateMetadata, default: Page } = createTopicReferralLinksPage('referral-program')
export { generateMetadata }
export default Page
