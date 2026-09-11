'use client'

import type { ReactNode } from 'react'
import { Card } from '@/components/ui/card'
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion'

interface AsideAccordionProps {
  title: string
  defaultOpen?: boolean
  children: ReactNode
  'data-pw'?: string
}

export function AsideAccordion({
  title,
  defaultOpen = true,
  children,
  'data-pw': dataPw,
}: AsideAccordionProps) {
  return (
    <Card
      className='px-4'
      {...(dataPw && { 'data-pw': dataPw })}
    >
      <Accordion
        type='single'
        collapsible
        defaultValue={defaultOpen ? 'item' : undefined}
      >
        <AccordionItem
          value='item'
          className='border-b-0'
        >
          <AccordionTrigger {...(dataPw && { 'data-pw': `${dataPw}-trigger` })}>
            {title}
          </AccordionTrigger>
          <AccordionContent>{children}</AccordionContent>
        </AccordionItem>
      </Accordion>
    </Card>
  )
}
