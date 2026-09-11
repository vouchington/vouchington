export const dynamic = 'force-dynamic'
import { createTopicSettingsAliasesPage } from '@/lib/routes/topic-management-factories'
const { generateMetadata, default: Page } = createTopicSettingsAliasesPage()
export { generateMetadata }
export default Page
