import { createTopicPostsPage } from '@/lib/routes/topic-subpage-factories'
export const dynamic = 'force-dynamic'
const { generateMetadata, default: Page } = createTopicPostsPage('card')
export { generateMetadata }
export default Page
