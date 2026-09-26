import type { Meta, StoryObj } from '@storybook/nextjs-vite'

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogOverlay,
  DialogPortal,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'

const meta = {
  title: 'Design System/Components/Dialog',
  component: Dialog,
} satisfies Meta<typeof Dialog>

export default meta
type Story = StoryObj<typeof meta>

const Frame = ({ children }: { children: React.ReactNode }) => (
  <main className='min-h-screen bg-background p-6 text-foreground'>
    <div className='mx-auto flex max-w-md items-center justify-center gap-3 rounded-md border p-6'>
      {children}
    </div>
  </main>
)

export const Default: Story = {
  render: () => (
    <Frame>
      <Dialog defaultOpen>
        <DialogTrigger asChild>
          <Button variant='outline'>Open dialog</Button>
        </DialogTrigger>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Sample dialog</DialogTitle>
            <DialogDescription>Modal surface for confirmations and short forms.</DialogDescription>
          </DialogHeader>
          <p className='text-sm text-muted-foreground'>Dialog body content goes here.</p>
          <DialogFooter>
            <Button variant='secondary'>Cancel</Button>
            <Button>Confirm</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Frame>
  ),
}

export const ExplicitChrome: Story = {
  render: () => (
    <Frame>
      <Dialog defaultOpen>
        <DialogTrigger asChild>
          <Button variant='outline'>Open dialog</Button>
        </DialogTrigger>
        <DialogPortal>
          <DialogOverlay />
          <DialogContent
            hideOverlay
            hideCloseButton
          >
            <DialogHeader>
              <DialogTitle>Sample dialog</DialogTitle>
              <DialogDescription>
                Modal surface for confirmations and short forms.
              </DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <DialogClose asChild>
                <Button variant='secondary'>Close</Button>
              </DialogClose>
            </DialogFooter>
          </DialogContent>
        </DialogPortal>
      </Dialog>
    </Frame>
  ),
}

export const Destructive: Story = {
  render: () => (
    <Frame>
      <AlertDialog defaultOpen>
        <AlertDialogTrigger asChild>
          <Button variant='destructive'>Delete account</Button>
        </AlertDialogTrigger>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete your account?</AlertDialogTitle>
            <AlertDialogDescription>
              This action is permanent. All posts, comments, and votes will be removed.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction className='bg-destructive text-destructive-foreground hover:bg-destructive/90'>
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Frame>
  ),
}
