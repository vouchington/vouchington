'use client'

import { Tag } from 'lucide-react'
import { ManageTagsDialog } from '@/components/tags/manage-tags-dialog'
import { DropdownMenuItem } from '@/components/ui/dropdown-menu'
import { useTranslations } from '@/lib/i18n/use-translations'

interface ManageCategoriesMenuItemProps {
  entityId: string
}

export function ManageCategoriesMenuItem({ entityId }: ManageCategoriesMenuItemProps) {
  const t = useTranslations()

  return (
    <ManageTagsDialog
      entityType='rss_feed_item'
      entityId={entityId}
      predicate='category'
      objectType='topic'
      label={t('extracted.feed.manageCategoriesMenuItem.category_292c06f0')}
      heading={t('extracted.feed.manageCategoriesMenuItem.category_292c06f0')}
      dialogTitle={t('extracted.feed.manageCategoriesMenuItem.manageCategories_49cf9ec6')}
      triggerLabel={t('extracted.feed.manageCategoriesMenuItem.manageCategories_49cf9ec6')}
      dialogDescription={t(
        'extracted.feed.manageCategoriesMenuItem.addOrRemoveCategoryTopicsFor_cdacf600',
      )}
      trigger={openDialog => (
        <DropdownMenuItem
          onSelect={(event: Event) => {
            event.preventDefault()
            openDialog()
          }}
          data-pw='manage-categories-menu-item'
        >
          <Tag className='h-4 w-4' />
          {t('extracted.feed.manageCategoriesMenuItem.manageCategories_49cf9ec6')}
        </DropdownMenuItem>
      )}
      loadingText={t('extracted.feed.manageCategoriesMenuItem.loading_47d2a515')}
      errorText={t('extracted.feed.manageCategoriesMenuItem.errorLoadingCategories_a400f101')}
    />
  )
}
