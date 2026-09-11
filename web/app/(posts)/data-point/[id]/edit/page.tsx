import { createPostEditPage } from '@/lib/routes/post-edit-factories'
export const dynamic = 'force-dynamic'
const { generateMetadata, default: Page } = createPostEditPage('data_point', 'data-point')
export { generateMetadata }
export default Page
