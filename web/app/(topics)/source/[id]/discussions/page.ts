import { createTopicDiscussionsPage } from '@/lib/routes/topic-navigation-factories'
import { createNoIndexMetadata } from '@/lib/seo/metadata'
import type { Metadata } from 'next'
export const dynamic = 'force-dynamic'
export const metadata: Metadata = createNoIndexMetadata()
const { default: Page } = createTopicDiscussionsPage('source')
export default Page
