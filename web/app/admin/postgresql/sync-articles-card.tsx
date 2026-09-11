'use client'

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { SyncArticlesButton } from './sync-articles-button'
import { useTranslations } from '@/lib/i18n/use-translations'

export function SyncArticlesCard() {
  const t = useTranslations()
  return (
    <Card
      id='sync-articles'
      className='mt-6'
    >
      <CardHeader>
        <CardTitle>{t('extracted.postgresql.syncArticlesCard.syncArticles_aa0169ec')}</CardTitle>
      </CardHeader>
      <CardContent>
        <p className='text-sm text-muted-foreground mb-4'>
          {t('extracted.postgresql.syncArticlesCard.syncArticleContentFromS3Markdown_24578b18')}
        </p>
        <SyncArticlesButton />
      </CardContent>
    </Card>
  )
}
