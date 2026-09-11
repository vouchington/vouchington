export const dynamic = 'force-dynamic'
import { createTopicSettingsPage } from '@/lib/routes/topic-settings-factories'
const { generateMetadata, default: Page } = createTopicSettingsPage('source')
export { generateMetadata }
export default Page
