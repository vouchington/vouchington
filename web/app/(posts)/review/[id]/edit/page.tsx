import { createPostEditPage } from '@/lib/routes/post-edit-factories'
export const dynamic = 'force-dynamic'
const { generateMetadata, default: Page } = createPostEditPage('review', 'review')
export { generateMetadata }
export default Page
