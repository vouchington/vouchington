import type { Meta, StoryObj } from '@storybook/nextjs-vite'

import { Card, CardContent } from '@/components/ui/card'
import {
  Carousel,
  CarouselContent,
  CarouselItem,
  CarouselNext,
  CarouselPrevious,
} from '@/components/ui/carousel'

const meta = {
  title: 'Design System/Components/Carousel',
  component: Carousel,
} satisfies Meta<typeof Carousel>

export default meta
type Story = StoryObj<typeof meta>

const slides = Array.from({ length: 5 }, (_, i) => i + 1)

export const Horizontal: Story = {
  render: () => (
    <div className='flex justify-center p-12'>
      <Carousel className='w-full max-w-xs'>
        <CarouselContent>
          {slides.map(n => (
            <CarouselItem key={n}>
              <Card>
                <CardContent className='flex aspect-square items-center justify-center p-6'>
                  <span className='text-4xl font-semibold'>{n}</span>
                </CardContent>
              </Card>
            </CarouselItem>
          ))}
        </CarouselContent>
        <CarouselPrevious />
        <CarouselNext />
      </Carousel>
    </div>
  ),
}

export const Vertical: Story = {
  render: () => (
    <div className='flex justify-center p-12'>
      <Carousel
        opts={{ align: 'start' }}
        orientation='vertical'
        className='w-full max-w-xs'
      >
        <CarouselContent className='-mt-1 h-48'>
          {slides.map(n => (
            <CarouselItem
              key={n}
              className='pt-1 md:basis-1/2'
            >
              <Card>
                <CardContent className='flex items-center justify-center p-6'>
                  <span className='text-3xl font-semibold'>{n}</span>
                </CardContent>
              </Card>
            </CarouselItem>
          ))}
        </CarouselContent>
        <CarouselPrevious />
        <CarouselNext />
      </Carousel>
    </div>
  ),
}
