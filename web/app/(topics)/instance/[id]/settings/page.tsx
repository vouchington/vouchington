export const dynamic = 'force-dynamic'
import { createTopicSettingsPage } from '@/lib/routes/topic-settings-factories'
const { generateMetadata, default: Page } = createTopicSettingsPage('instance')
export { generateMetadata }
export default Page
