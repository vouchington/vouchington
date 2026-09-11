import { createTopicReviewsPage } from '@/lib/routes/topic-subpage-factories'
export const dynamic = 'force-dynamic'
const { generateMetadata, default: Page } = createTopicReviewsPage('card')
export { generateMetadata }
export default Page
