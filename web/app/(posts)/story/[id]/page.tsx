import { createPostDetailPage } from '@/lib/routes/post-route-factories'
export const dynamic = 'force-dynamic'
const { generateMetadata, default: Page } = createPostDetailPage('story', 'story')
export { generateMetadata }
export default Page
