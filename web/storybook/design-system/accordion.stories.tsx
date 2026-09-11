import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import type * as React from 'react'

import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion'

type AccordionArgs = React.ComponentProps<typeof Accordion>

const meta = {
  title: 'Design System/Components/Accordion',
  component: Accordion,
} satisfies Meta<typeof Accordion>

export default meta
type Story = StoryObj<typeof meta>

export const Single: Story = {
  args: {
    type: 'single',
    collapsible: true,
  },
  render: (args: AccordionArgs) => (
    <Accordion
      {...args}
      className='w-96'
    >
      <AccordionItem value='item-1'>
        <AccordionTrigger>What is Voucha?</AccordionTrigger>
        <AccordionContent>
          Voucha is a knowledge network where experts vouch for sources, topics, and communities.
        </AccordionContent>
      </AccordionItem>
      <AccordionItem value='item-2'>
        <AccordionTrigger>How does vouching work?</AccordionTrigger>
        <AccordionContent>
          Members with domain expertise cast vouch votes on content, and the community&apos;s
          collective judgment surfaces trusted sources.
        </AccordionContent>
      </AccordionItem>
      <AccordionItem value='item-3'>
        <AccordionTrigger>Can I join multiple communities?</AccordionTrigger>
        <AccordionContent>
          Yes. You can join and contribute to as many communities as you like.
        </AccordionContent>
      </AccordionItem>
    </Accordion>
  ),
}

export const Multiple: Story = {
  args: {
    type: 'multiple',
  },
  render: (args: AccordionArgs) => (
    <Accordion
      {...args}
      className='w-96'
    >
      <AccordionItem value='a'>
        <AccordionTrigger>First section</AccordionTrigger>
        <AccordionContent>Content for the first section.</AccordionContent>
      </AccordionItem>
      <AccordionItem value='b'>
        <AccordionTrigger>Second section</AccordionTrigger>
        <AccordionContent>Content for the second section.</AccordionContent>
      </AccordionItem>
    </Accordion>
  ),
}
