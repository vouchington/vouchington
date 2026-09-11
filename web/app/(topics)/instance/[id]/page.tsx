import { createTopicRootPage } from '@/lib/routes/topic-subpage-factories'
export const dynamic = 'force-dynamic'
const { generateMetadata, default: Page } = createTopicRootPage('instance')
export { generateMetadata }
export default Page
