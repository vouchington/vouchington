import { createTopicReferralLinksPage } from '@/lib/routes/topic-referral-factories'
export const dynamic = 'force-dynamic'
const { generateMetadata, default: Page } = createTopicReferralLinksPage('bank-account')
export { generateMetadata }
export default Page
