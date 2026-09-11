import { createTopicDataPointsPage } from '@/lib/routes/topic-subpage-factories'
export const dynamic = 'force-dynamic'
const { generateMetadata, default: Page } = createTopicDataPointsPage('referral-program')
export { generateMetadata }
export default Page
