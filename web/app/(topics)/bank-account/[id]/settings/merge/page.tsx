export const dynamic = 'force-dynamic'
import { createTopicSettingsMergePage } from '@/lib/routes/topic-management-factories'
const { generateMetadata, default: Page } = createTopicSettingsMergePage()
export { generateMetadata }
export default Page
