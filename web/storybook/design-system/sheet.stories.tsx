import type { Meta, StoryObj } from '@storybook/nextjs-vite'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetOverlay,
  SheetPortal,
  SheetTitle,
  SheetTrigger,
} from '@/components/ui/sheet'

const meta = {
  title: 'Design System/Components/Sheet',
  component: Sheet,
} satisfies Meta<typeof Sheet>

export default meta
type Story = StoryObj<typeof meta>

export const Right: Story = {
  render: () => (
    <Sheet>
      <SheetTrigger asChild>
        <Button variant='outline'>Open sheet</Button>
      </SheetTrigger>
      <SheetContent>
        <SheetHeader>
          <SheetTitle>Edit profile</SheetTitle>
          <SheetDescription>
            Make changes to your profile here. Click save when you are done.
          </SheetDescription>
        </SheetHeader>
        <div className='grid gap-4 py-4'>
          <div className='grid grid-cols-4 items-center gap-4'>
            <Label
              htmlFor='name'
              className='text-right'
            >
              Name
            </Label>
            <Input
              id='name'
              defaultValue='Pedro Duarte'
              className='col-span-3'
            />
          </div>
        </div>
        <SheetFooter>
          <SheetClose asChild>
            <Button type='button'>Save changes</Button>
          </SheetClose>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  ),
}

export const ExplicitChrome: Story = {
  render: () => (
    <Sheet defaultOpen>
      <SheetTrigger asChild>
        <Button variant='outline'>Open sheet</Button>
      </SheetTrigger>
      <SheetPortal>
        <SheetOverlay />
        <SheetContent hideOverlay>
          <SheetHeader>
            <SheetTitle>Edit profile</SheetTitle>
            <SheetDescription>Update the name shown on your profile.</SheetDescription>
          </SheetHeader>
          <SheetFooter>
            <SheetClose asChild>
              <Button type='button'>Done</Button>
            </SheetClose>
          </SheetFooter>
        </SheetContent>
      </SheetPortal>
    </Sheet>
  ),
}

export const Left: Story = {
  render: () => (
    <Sheet>
      <SheetTrigger asChild>
        <Button variant='outline'>Open left sheet</Button>
      </SheetTrigger>
      <SheetContent side='left'>
        <SheetHeader>
          <SheetTitle>Navigation</SheetTitle>
          <SheetDescription>Browse sections of the app.</SheetDescription>
        </SheetHeader>
        <div className='py-4 text-sm'>Navigation items would appear here.</div>
      </SheetContent>
    </Sheet>
  ),
}
