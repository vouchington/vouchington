'use client'
import { useEffect, useState } from 'react'
import { List } from 'lucide-react'
import { DropdownMenuItem } from '@/components/ui/dropdown-menu'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Checkbox } from '@/components/ui/checkbox'
import { Label } from '@/components/ui/label'
import { toast } from 'sonner'
import {
  getListsContaining,
  searchMyLists,
  addListRssFeedItem,
  removeListRssFeedItem,
  addListPost,
  removeListPost,
} from '@/lib/api/client/lists'
import type { List as ListType } from '@/types/api-responses'
import { useTranslations } from '@/lib/i18n/use-translations'

type AddToListItemType = 'rss_feed_item' | 'post'

interface AddToListMenuItemProps {
  itemType: AddToListItemType
  entityId: string
}

export function AddToListMenuItem({ itemType, entityId }: AddToListMenuItemProps) {
  const t = useTranslations()
  const [open, setOpen] = useState(false)
  return (
    <>
      <DropdownMenuItem
        onSelect={(e: Event) => {
          e.preventDefault()
          setOpen(true)
        }}
        data-pw='add-to-list-menu-item'
      >
        <List className='mr-2 h-4 w-4' />
        {t('extracted.lists.addToListMenuItem.addToList_9d795f00')}
      </DropdownMenuItem>
      {open && (
        <AddToListDialog
          open={open}
          onOpenChange={setOpen}
          itemType={itemType}
          entityId={entityId}
        />
      )}
    </>
  )
}

function AddToListDialog({
  open,
  onOpenChange,
  itemType,
  entityId,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  itemType: AddToListItemType
  entityId: string
}) {
  const t = useTranslations()
  const itemLabelByType: Record<AddToListItemType, string> = {
    post: t('extracted.lists.addToListMenuItem.post_72231043'),
    rss_feed_item: t('extracted.lists.addToListMenuItem.feedItem_03b8b4e7'),
  }
  const itemLabel = itemLabelByType[itemType]
  const [checkedIds, setCheckedIds] = useState<Set<string>>(new Set())
  const [lists, setLists] = useState<Pick<ListType, 'id' | 'name'>[] | null>(null)
  const [pending, setPending] = useState<Set<string>>(new Set())

  useEffect(() => {
    let active = true
    Promise.all([getListsContaining(itemType, entityId), searchMyLists(100)])
      .then(([containing, myLists]) => {
        if (!active) return
        setCheckedIds(new Set(containing.list_ids))
        setLists(
          myLists.results
            .map(r => myLists.lists[r.id])
            .filter((l): l is ListType => l !== undefined),
        )
      })
      .catch(() => {
        if (active) toast.error(t('extracted.lists.addToListMenuItem.failedToLoadLists_674ce92a'))
      })
    return () => {
      active = false
    }
  }, [itemType, entityId, t])

  async function toggle(listId: string, checked: boolean) {
    if (pending.has(listId)) return
    setPending(prev => new Set([...prev, listId]))
    try {
      if (checked) {
        if (itemType === 'rss_feed_item') await addListRssFeedItem(listId, entityId)
        else await addListPost(listId, entityId)
        setCheckedIds(prev => new Set([...prev, listId]))
      } else {
        if (itemType === 'rss_feed_item') await removeListRssFeedItem(listId, entityId)
        else await removeListPost(listId, entityId)
        setCheckedIds(prev => {
          const s = new Set(prev)
          s.delete(listId)
          return s
        })
      }
    } catch {
      toast.error(t('extracted.lists.addToListMenuItem.failedToUpdateList_f082bff4'))
    } finally {
      setPending(prev => {
        const s = new Set(prev)
        s.delete(listId)
        return s
      })
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
    >
      <DialogContent data-pw='add-to-list-dialog'>
        <DialogHeader>
          <DialogTitle>{t('extracted.lists.addToListMenuItem.addToList_9d795f00')}</DialogTitle>
          <DialogDescription className='sr-only'>
            {t('extracted.lists.addToListMenuItem.chooseWhichOfYourListsInclude_0c9ee2c0', {
              itemLabel,
            })}
          </DialogDescription>
        </DialogHeader>
        {lists === null ? (
          <p className='text-sm text-muted-foreground'>
            {t('extracted.lists.addToListMenuItem.loading_ba3bbbe1')}
          </p>
        ) : lists.length === 0 ? (
          <p className='text-sm text-muted-foreground'>
            {t('extracted.lists.addToListMenuItem.noListsYet_dab3692c')}
          </p>
        ) : (
          <ul
            className='space-y-2'
            data-pw='add-to-list-checklist'
          >
            {lists.map(list => (
              <li
                key={list.id}
                className='flex items-center gap-2'
              >
                <Checkbox
                  id={`list-${list.id}`}
                  checked={checkedIds.has(list.id)}
                  disabled={pending.has(list.id)}
                  onCheckedChange={(v: boolean | 'indeterminate') => {
                    void toggle(list.id, v === true)
                  }}
                />
                <Label
                  htmlFor={`list-${list.id}`}
                  className='cursor-pointer text-sm'
                >
                  {list.name}
                </Label>
              </li>
            ))}
          </ul>
        )}
      </DialogContent>
    </Dialog>
  )
}
