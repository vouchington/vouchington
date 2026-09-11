export const dynamic = 'force-dynamic'
import { createTopicSettingsAboutPage } from '@/lib/routes/topic-settings-factories'
const { generateMetadata, default: Page } = createTopicSettingsAboutPage('card')
export { generateMetadata }
export default Page
