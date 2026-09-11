import { createCommentPermalinkPage } from '@/lib/routes/post-comment-factories'
export const dynamic = 'force-dynamic'
const { generateMetadata, default: Page } = createCommentPermalinkPage('discussion', 'discussion')
export { generateMetadata }
export default Page
