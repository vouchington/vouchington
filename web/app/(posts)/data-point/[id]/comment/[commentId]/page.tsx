import { createCommentPermalinkPage } from '@/lib/routes/post-comment-factories'
export const dynamic = 'force-dynamic'
const { generateMetadata, default: Page } = createCommentPermalinkPage('data_point', 'data-point')
export { generateMetadata }
export default Page
