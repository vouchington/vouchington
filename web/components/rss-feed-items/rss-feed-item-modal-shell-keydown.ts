// Selector for the Radix ScrollArea Viewport element that wraps article content.
const SCROLL_VP_SEL = '[data-radix-scroll-area-viewport]'
// Selector for ARIA widget containers that use ArrowUp/Down for their own navigation
// (e.g. Radix DropdownMenu, Select). Events from inside these must not be redirected
// to item navigation — the widget consumes them first.
const MENU_SEL = '[role="menu"],[role="listbox"]'
// Selector for secondary/nested dialogs (e.g. "Send to followers"). Events from inside
// a dialog that is NOT the RSS item modal itself must not navigate items.
const DIALOG_SEL = '[role="dialog"],[role="alertdialog"]'
// data-pw attribute set on the RSS item modal's DialogContent — used to distinguish it
// from secondary portaled dialogs when checking the nearest ancestor dialog.
const RSS_MODAL_SEL = '[data-pw="rss-feed-item-modal"]'

interface ScrollNavCallbacks {
  navigatePrevious: () => boolean
  navigateNext: () => boolean
}

/**
 * Creates a `window` keydown handler for arrow-key navigation in the news feed item modal.
 *
 * ArrowLeft/Up → previous item; ArrowRight/Down → next item.
 * When focus is inside the scroll viewport (user clicked into the article),
 * ArrowUp/Down do nothing so the browser scrolls the content natively instead.
 * Left/Right always navigate regardless of focus location.
 *
 * Optional chaining on `closest` is intentional: `event.target` may be the `Window`
 * object (not an Element) when the event is dispatched directly on `window` in unit tests.
 */
export function createScrollNavKeyHandler({
  navigatePrevious,
  navigateNext,
}: ScrollNavCallbacks): (event: KeyboardEvent) => void {
  return (event: KeyboardEvent) => {
    const target = event.target as HTMLElement
    if (
      target.tagName === 'INPUT' ||
      target.tagName === 'TEXTAREA' ||
      target.isContentEditable ||
      event.isComposing
    )
      return
    const upDown = event.key === 'ArrowUp' || event.key === 'ArrowDown'
    // If another handler (e.g. Radix DropdownMenu trigger opening its popup) already called
    // preventDefault(), don't also navigate the feed.
    if (upDown && event.defaultPrevented) return
    const el = target as unknown as Element | null
    const nearestDialog = el?.closest?.(DIALOG_SEL)
    if (
      upDown &&
      (el?.closest?.(SCROLL_VP_SEL) ||
        el?.closest?.(MENU_SEL) ||
        (nearestDialog && !nearestDialog.matches(RSS_MODAL_SEL)))
    )
      return
    if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') {
      if (navigatePrevious()) event.preventDefault()
    } else if ((event.key === 'ArrowRight' || event.key === 'ArrowDown') && navigateNext())
      event.preventDefault()
  }
}
