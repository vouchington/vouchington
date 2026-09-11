import { createPostDetailPage } from '@/lib/routes/post-route-factories'
export const dynamic = 'force-dynamic'
const { generateMetadata, default: Page } = createPostDetailPage('blog_post', 'blog-post')
export { generateMetadata }
export default Page
