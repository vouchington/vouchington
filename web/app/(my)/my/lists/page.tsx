export const dynamic = 'force-dynamic'

import type { Metadata } from 'next'
import Link from 'next/link'
import { createNoIndexMetadata } from '@/lib/seo/metadata'
import { requireCurrentUser } from '@/lib/auth/require-current-user'
import { getMyLists } from '@/lib/api/server/lists'
import { listHref } from '@/lib/links/entity-href'
import { SettingsPageHeader } from '@/components/my/settings-page-header'
import { getTranslations } from '@/lib/i18n/get-translations'

export const metadata: Metadata = createNoIndexMetadata('My Lists')

export default async function MyListsPage() {
  const [t] = await Promise.all([getTranslations(), requireCurrentUser()])
  const data = await getMyLists()
  const lists = data.results.flatMap(r => {
    const list = data.lists[r.id]
    return list ? [list] : []
  })
  return (
    <div
      className='space-y-6'
      data-pw='my-lists-page'
    >
      <SettingsPageHeader
        title={t('extracted.lists.page.myLists_94de1d96')}
        description={t('extracted.lists.page.manageYourCuratedLists_1a2b3c4d')}
      />
      {lists.length === 0 ? (
        <p className='text-muted-foreground'>
          {t('extracted.lists.page.youHaveNoListsYet_7ef3cbb9')}
        </p>
      ) : (
        <ul className='space-y-2'>
          {lists.map(list => (
            <li key={list.id}>
              <Link
                href={listHref(list)}
                data-pw='my-list-item'
                className='font-medium hover:underline'
              >
                {list.name}
              </Link>
              {list.description && (
                <p className='text-sm text-muted-foreground'>{list.description}</p>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
