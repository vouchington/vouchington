export const dynamic = 'force-dynamic'
import { createTopicSettingsBehaviorPage } from '@/lib/routes/topic-settings-factories'
const { generateMetadata, default: Page } = createTopicSettingsBehaviorPage('card')
export { generateMetadata }
export default Page
