export const dynamic = 'force-dynamic'
import { createTopicSettingsBehaviorPage } from '@/lib/routes/topic-settings-factories'
const { generateMetadata, default: Page } = createTopicSettingsBehaviorPage('bank-account')
export { generateMetadata }
export default Page
