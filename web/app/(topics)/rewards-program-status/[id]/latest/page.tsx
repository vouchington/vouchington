import { createTopicLatestPage } from '@/lib/routes/topic-navigation-factories'
export const dynamic = 'force-dynamic'
const { generateMetadata, default: Page } = createTopicLatestPage('rewards-program-status')
export { generateMetadata }
export default Page
