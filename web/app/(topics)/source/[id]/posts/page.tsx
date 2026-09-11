import { createTopicPostsPage } from '@/lib/routes/topic-subpage-factories'
export const dynamic = 'force-dynamic'
const { generateMetadata, default: Page } = createTopicPostsPage('source')
export { generateMetadata }
export default Page
