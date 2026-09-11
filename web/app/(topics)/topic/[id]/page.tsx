import { createTopicRootPage } from '@/lib/routes/topic-subpage-factories'
export const dynamic = 'force-dynamic'
const { generateMetadata, default: Page } = createTopicRootPage('topic')
export { generateMetadata }
export default Page
