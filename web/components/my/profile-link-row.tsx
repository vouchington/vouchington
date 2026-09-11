'use client'
import { Button } from '@/components/ui/button'
import type { ProfileLink } from '@/types/user'
import { useTranslations } from '@/lib/i18n/use-translations'

function getLinkDisplay(link: ProfileLink): string {
  if (link.link_type === 'url') return link.url ?? ''
  return link.handle ? `@${link.handle}` : ''
}

export function ProfileLinkRow({
  link,
  loading,
  canMoveUp,
  canMoveDown,
  onMoveUp,
  onMoveDown,
  onEdit,
  onDelete,
}: {
  link: ProfileLink
  loading: boolean
  canMoveUp: boolean
  canMoveDown: boolean
  onMoveUp: () => void
  onMoveDown: () => void
  onEdit: () => void
  onDelete: () => void
}) {
  const t = useTranslations()
  return (
    <div className='flex items-center justify-between rounded-md border p-4'>
      <div className='min-w-0 flex-1'>
        <div className='flex items-center gap-2'>
          <span className='text-xs font-medium uppercase tracking-wider text-muted-foreground'>
            {link.link_type}
          </span>
          {link.name && <span className='text-sm font-medium'>{link.name}</span>}
        </div>
        <p className='truncate text-sm text-muted-foreground'>{getLinkDisplay(link)}</p>
      </div>
      <div className='flex shrink-0 gap-1'>
        <Button
          variant='ghost'
          size='sm'
          onClick={onMoveUp}
          disabled={loading || !canMoveUp}
          aria-label={t('extracted.my.profileLinks.moveUp_c66feb5e')}
        >
          {t('extracted.my.profileLinks.text_d2e966bf')}
        </Button>
        <Button
          variant='ghost'
          size='sm'
          onClick={onMoveDown}
          disabled={loading || !canMoveDown}
          aria-label={t('extracted.my.profileLinks.moveDown_40bb50da')}
        >
          {t('extracted.my.profileLinks.text_07a2abcd')}
        </Button>
        <Button
          variant='ghost'
          size='sm'
          onClick={onEdit}
          disabled={loading}
          aria-label={t('extracted.my.profileLinkRow.editNameLink_4e8d2618', {
            name: link.name ?? link.link_type,
          })}
        >
          {t('extracted.my.profileLinks.edit_464c4ffd')}
        </Button>
        <Button
          variant='ghost'
          size='sm'
          onClick={onDelete}
          disabled={loading}
          aria-label={t('extracted.my.profileLinkRow.deleteNameLink_91d2344a', {
            name: link.name ?? link.link_type,
          })}
        >
          {t('extracted.my.profileLinks.delete_e2d0a549')}
        </Button>
      </div>
    </div>
  )
}
