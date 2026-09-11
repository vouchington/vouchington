import { createPostDetailPage } from '@/lib/routes/post-route-factories'
export const dynamic = 'force-dynamic'
const { generateMetadata, default: Page } = createPostDetailPage('link', 'link')
export { generateMetadata }
export default Page
