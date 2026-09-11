'use client'

import * as React from 'react'
import type { CheckedState } from '@radix-ui/react-checkbox'
import { Checkbox } from '@/components/ui/checkbox'
import { Label } from '@/components/ui/label'
import { cn } from '@/lib/utils'

interface CheckboxCardProps {
  id: string
  checked: boolean
  onCheckedChange: (checked: boolean) => void
  label: React.ReactNode
  description?: React.ReactNode
  disabled?: boolean
  className?: string
  'data-pw'?: string
}

export function CheckboxCard({
  id,
  checked,
  onCheckedChange,
  label,
  description,
  disabled,
  className,
  'data-pw': dataPw = 'checkbox-card',
}: CheckboxCardProps) {
  const titleId = `${id}-title`
  const descriptionId = `${id}-description`

  return (
    <Label
      htmlFor={id}
      data-pw={dataPw}
      className={cn(
        'flex cursor-pointer items-start gap-3 rounded-md border bg-background p-4 text-foreground transition-colors hover:bg-accent/50 has-[:disabled]:cursor-not-allowed has-[:disabled]:opacity-60',
        className,
      )}
    >
      <Checkbox
        id={id}
        checked={checked}
        onCheckedChange={(value: CheckedState) => onCheckedChange(value === true)}
        disabled={disabled}
        className='mt-0.5'
        aria-labelledby={titleId}
        aria-describedby={description != null ? descriptionId : undefined}
      />
      <div className='space-y-1'>
        <div
          id={titleId}
          className='text-sm font-medium leading-none text-foreground'
        >
          {label}
        </div>
        {description != null && (
          <p
            id={descriptionId}
            className='text-sm font-normal text-muted-foreground'
          >
            {description}
          </p>
        )}
      </div>
    </Label>
  )
}
