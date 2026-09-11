import { createTopicNewsPage } from '@/lib/routes/topic-navigation-factories'
export const dynamic = 'force-dynamic'
const { generateMetadata, default: Page } = createTopicNewsPage('referral-program')
export { generateMetadata }
export default Page
