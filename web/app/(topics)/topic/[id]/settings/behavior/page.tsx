export const dynamic = 'force-dynamic'
import { createTopicSettingsBehaviorPage } from '@/lib/routes/topic-settings-factories'
const { generateMetadata, default: Page } = createTopicSettingsBehaviorPage('topic')
export { generateMetadata }
export default Page
