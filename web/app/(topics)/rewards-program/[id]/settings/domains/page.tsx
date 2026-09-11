export const dynamic = 'force-dynamic'
import { createTopicSettingsDomainsPage } from '@/lib/routes/topic-management-factories'
const { generateMetadata, default: Page } = createTopicSettingsDomainsPage()
export { generateMetadata }
export default Page
