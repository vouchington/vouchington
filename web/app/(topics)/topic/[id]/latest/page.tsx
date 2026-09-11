import { createTopicLatestPage } from '@/lib/routes/topic-navigation-factories'
export const dynamic = 'force-dynamic'
const { generateMetadata, default: Page } = createTopicLatestPage('topic')
export { generateMetadata }
export default Page
