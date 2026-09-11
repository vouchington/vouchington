/**
 * Central registry of keyboard shortcuts used throughout the app.
 * Provides shortcut definitions, input-target guard, and display helpers.
 */

import type { MessageKey } from '@ts-shared/ui-messages'

export type ShortcutModifier = 'meta' | 'none'

export interface KeyboardShortcut {
  id: string
  key: string
  modifier: ShortcutModifier
  label: string
  description: MessageKey
  category: MessageKey
}

export const KEYBOARD_SHORTCUTS: KeyboardShortcut[] = [
  {
    id: 'search',
    key: 'k',
    modifier: 'meta',
    label: 'Open search',
    description: 'extracted.lib.keyboardShortcuts.openTheGlobalSearchDialog_2bd21641',
    category: 'extracted.lib.keyboardShortcuts.navigation_3db65f8c',
  },
  {
    id: 'sidebar',
    key: '/',
    modifier: 'meta',
    label: 'Toggle sidebar',
    description: 'extracted.lib.keyboardShortcuts.expandOrCollapseTheSidebar_a34dc68f',
    category: 'extracted.lib.keyboardShortcuts.navigation_3db65f8c',
  },
  {
    id: 'settings',
    key: '.',
    modifier: 'meta',
    label: 'Open settings',
    description: 'extracted.lib.keyboardShortcuts.goToPreferencesSignedInUsers_f9f292e4',
    category: 'extracted.lib.keyboardShortcuts.navigation_3db65f8c',
  },
  {
    id: 'aside',
    key: '\\',
    modifier: 'meta',
    label: 'Toggle aside',
    description: 'extracted.lib.keyboardShortcuts.showOrHideThePageSidebar_499dba09',
    category: 'extracted.lib.keyboardShortcuts.navigation_3db65f8c',
  },
  {
    id: 'shortcuts-help',
    key: '?',
    modifier: 'none',
    label: 'Show shortcuts',
    description: 'extracted.lib.keyboardShortcuts.openThisKeyboardShortcutsDialog_a33c31ef',
    category: 'extracted.lib.keyboardShortcuts.general_c910d474',
  },
  {
    id: 'moderation-select',
    key: 'x',
    modifier: 'none',
    label: 'Toggle moderation selection',
    description: 'extracted.lib.keyboardShortcuts.selectOrDeselectTheFocusedModeration_f72cc893',
    category: 'extracted.lib.keyboardShortcuts.moderation_126d4415',
  },
]

export const MODERATION_QUEUE_SHORTCUTS: KeyboardShortcut[] = [
  {
    id: 'moderation-next',
    key: 'j',
    modifier: 'none',
    label: 'Next queue item',
    description: 'extracted.lib.keyboardShortcuts.moveToTheNextModerationQueue_dc323330',
    category: 'extracted.lib.keyboardShortcuts.moderationQueue_50d92231',
  },
  {
    id: 'moderation-previous',
    key: 'k',
    modifier: 'none',
    label: 'Previous queue item',
    description: 'extracted.lib.keyboardShortcuts.moveToThePreviousModerationQueue_2f413fbd',
    category: 'extracted.lib.keyboardShortcuts.moderationQueue_50d92231',
  },
  {
    id: 'moderation-approve',
    key: 'a',
    modifier: 'none',
    label: 'Approve',
    description: 'extracted.lib.keyboardShortcuts.approveTheActivePendingPost_ae084900',
    category: 'extracted.lib.keyboardShortcuts.moderationQueue_50d92231',
  },
  {
    id: 'moderation-remove-review',
    key: 'r',
    modifier: 'none',
    label: 'Remove or review',
    description: 'extracted.lib.keyboardShortcuts.removeTheActivePostOrMark_251b1356',
    category: 'extracted.lib.keyboardShortcuts.moderationQueue_50d92231',
  },
  {
    id: 'moderation-dismiss',
    key: 'd',
    modifier: 'none',
    label: 'Dismiss report',
    description: 'extracted.lib.keyboardShortcuts.dismissTheActiveReport_3cccd8a5',
    category: 'extracted.lib.keyboardShortcuts.moderationQueue_50d92231',
  },
  {
    id: 'moderation-select-active',
    key: 'x',
    modifier: 'none',
    label: 'Toggle selection',
    description: 'extracted.lib.keyboardShortcuts.selectOrDeselectTheActiveModeration_c7851103',
    category: 'extracted.lib.keyboardShortcuts.moderationQueue_50d92231',
  },
  {
    id: 'moderation-help',
    key: '?',
    modifier: 'none',
    label: 'Show moderation shortcuts',
    description: 'extracted.lib.keyboardShortcuts.openThisModerationQueueShortcutDialog_acbf7ea5',
    category: 'extracted.lib.keyboardShortcuts.moderationQueue_50d92231',
  },
]

/**
 * Returns true when the keyboard event originated from an interactive text input.
 * Use this to suppress global shortcuts while the user is typing.
 */
export function isInputTarget(event: KeyboardEvent): boolean {
  const target = event.target as HTMLElement | null
  if (!target) return false
  const tag = target.tagName
  if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return true
  // Walk up the DOM to handle elements nested inside a contenteditable container
  // (the target itself may have contentEditable === 'inherit' when nested)
  let el: Element | null = target
  while (el) {
    if ((el as HTMLElement).contentEditable === 'true') return true
    el = el.parentElement
  }
  return false
}

/**
 * Returns the display string for a shortcut key combination.
 * Example: formatShortcut({ key: 'k', modifier: 'meta' }, true) → '⌘K'
 */
export function formatShortcut(shortcut: KeyboardShortcut, isMac: boolean): string {
  const key = shortcut.key === '?' ? '?' : shortcut.key.toUpperCase()
  if (shortcut.modifier === 'none') return key
  return isMac ? `⌘${key}` : `Ctrl+${key}`
}
