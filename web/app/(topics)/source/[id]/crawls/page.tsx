import { createTopicSourceCrawlsPage } from '@/lib/routes/topic-management-factories'

export const dynamic = 'force-dynamic'

const page = createTopicSourceCrawlsPage()
export const generateMetadata = page.generateMetadata
export default page.default
