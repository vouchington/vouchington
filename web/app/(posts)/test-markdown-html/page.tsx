/**
 * Test page for demonstrating markdown_to_html rendering
 * Fetches posts from paginated endpoint and renders with pre-resolved mentions
 */

import { getPosts } from '@/lib/api/server'
import { PostDetail } from '@/components/posts/post-detail'
import { Card } from '@/components/ui/card'
import type { Metadata } from 'next'
import { createNoIndexMetadata } from '@/lib/seo/metadata'
import { PageWithAside } from '@/components/page-with-aside'
import { getTranslations } from '@/lib/i18n/get-translations'

export const dynamic = 'force-dynamic'
export const metadata: Metadata = createNoIndexMetadata('Markdown HTML Rendering Test')

export default async function TestMarkdownHtmlPage() {
  // Fetch posts from paginated endpoint (includes markdown_to_html)
  const t = await getTranslations()
  const data = await getPosts({ limit: 5 })

  return (
    <PageWithAside showFooter={false}>
      <div className='space-y-6 py-6'>
        <Card className='p-6'>
          <h1
            data-pw='test-markdown-html-page-heading'
            className='text-2xl font-bold'
          >
            {t('extracted.testMarkdownHtml.page.markdownHtmlRenderingTest_9454ecaa')}
          </h1>
          <p className='text-muted-foreground mt-2'>
            {t('extracted.testMarkdownHtml.page.thisPageDemonstratesRenderingPostsWith_2faaed5f')}
          </p>
        </Card>

        <div className='space-y-6'>
          {data.results.map(result => {
            const post = data.posts[result.id]
            if (!post) return null

            const html = data.markdown_to_html?.[post.id] ?? ''
            const election = data.post_elections?.[post.id]

            return (
              <PostDetail
                key={post.id}
                post={post}
                election={election}
                html={html}
                hideDownCount={false}
              />
            )
          })}
        </div>

        {data.results.length === 0 && (
          <Card className='p-6'>
            <p className='text-center text-muted-foreground'>
              {t('extracted.testMarkdownHtml.page.noPostsFound_3d0c20ef')}
            </p>
          </Card>
        )}
      </div>
    </PageWithAside>
  )
}
