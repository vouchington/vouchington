export const dynamic = 'force-dynamic'
import { createTopicSettingsPage } from '@/lib/routes/topic-settings-factories'
const { generateMetadata, default: Page } = createTopicSettingsPage('rewards-program-status')
export { generateMetadata }
export default Page
