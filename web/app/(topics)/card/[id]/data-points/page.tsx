import { createTopicDataPointsPage } from '@/lib/routes/topic-subpage-factories'
export const dynamic = 'force-dynamic'
const { generateMetadata, default: Page } = createTopicDataPointsPage('card')
export { generateMetadata }
export default Page
