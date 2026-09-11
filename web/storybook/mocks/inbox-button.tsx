import { Button } from '@/components/ui/button'

export function InboxButton() {
  return (
    <Button
      type='button'
      variant='outline'
      size='sm'
      data-pw='inbox-open-button'
      aria-label='Open inbox'
      disabled
    >
      Inbox
    </Button>
  )
}
