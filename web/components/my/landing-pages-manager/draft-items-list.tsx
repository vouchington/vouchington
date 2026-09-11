'use client'

import { Button } from '@/components/ui/button'
import { PostContentText } from '@/components/posts/post-content-text'
import type { LandingPageItem } from '@/types/landing-pages'
import { landingPageItemLabel } from '../landing-pages-manager-utils'
import { useTranslations } from '@/lib/i18n/use-translations'

export function DraftItemsList({
  draftItems,
  moveItem,
  removeItem,
  moveGroupEntry,
  removeGroupEntry,
}: {
  draftItems: LandingPageItem[]
  moveItem: (index: number, direction: -1 | 1) => void
  removeItem: (index: number) => void
  moveGroupEntry: (itemIndex: number, entryIndex: number, direction: -1 | 1) => void
  removeGroupEntry: (itemIndex: number, entryIndex: number) => void
}) {
  const t = useTranslations()
  return (
    <div className='space-y-3'>
      {draftItems.length === 0 ? (
        <p className='text-sm text-muted-foreground'>
          {t('extracted.landingPagesManager.draftItemsList.noItemsYet_866f1e2f')}
        </p>
      ) : null}
      {draftItems.map((item, index) => (
        <div
          key={item.id}
          className='space-y-3 rounded-md border p-4'
        >
          <div className='flex items-center justify-between gap-3'>
            <div>
              {item.type === 'review' ? (
                <PostContentText
                  as='p'
                  content={{
                    text: item.review.title,
                    declared_language: item.review.declared_language,
                    lingua_rs_detected_language: item.review.lingua_rs_detected_language,
                  }}
                  fallback={t('extracted.landingPagesManager.draftItemsList.review_aff0766a')}
                  className='text-sm font-medium'
                />
              ) : (
                <p className='text-sm font-medium'>{landingPageItemLabel(item)}</p>
              )}
              <p className='text-xs text-muted-foreground'>{item.type}</p>
            </div>
            <ItemActions
              onMoveUp={() => moveItem(index, -1)}
              onMoveDown={() => moveItem(index, 1)}
              onRemove={() => removeItem(index)}
              disableUp={index === 0}
              disableDown={index === draftItems.length - 1}
            />
          </div>
          {item.type === 'topic_group' ? (
            <div className='space-y-2 rounded-md bg-muted/40 p-3'>
              {item.entries.map((entry, entryIndex) => (
                <div
                  key={entry.id}
                  className='flex items-center justify-between gap-3 rounded-md border bg-background px-3 py-2'
                >
                  <div>
                    {entry.type === 'review' ? (
                      <PostContentText
                        as='p'
                        content={{
                          text: entry.review.title,
                          declared_language: entry.review.declared_language,
                          lingua_rs_detected_language: entry.review.lingua_rs_detected_language,
                        }}
                        fallback={t('extracted.landingPagesManager.draftItemsList.review_aff0766a')}
                        className='text-sm font-medium'
                      />
                    ) : (
                      <p className='text-sm font-medium'>
                        {entry.referral_link.label || entry.referral_link.referral_program_name}
                      </p>
                    )}
                    <p className='text-xs text-muted-foreground'>{entry.type}</p>
                  </div>
                  <ItemActions
                    onMoveUp={() => moveGroupEntry(index, entryIndex, -1)}
                    onMoveDown={() => moveGroupEntry(index, entryIndex, 1)}
                    onRemove={() => removeGroupEntry(index, entryIndex)}
                    disableUp={entryIndex === 0}
                    disableDown={entryIndex === item.entries.length - 1}
                  />
                </div>
              ))}
            </div>
          ) : null}
        </div>
      ))}
    </div>
  )
}

function ItemActions({
  onMoveUp,
  onMoveDown,
  onRemove,
  disableUp,
  disableDown,
}: {
  onMoveUp: React.MouseEventHandler<HTMLButtonElement>
  onMoveDown: React.MouseEventHandler<HTMLButtonElement>
  onRemove: React.MouseEventHandler<HTMLButtonElement>
  disableUp: boolean
  disableDown: boolean
}) {
  const t = useTranslations()
  return (
    <div className='flex gap-1'>
      <Button
        type='button'
        variant='ghost'
        size='sm'
        onClick={onMoveUp}
        disabled={disableUp}
        aria-label={t('extracted.landingPagesManager.draftItemsList.moveItemUp_b662a10c')}
        title={t('extracted.landingPagesManager.draftItemsList.moveItemUp_b662a10c')}
      >
        {t('extracted.landingPagesManager.draftItemsList.text_d2e966bf')}
      </Button>
      <Button
        type='button'
        variant='ghost'
        size='sm'
        onClick={onMoveDown}
        disabled={disableDown}
        aria-label={t('extracted.landingPagesManager.draftItemsList.moveItemDown_49a541c6')}
        title={t('extracted.landingPagesManager.draftItemsList.moveItemDown_49a541c6')}
      >
        {t('extracted.landingPagesManager.draftItemsList.text_07a2abcd')}
      </Button>
      <Button
        type='button'
        variant='ghost'
        size='sm'
        onClick={onRemove}
      >
        {t('extracted.landingPagesManager.draftItemsList.remove_c3812fc4')}
      </Button>
    </div>
  )
}
