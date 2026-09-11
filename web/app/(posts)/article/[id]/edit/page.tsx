import { createPostEditPage } from '@/lib/routes/post-edit-factories'
export const dynamic = 'force-dynamic'
const { generateMetadata, default: Page } = createPostEditPage('article', 'article')
export { generateMetadata }
export default Page
