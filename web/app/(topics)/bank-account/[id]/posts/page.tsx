import { createTopicPostsPage } from '@/lib/routes/topic-subpage-factories'
export const dynamic = 'force-dynamic'
const { generateMetadata, default: Page } = createTopicPostsPage('bank-account')
export { generateMetadata }
export default Page
