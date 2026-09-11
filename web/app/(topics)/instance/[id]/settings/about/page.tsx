export const dynamic = 'force-dynamic'
import { createTopicSettingsAboutPage } from '@/lib/routes/topic-settings-factories'
const { generateMetadata, default: Page } = createTopicSettingsAboutPage('instance')
export { generateMetadata }
export default Page
