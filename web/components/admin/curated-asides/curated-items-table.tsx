'use client'

import { AdminTableShell } from '@/components/admin/admin-table-shell'
import { Button } from '@/components/ui/button'
import { TooltipButton } from '@/components/ui/_button-tooltip'
import type { CuratedAsideItem } from '@/types/api-responses/curated-aside-items'
import { ArrowDown, ArrowUp, GripVertical } from 'lucide-react'
import type { DragEvent } from 'react'
import { useTranslations } from '@/lib/i18n/use-translations'

const CURATED_ITEM_DRAG_MIME = 'application/x-voucha-curated-aside-item-index'

interface CuratedItemsTableProps {
  actionsDisabled?: boolean
  items: CuratedAsideItem[]
  onDelete: (id: string) => Promise<void>
  onReorder: (fromIndex: number, toIndex: number) => Promise<void>
}

export function CuratedItemsTable({
  actionsDisabled = false,
  items,
  onDelete,
  onReorder,
}: CuratedItemsTableProps) {
  const t = useTranslations()
  function handleDragStart(event: DragEvent, index: number) {
    event.dataTransfer.effectAllowed = 'move'
    event.dataTransfer.setData(CURATED_ITEM_DRAG_MIME, String(index))
  }

  function handleDrop(event: DragEvent, toIndex: number) {
    event.preventDefault()
    const rawFromIndex = event.dataTransfer.getData(CURATED_ITEM_DRAG_MIME)
    if (!rawFromIndex) return
    const fromIndex = Number(rawFromIndex)
    if (!Number.isInteger(fromIndex) || fromIndex === toIndex) return
    void onReorder(fromIndex, toIndex)
  }

  return (
    <AdminTableShell
      aria-label={t('extracted.curatedAsides.curatedAsidesClient.curatedAsides_8798b0ff')}
      isEmpty={items.length === 0}
      emptyMessage={t('extracted.curatedAsides.curatedItemsTable.noCuratedItemsAddOne_4a8b1c2e')}
    >
      <table
        className='w-full text-sm'
        data-pw='curated-items-table'
      >
        <thead>
          <tr className='border-b text-left text-muted-foreground'>
            <th className='w-10 px-4 py-3 font-medium'>
              <span className='sr-only'>
                {t('extracted.curatedAsides.curatedItemsTable.reorder_14ac200e')}
              </span>
            </th>
            <th className='px-4 py-3 font-medium'>
              {t('extracted.curatedAsides.curatedItemsTable.entity_2ed3bb60')}
            </th>
            <th className='px-4 py-3 font-medium'>
              {t('extracted.curatedAsides.curatedItemsTable.createdAt_3d443370')}
            </th>
            <th className='px-4 py-3 font-medium'>
              {t('extracted.curatedAsides.curatedItemsTable.actions_ff8059dc')}
            </th>
          </tr>
        </thead>
        <tbody>
          {items.map((item, index) => (
            <tr
              key={item.id}
              className='border-b last:border-0'
              data-pw='curated-item-row'
              aria-label={t(
                'extracted.curatedAsides.curatedItemsTable.curatedItemEntitylabel_9f40eb32',
                {
                  entityLabel: getEntityLabel(item, t),
                },
              )}
              onDragOver={event => event.preventDefault()}
              onDrop={event => handleDrop(event, index)}
            >
              <td className='px-4 py-3'>
                <TooltipButton
                  tooltip={t('extracted.curatedAsides.curatedItemsTable.dragToReorder_ef86a0ed')}
                  variant='outline'
                  size='icon'
                  type='button'
                  className='cursor-grab text-muted-foreground active:cursor-grabbing'
                  draggable={!actionsDisabled}
                  disabled={actionsDisabled}
                  onDragStart={event => handleDragStart(event, index)}
                  aria-label={t('extracted.curatedAsides.curatedItemsTable.dragToReorder_ef86a0ed')}
                  data-pw='curated-item-drag-handle'
                >
                  <GripVertical className='h-4 w-4' />
                  <span className='sr-only'>
                    {t('extracted.curatedAsides.curatedItemsTable.dragToReorder_ef86a0ed')}
                  </span>
                </TooltipButton>
              </td>
              <td
                className='px-4 py-3'
                aria-label={getEntityLabel(item, t)}
              >
                <div className='min-w-0'>
                  <div
                    className='truncate font-medium'
                    data-pw='curated-item-label'
                  >
                    {getEntityLabel(item, t)}
                  </div>
                  <div className='truncate text-xs text-muted-foreground'>
                    {getEntitySubtitle(item, t)}
                  </div>
                </div>
              </td>
              <td
                className='px-4 py-3'
                suppressHydrationWarning
              >
                {new Date(item.created_at).toLocaleString()}
              </td>
              <td className='px-4 py-3'>
                <div className='flex items-center gap-1'>
                  <Button
                    variant='outline'
                    size='icon'
                    disabled={actionsDisabled || index === 0}
                    onClick={() => onReorder(index, index - 1)}
                    aria-label={t('extracted.curatedAsides.curatedItemsTable.moveUp_c66feb5e')}
                    data-pw='curated-item-move-up'
                  >
                    <ArrowUp className='h-4 w-4' />
                  </Button>
                  <Button
                    variant='outline'
                    size='icon'
                    disabled={actionsDisabled || index === items.length - 1}
                    onClick={() => onReorder(index, index + 1)}
                    aria-label={t('extracted.curatedAsides.curatedItemsTable.moveDown_40bb50da')}
                    data-pw='curated-item-move-down'
                  >
                    <ArrowDown className='h-4 w-4' />
                  </Button>
                  <Button
                    variant='destructive'
                    size='sm'
                    disabled={actionsDisabled}
                    onClick={() => onDelete(item.id)}
                    data-pw='curated-item-delete'
                  >
                    {t('extracted.curatedAsides.curatedItemsTable.delete_e2d0a549')}
                  </Button>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </AdminTableShell>
  )
}

function getEntityLabel(item: CuratedAsideItem, t: ReturnType<typeof useTranslations>): string {
  if (!item.entity_data) {
    return t('extracted.curatedAsides.curatedItemsTable.unavailableAsidetype_7d3f0a9c', {
      asideType: item.aside_type,
    })
  }
  if (item.entity_data.entity_type === 'source') return item.entity_data.title
  return item.entity_data.name
}

function getEntitySubtitle(item: CuratedAsideItem, t: ReturnType<typeof useTranslations>): string {
  if (!item.entity_data) {
    return t('extracted.curatedAsides.curatedItemsTable.thisItemNoLongerResolves_2b6e8f14')
  }
  if (item.entity_data.entity_type === 'source') return item.entity_data.topic_name
  return item.entity_data.slug
}
