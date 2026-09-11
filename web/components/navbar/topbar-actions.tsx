'use client'

import { PenSquare, Search } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { useIsMac } from '@/hooks/use-is-mac'
import { useTranslations } from '@/lib/i18n/use-translations'

interface NavbarSearchButtonProps {
  onOpenSearch: () => void
}

export function NavbarSearchButton({ onOpenSearch }: NavbarSearchButtonProps) {
  const t = useTranslations()
  const isMac = useIsMac()

  return (
    <Button
      variant='ghost'
      size='touch'
      data-pw='navbar-search-button'
      className='group relative min-w-0 max-w-sm flex-1 justify-start p-0 hover:bg-transparent sm:h-8 sm:p-0'
      aria-label={t('extracted.navbar.topbarActions.openSearch_50ce48b9')}
      onClick={onOpenSearch}
    >
      <span
        data-pw='navbar-search-shell'
        className='flex h-8 min-w-0 flex-1 items-center rounded-md border border-input bg-background px-3 text-sm text-muted-foreground shadow-sm transition-colors group-hover:bg-accent group-hover:text-accent-foreground'
      >
        <Search className='mr-2 h-4 w-4 shrink-0' />
        <span className='truncate'>{t('extracted.navbar.topbarActions.search_7f553822')}</span>
        <kbd className='pointer-events-none ml-auto hidden h-5 shrink-0 items-center gap-1 rounded border bg-muted px-1.5 font-mono text-xs font-medium opacity-100 sm:inline-flex'>
          {isMac ? (
            <span className='text-xs'>{t('extracted.navbar.topbarActions.text_70b4b62a')}</span>
          ) : (
            t('extracted.navbar.topbarActions.ctrl_b075c3a0')
          )}
          K
        </kbd>
      </span>
    </Button>
  )
}

interface NavbarWriteButtonProps {
  onOpenWrite: () => void
}

export function NavbarWriteButton({ onOpenWrite }: NavbarWriteButtonProps) {
  const t = useTranslations()
  return (
    <Button
      variant='ghost'
      size='touchSm'
      aria-label={t('extracted.navbar.topbarActions.write_3f00927a')}
      data-pw='navbar-write-button'
      onClick={onOpenWrite}
    >
      <PenSquare className='h-4 w-4 sm:mr-2' />
      <span className='hidden sm:inline'>{t('extracted.navbar.topbarActions.write_3f00927a')}</span>
    </Button>
  )
}
