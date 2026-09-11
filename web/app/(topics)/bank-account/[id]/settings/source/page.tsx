export const dynamic = 'force-dynamic'
import { createTopicSettingsSourcePage } from '@/lib/routes/topic-management-factories'
const { generateMetadata, default: Page } = createTopicSettingsSourcePage()
export { generateMetadata }
export default Page
