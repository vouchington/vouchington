import { createPostDetailPage } from '@/lib/routes/post-route-factories'
export const dynamic = 'force-dynamic'
const { generateMetadata, default: Page } = createPostDetailPage('review', 'review')
export { generateMetadata }
export default Page
