import { createTopicSourceCrawlDetailPage } from '@/lib/routes/topic-management-factories'

export const dynamic = 'force-dynamic'

const page = createTopicSourceCrawlDetailPage()
export const generateMetadata = page.generateMetadata
export default page.default
