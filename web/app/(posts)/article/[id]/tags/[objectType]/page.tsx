import { createPostTagsPage } from '@/lib/routes/post-edit-factories'
import type { Metadata } from 'next'
import { createNoIndexMetadata } from '@/lib/seo/metadata'
export const dynamic = 'force-dynamic'
export const metadata: Metadata = createNoIndexMetadata('Manage Tags')
const { default: Page } = createPostTagsPage('article', 'article')
export default Page
