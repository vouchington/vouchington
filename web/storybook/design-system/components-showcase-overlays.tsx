'use client'

import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { EmptyState } from '@/components/shared/empty-state'
import { Skeleton } from '@/components/ui/skeleton'
import { ChevronDown, LogOut, Settings, Star } from 'lucide-react'
import { SectionLabel } from './foundations-showcase'

export function OverlayShowcaseSection() {
  return (
    <>
      <section className='flex flex-col gap-3'>
        <SectionLabel>Dialog</SectionLabel>
        <Dialog>
          <DialogTrigger asChild>
            <Button variant='outline'>Open Dialog</Button>
          </DialogTrigger>
          <DialogContent className='sm:max-w-md'>
            <DialogHeader>
              <DialogTitle>Sample Dialog</DialogTitle>
              <DialogDescription>
                This is a sample dialog demonstrating the design system.
              </DialogDescription>
            </DialogHeader>
            <p className='text-sm text-muted-foreground'>Dialog body content goes here.</p>
            <DialogFooter>
              <Button variant='secondary'>Cancel</Button>
              <Button>Confirm</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </section>

      <section className='flex flex-col gap-3'>
        <SectionLabel>Dropdown Menu</SectionLabel>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant='outline'>
              Options
              <ChevronDown />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent>
            <DropdownMenuItem>
              <Star />
              Favorite
            </DropdownMenuItem>
            <DropdownMenuItem>
              <Settings />
              Settings
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem>
              <LogOut />
              Sign out
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </section>
    </>
  )
}

export function FeedbackShowcaseSection() {
  return (
    <>
      <section className='flex flex-col gap-3'>
        <SectionLabel>Empty State</SectionLabel>
        <div className='rounded-md border'>
          <EmptyState
            title='No results found'
            description='Try adjusting your search or filters to find what you are looking for.'
            icon='search'
          />
        </div>
      </section>

      <section className='flex flex-col gap-3'>
        <SectionLabel>Loading</SectionLabel>
        <div className='flex flex-col gap-3 rounded-md border p-3'>
          <div className='flex flex-col gap-2'>
            <span className='font-mono text-xs text-muted-foreground'>Skeleton</span>
            <div className='flex flex-col gap-2'>
              <Skeleton className='h-4 w-48' />
              <Skeleton className='h-4 w-64' />
              <Skeleton className='h-4 w-32' />
            </div>
          </div>
          <div className='flex items-center gap-3'>
            <span className='font-mono text-xs text-muted-foreground'>Spinner</span>
            <div className='h-5 w-5 animate-spin rounded-full border-2 border-muted-foreground/30 border-t-muted-foreground' />
          </div>
        </div>
      </section>
    </>
  )
}
