import { createTopicReferralLinksPage } from '@/lib/routes/topic-referral-factories'
export const dynamic = 'force-dynamic'
const { generateMetadata, default: Page } = createTopicReferralLinksPage('rewards-program-status')
export { generateMetadata }
export default Page
