'use client'

import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { MARKDOWN_CONTENT_FEATURES_RICH } from '@/components/shared/markdown-content-features'
import { MarkdownContent } from '@/components/shared/markdown-content'
import { ReviewContentCounter } from '../review-content-counter'
import type { PostType } from '@/types/posts'
import { useTranslations } from '@/lib/i18n/use-translations'

export function ContentEditor({
  activeTab,
  contentLocked,
  markdown,
  postType,
  previewHtml,
  previewLoading,
  reviewCharCount,
  reviewSentenceCount,
  reviewWordCount,
  setActiveTab,
  setMarkdown,
  textareaRef,
}: {
  activeTab: 'write' | 'preview'
  contentLocked: boolean
  markdown: string
  postType: PostType
  previewHtml: string
  previewLoading: boolean
  reviewCharCount: number
  reviewSentenceCount: number
  reviewWordCount: number
  setActiveTab: (tab: 'write' | 'preview') => void
  setMarkdown: (markdown: string) => void
  textareaRef: React.RefObject<HTMLTextAreaElement | null>
}) {
  const t = useTranslations()
  return (
    <div className='space-y-2'>
      <Label htmlFor='markdown'>{t('extracted.postForm.contentEditor.content_47bd2907')}</Label>
      <Tabs
        value={activeTab}
        onValueChange={v => setActiveTab(v as 'write' | 'preview')}
      >
        <TabsList className='overflow-x-auto scrollbar-hide'>
          <TabsTrigger value='write'>
            {t('extracted.postForm.contentEditor.write_3f00927a')}
          </TabsTrigger>
          <TabsTrigger value='preview'>
            {t('extracted.postForm.contentEditor.preview_324b134f')}
          </TabsTrigger>
        </TabsList>
        <TabsContent value='write'>
          <Textarea
            ref={textareaRef}
            id='markdown'
            value={markdown}
            onChange={e => setMarkdown(e.target.value)}
            placeholder={t('extracted.postForm.contentEditor.writeYourPost_310b0d37')}
            rows={6}
            className='w-full resize-none'
            disabled={contentLocked}
            dir='auto'
            data-pw='post-form-content-textarea'
          />
          {postType === 'review' && !contentLocked && (
            <ReviewContentCounter
              charCount={reviewCharCount}
              wordCount={reviewWordCount}
              sentenceCount={reviewSentenceCount}
            />
          )}
        </TabsContent>
        <TabsContent value='preview'>
          <div className='min-h-[8.5rem] rounded-md border bg-background p-4'>
            {previewLoading ? (
              <p className='text-sm text-muted-foreground'>
                {t('extracted.postForm.contentEditor.loadingPreview_c4cf2b2c')}
              </p>
            ) : previewHtml ? (
              <MarkdownContent
                html={previewHtml}
                className='prose prose-sm max-w-none dark:prose-invert'
                features={MARKDOWN_CONTENT_FEATURES_RICH}
              />
            ) : (
              <p className='text-sm text-muted-foreground'>
                {t('extracted.postForm.contentEditor.nothingToPreviewYet_75f00def')}
              </p>
            )}
          </div>
        </TabsContent>
      </Tabs>
    </div>
  )
}
