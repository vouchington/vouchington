'use client'

import Link from 'next/link'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog'
import { KEYBOARD_SHORTCUTS, formatShortcut, type KeyboardShortcut } from '@/lib/keyboard-shortcuts'
import { useIsMac } from '@/hooks/use-is-mac'
import { useTranslations } from '@/lib/i18n/use-translations'

export function KeyboardShortcutsDialog({
  description = 'Quick access to common actions.',
  open,
  onOpenChange,
  shortcuts = KEYBOARD_SHORTCUTS,
  title = 'Keyboard Shortcuts',
  viewAllLink = true,
}: {
  description?: string
  open: boolean
  onOpenChange: (open: boolean) => void
  shortcuts?: KeyboardShortcut[]
  title?: string
  viewAllLink?: boolean
}) {
  const t = useTranslations()
  const isMac = useIsMac()

  const categories = [...new Set(shortcuts.map(s => s.category))]

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
    >
      <DialogContent className='sm:max-w-md'>
        <DialogHeader>
          <DialogTitle data-pw='keyboard-shortcuts-title'>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>

        <div className='space-y-4'>
          {categories.map(category => (
            <div key={category}>
              <p className='mb-2 text-xs font-medium text-muted-foreground'>{t(category)}</p>
              <div className='space-y-2'>
                {shortcuts.flatMap(shortcut =>
                  shortcut.category !== category
                    ? []
                    : [
                        <div
                          key={shortcut.id}
                          // oxlint-disable-next-line no-mistakes/playwright-literals -- dynamic identifier from row data
                          data-pw={`shortcut-item-${shortcut.id}`}
                          className='flex items-center justify-between'
                        >
                          <span className='text-sm text-foreground'>{t(shortcut.description)}</span>
                          <kbd className='pointer-events-none ml-4 inline-flex h-5 shrink-0 items-center gap-1 rounded border bg-muted px-1.5 font-mono text-xs font-medium'>
                            {formatShortcut(shortcut, isMac)}
                          </kbd>
                        </div>,
                      ],
                )}
              </div>
            </div>
          ))}
        </div>

        {viewAllLink ? (
          <div className='border-t pt-3'>
            <Link
              href='/article/keyboard-shortcuts'
              data-pw='view-all-shortcuts-link'
              className='text-xs text-muted-foreground hover:text-foreground'
              onClick={() => onOpenChange(false)}
              prefetch={false}
            >
              {t('extracted.components.keyboardShortcutsDialog.viewAllShortcuts_8576e656')}
            </Link>
          </div>
        ) : null}
      </DialogContent>
    </Dialog>
  )
}
