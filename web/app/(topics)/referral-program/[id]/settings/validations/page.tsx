export const dynamic = 'force-dynamic'
import { createTopicSettingsValidationsPage } from '@/lib/routes/topic-management-factories'
const { generateMetadata, default: Page } = createTopicSettingsValidationsPage()
export { generateMetadata }
export default Page
