'use client'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Textarea } from '@/components/ui/textarea'
import { Star } from 'lucide-react'
import { SectionLabel } from './foundations-showcase'

export function ButtonShowcaseSection() {
  return (
    <section className='flex flex-col gap-3'>
      <SectionLabel>Buttons</SectionLabel>
      <div className='flex flex-col gap-3 rounded-md border p-3'>
        {(['default', 'destructive', 'outline', 'secondary', 'ghost', 'link'] as const).map(
          variant => (
            <div
              key={variant}
              className='flex items-center gap-2'
            >
              <span className='w-24 shrink-0 font-mono text-xs text-muted-foreground'>
                {variant}
              </span>
              <Button
                variant={variant}
                size='sm'
              >
                Small
              </Button>
              <Button variant={variant}>Default</Button>
              <Button
                variant={variant}
                size='lg'
              >
                Large
              </Button>
            </div>
          ),
        )}
        <div className='flex items-center gap-2'>
          <span className='w-24 shrink-0 font-mono text-xs text-muted-foreground'>icon</span>
          <Button
            variant='outline'
            size='icon'
            aria-label='Favorite'
          >
            <Star />
          </Button>
        </div>
      </div>
    </section>
  )
}

export function BadgeShowcaseSection() {
  return (
    <section className='flex flex-col gap-3'>
      <SectionLabel>Badges</SectionLabel>
      <div className='flex flex-wrap gap-2 rounded-md border p-3'>
        <Badge>Default</Badge>
        <Badge variant='secondary'>Secondary</Badge>
        <Badge variant='destructive'>Destructive</Badge>
        <Badge variant='outline'>Outline</Badge>
        <Badge variant='discussion'>Discussion</Badge>
        <Badge variant='review'>Review</Badge>
        <Badge variant='data_point'>Data Point</Badge>
        <Badge variant='topic_recommendation'>Topic</Badge>
        <Badge variant='comment'>Comment</Badge>
      </div>
    </section>
  )
}

export function CardShowcaseSection() {
  return (
    <section className='flex flex-col gap-3'>
      <SectionLabel>Cards</SectionLabel>
      <div className='grid gap-2 sm:grid-cols-2'>
        <Card>
          <CardHeader>
            <CardTitle>Card Title</CardTitle>
            <CardDescription>Card description with supporting text.</CardDescription>
          </CardHeader>
          <CardContent>
            <p className='text-sm'>Card content goes here. This is the body of the card.</p>
          </CardContent>
          <CardFooter>
            <Button size='sm'>Action</Button>
          </CardFooter>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Another Card</CardTitle>
            <CardDescription>Demonstrating the card layout system.</CardDescription>
          </CardHeader>
          <CardContent>
            <p className='text-sm text-muted-foreground'>
              Cards use p-3 padding and gap-1 between header elements.
            </p>
          </CardContent>
        </Card>
      </div>
    </section>
  )
}

export function FormShowcaseSection() {
  return (
    <section className='flex flex-col gap-3'>
      <SectionLabel>Form Elements</SectionLabel>
      <div className='flex flex-col gap-3 rounded-md border p-3'>
        <div className='flex flex-col gap-1'>
          <Label htmlFor='demo-input'>Label</Label>
          <Input
            id='demo-input'
            placeholder='Input placeholder...'
          />
        </div>
        <div className='flex flex-col gap-1'>
          <Label htmlFor='demo-textarea'>Textarea</Label>
          <Textarea
            id='demo-textarea'
            placeholder='Textarea placeholder...'
          />
        </div>
        <div className='flex flex-col gap-1'>
          <Label
            htmlFor='demo-error'
            className='text-destructive'
          >
            Error state *
          </Label>
          <Input
            id='demo-error'
            className='border-destructive'
            placeholder='Invalid input'
          />
          <p className='text-xs text-destructive'>This field is required.</p>
        </div>
      </div>
    </section>
  )
}

export function TabsShowcaseSection() {
  return (
    <section className='flex flex-col gap-3'>
      <SectionLabel>Tabs</SectionLabel>
      <Tabs defaultValue='tab1'>
        <TabsList>
          <TabsTrigger value='tab1'>Overview</TabsTrigger>
          <TabsTrigger value='tab2'>Details</TabsTrigger>
          <TabsTrigger value='tab3'>Settings</TabsTrigger>
        </TabsList>
        {['Overview', 'Details', 'Settings'].map((label, index) => (
          <TabsContent
            key={label}
            value={`tab${index + 1}`}
          >
            <Card>
              <CardContent className='pt-3'>
                <p className='text-sm text-muted-foreground'>{label} tab content.</p>
              </CardContent>
            </Card>
          </TabsContent>
        ))}
      </Tabs>
    </section>
  )
}
