export const dynamic = 'force-dynamic'

import { notFound } from 'next/navigation'
import Link from 'next/link'
import type { Metadata } from 'next'
import { getList, getListItems } from '@/lib/api/server/lists'
import { getCurrentUser } from '@/lib/auth/get-current-user'
import { ListPageActions } from './list-page-actions'
import { ListItemsAccumulator } from './list-items-accumulator'
import { getTranslations } from '@/lib/i18n/get-translations'

type Translate = Awaited<ReturnType<typeof getTranslations>>

const TAB_MEDIA_TYPES: Record<string, string | undefined> = {
  reading: 'article',
  watch: 'video',
  listen: 'audio',
}

function getTabs(t: Translate) {
  return [
    { key: 'all', label: t('extracted.id.page.all_1d2e3f4a') },
    { key: 'reading', label: t('extracted.id.page.reading_5b6c7d8e') },
    { key: 'watch', label: t('extracted.id.page.watch_9f0a1b2c') },
    { key: 'listen', label: t('extracted.id.page.listen_3d4e5f6a') },
  ] as const
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>
}): Promise<Metadata> {
  const { id } = await params
  const data = await getList(id)
  if (!data) return {}
  const { list } = data
  return {
    title: list.name,
    description: list.description ?? undefined,
    robots: { index: list.visibility === 'public' },
    openGraph: {
      title: list.name,
      description: list.description ?? undefined,
      type: 'website',
    },
  }
}

export default async function ListPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams?: Promise<{ tab?: string; after?: string }>
}) {
  const t = await getTranslations()
  const [{ id }, sp, currentUser] = await Promise.all([
    params,
    searchParams ?? Promise.resolve({} as { tab?: string; after?: string }),
    getCurrentUser(),
  ])

  const listData = await getList(id)
  if (!listData) notFound()
  const { list } = listData

  const tabs = getTabs(t)
  const rawTab = sp.tab ?? 'all'
  const activeTab = tabs.some(tab => tab.key === rawTab)
    ? (rawTab as (typeof tabs)[number]['key'])
    : 'all'
  const mediaType = TAB_MEDIA_TYPES[activeTab]
  const itemsData = await getListItems(id, {
    searchParams: mediaType ? { media_type: mediaType } : {},
  })
  const isOwner = currentUser?.id === list.owner_user_id

  return (
    <main className='space-y-4'>
      <div className='flex items-start justify-between gap-4'>
        <div>
          <h1
            className='text-2xl font-bold'
            data-pw='list-name'
          >
            {list.name}
          </h1>
          {list.description && <p className='mt-1 text-muted-foreground'>{list.description}</p>}
        </div>
        {isOwner && <ListPageActions listId={list.id} />}
      </div>

      <nav
        className='flex gap-1 border-b'
        aria-label={t('extracted.id.page.contentType_6f51cb04')}
        data-pw='list-tabs'
      >
        {tabs.map(tab => {
          const href = tab.key === 'all' ? `/list/${id}` : `/list/${id}?tab=${tab.key}`
          const isActive = activeTab === tab.key
          return (
            <Link
              key={tab.key}
              href={href}
              prefetch={false}
              className={`px-3 py-2 text-sm font-medium transition-colors ${
                isActive
                  ? 'border-b-2 border-primary text-primary'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
              // oxlint-disable-next-line no-mistakes/playwright-literals -- static template over finite tab key enum
              data-pw={`list-tab-${tab.key}`}
              aria-current={isActive ? 'page' : undefined}
            >
              {tab.label}
            </Link>
          )
        })}
      </nav>

      <ListItemsAccumulator
        activeTab={activeTab}
        initialData={itemsData}
        listId={id}
        mediaType={mediaType}
      />
    </main>
  )
}
