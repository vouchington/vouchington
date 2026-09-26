import type { ReactNode } from 'react'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'

export function OpenPostMenu({ children }: { children: ReactNode }) {
  return (
    <DropdownMenu
      defaultOpen
      modal={false}
    >
      <DropdownMenuTrigger asChild>
        <Button
          type='button'
          variant='outline'
        >
          Post actions
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align='start'>{children}</DropdownMenuContent>
    </DropdownMenu>
  )
}
