'use client'

import { Label } from '@/components/ui/label'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import { cn } from '@/lib/utils'

export interface ChoiceOption<T extends string> {
  value: T
  label: string
  dataPw: string
}

interface ChoiceRadioGroupProps<T extends string> {
  idPrefix: string
  legend: string
  options: readonly ChoiceOption<T>[]
  value: T
  onChange: (value: T) => void
}

export function ChoiceRadioGroup<T extends string>({
  idPrefix,
  legend,
  options,
  value,
  onChange,
}: ChoiceRadioGroupProps<T>) {
  return (
    <fieldset className='space-y-2'>
      <legend className='text-sm font-medium'>{legend}</legend>
      <RadioGroup
        aria-label={legend}
        value={value}
        // Radix emits only the `value` of a rendered item, and every item's value is a `T`.
        onValueChange={next => onChange(next as T)}
        className='grid gap-2 sm:grid-cols-2'
      >
        {options.map(option => {
          const id = `${idPrefix}-${option.value}`
          return (
            <Label
              key={option.value}
              htmlFor={id}
              className={cn(
                'flex min-h-11 cursor-pointer items-center gap-2 rounded-md border px-3 py-2 text-sm font-normal transition-colors hover:bg-accent/50',
                option.value === value && 'border-primary bg-primary/5 hover:bg-primary/5',
              )}
            >
              <RadioGroupItem
                id={id}
                value={option.value}
                // oxlint-disable-next-line no-mistakes/playwright-literals -- literal identifier supplied by each option
                data-pw={option.dataPw}
              />
              {option.label}
            </Label>
          )
        })}
      </RadioGroup>
    </fieldset>
  )
}
