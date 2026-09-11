import { notFound } from 'next/navigation'
import { Breadcrumbs } from '@/components/ui/breadcrumb'
import { createCrawlerPathname } from '@/lib/links/entity-href'
import { CrawlerEditForm, type Crawler } from './crawler-edit-form'
import { getCrawler } from '@/lib/api/server'
import { getCurrentUser } from '@/lib/auth/get-current-user'
import { buildBreadcrumbsForPath } from '@/lib/navigation/breadcrumbs'
import { getTranslations } from '@/lib/i18n/get-translations'

export const dynamic = 'force-dynamic'

export default async function EditCrawlerPage({ params }: { params: Promise<{ id: string }> }) {
  const t = await getTranslations()
  const { id } = await params
  const [data, currentUser] = await Promise.all([
    getCrawler<{ crawler: Crawler }>(id),
    getCurrentUser(),
  ])
  if (!data) notFound()
  const { crawler } = data
  const editPath = createCrawlerPathname({ id }, '/edit')

  return (
    <div>
      <Breadcrumbs
        items={buildBreadcrumbsForPath(editPath, {
          isAuthenticated: !!currentUser,
          tail: [{ name: 'Edit', path: editPath }],
        })}
      />
      <div className='mb-8 max-w-2xl'>
        <h1
          data-pw='crawler-edit-heading'
          className='text-xl font-semibold text-foreground'
        >
          {t('extracted.edit.page.editCrawler_64ab1969')}
        </h1>
        <p className='mt-2 text-sm text-muted-foreground'>
          {t('extracted.edit.page.updateCrawlerConfiguration_0a253dd0')}
        </p>
      </div>

      <CrawlerEditForm
        key={id}
        crawler={crawler}
        crawlerId={id}
      />
    </div>
  )
}
