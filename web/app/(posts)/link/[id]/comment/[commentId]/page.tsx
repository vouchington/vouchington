import { createCommentPermalinkPage } from '@/lib/routes/post-comment-factories'
export const dynamic = 'force-dynamic'
const { generateMetadata, default: Page } = createCommentPermalinkPage('link', 'link')
export { generateMetadata }
export default Page
