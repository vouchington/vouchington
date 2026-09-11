'use client'

import { CuratedAsideAddForm } from '@/components/admin/curated-asides/curated-aside-add-form'
import { CuratedItemsTable } from '@/components/admin/curated-asides/curated-items-table'
import { TabsContent } from '@/components/ui/tabs'
import type { useTranslations } from '@/lib/i18n/use-translations'
import type { CuratedAsideItem, CuratedAsideType } from '@/types/api-responses/curated-aside-items'

interface CuratedAsidesTabPanelProps {
  activeAsideType: CuratedAsideType
  items: CuratedAsideItem[]
  loading: boolean
  reordering: boolean
  onAdd: (item: CuratedAsideItem) => void
  onDelete: (id: string) => Promise<void>
  onReorder: (fromIndex: number, toIndex: number) => Promise<void>
  t: ReturnType<typeof useTranslations>
}

export function CuratedAsidesTabPanel({
  activeAsideType,
  items,
  loading,
  reordering,
  onAdd,
  onDelete,
  onReorder,
  t,
}: CuratedAsidesTabPanelProps) {
  return (
    <TabsContent
      value={activeAsideType}
      className='mt-4'
    >
      <CuratedAsideAddForm
        key={activeAsideType}
        asideType={activeAsideType}
        disabled={loading || reordering}
        onAdd={onAdd}
      />
      {loading ? (
        <p className='text-sm text-muted-foreground'>
          {t('extracted.curatedAsides.curatedAsidesClient.loading_ba3bbbe1')}
        </p>
      ) : (
        <CuratedItemsTable
          actionsDisabled={reordering}
          items={items}
          onDelete={onDelete}
          onReorder={onReorder}
        />
      )}
    </TabsContent>
  )
}
