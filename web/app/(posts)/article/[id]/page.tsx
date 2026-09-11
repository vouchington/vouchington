import { createPostDetailPage } from '@/lib/routes/post-route-factories'
export const dynamic = 'force-dynamic'
const { generateMetadata, default: Page } = createPostDetailPage('article', 'article')
export { generateMetadata }
export default Page
