import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { Calculator, Calendar, CreditCard, Settings, Smile, User } from 'lucide-react'

import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command'

const meta = {
  title: 'Design System/Components/Command',
  component: Command,
} satisfies Meta<typeof Command>

export default meta
type Story = StoryObj<typeof meta>

export const CommandPalette: Story = {
  render: () => (
    <Command className='rounded-lg border shadow-md w-96'>
      <CommandInput placeholder='Type a command or search…' />
      <CommandList>
        <CommandEmpty>No results found.</CommandEmpty>
        <CommandGroup heading='Suggestions'>
          <CommandItem>
            <Calendar className='mr-2 h-4 w-4' />
            <span>Calendar</span>
          </CommandItem>
          <CommandItem>
            <Smile className='mr-2 h-4 w-4' />
            <span>Search Emoji</span>
          </CommandItem>
          <CommandItem>
            <Calculator className='mr-2 h-4 w-4' />
            <span>Calculator</span>
          </CommandItem>
        </CommandGroup>
        <CommandGroup heading='Settings'>
          <CommandItem>
            <User className='mr-2 h-4 w-4' />
            <span>Profile</span>
            <span className='ml-auto text-xs tracking-widest text-muted-foreground'>⌘P</span>
          </CommandItem>
          <CommandItem>
            <CreditCard className='mr-2 h-4 w-4' />
            <span>Billing</span>
            <span className='ml-auto text-xs tracking-widest text-muted-foreground'>⌘B</span>
          </CommandItem>
          <CommandItem>
            <Settings className='mr-2 h-4 w-4' />
            <span>Settings</span>
            <span className='ml-auto text-xs tracking-widest text-muted-foreground'>⌘S</span>
          </CommandItem>
        </CommandGroup>
      </CommandList>
    </Command>
  ),
}
