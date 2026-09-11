import { createTopicNewsPage } from '@/lib/routes/topic-navigation-factories'
export const dynamic = 'force-dynamic'
const { generateMetadata, default: Page } = createTopicNewsPage('rewards-program-status')
export { generateMetadata }
export default Page
