import { createPostEditPage } from '@/lib/routes/post-edit-factories'
export const dynamic = 'force-dynamic'
const { generateMetadata, default: Page } = createPostEditPage('blog_post', 'blog-post')
export { generateMetadata }
export default Page
