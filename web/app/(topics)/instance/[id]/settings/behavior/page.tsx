export const dynamic = 'force-dynamic'
import { createTopicSettingsBehaviorPage } from '@/lib/routes/topic-settings-factories'
const { generateMetadata, default: Page } = createTopicSettingsBehaviorPage('instance')
export { generateMetadata }
export default Page
