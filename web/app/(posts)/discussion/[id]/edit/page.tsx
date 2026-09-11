import { createPostEditPage } from '@/lib/routes/post-edit-factories'
export const dynamic = 'force-dynamic'
const { generateMetadata, default: Page } = createPostEditPage('discussion', 'discussion')
export { generateMetadata }
export default Page
