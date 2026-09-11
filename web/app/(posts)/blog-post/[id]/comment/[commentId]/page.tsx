import { createCommentPermalinkPage } from '@/lib/routes/post-comment-factories'
export const dynamic = 'force-dynamic'
const { generateMetadata, default: Page } = createCommentPermalinkPage('blog_post', 'blog-post')
export { generateMetadata }
export default Page
