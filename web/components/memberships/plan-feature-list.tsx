'use client'

import { Check, X } from 'lucide-react'
import { PlanFeatureLabel } from './plan-feature-label'
import type { PlanFeature } from './plan-card-data'

export function PlanFeatureList({ features }: { features: PlanFeature[] | undefined }) {
  return (
    <ul className='mb-4 flex-1 space-y-2'>
      {features?.map(feature => (
        <li
          key={feature.label}
          className='flex items-center gap-2 text-sm text-muted-foreground'
        >
          {feature.included ? (
            <Check className='h-4 w-4 shrink-0 text-emerald-600' />
          ) : (
            <X className='h-4 w-4 shrink-0 text-muted-foreground' />
          )}
          <PlanFeatureLabel
            label={feature.label}
            tooltip={feature.tooltip}
            className='h-auto w-full min-w-0 justify-start whitespace-normal break-words p-0 text-left text-sm font-normal text-muted-foreground underline decoration-dotted underline-offset-2 hover:bg-transparent hover:text-muted-foreground'
          />
        </li>
      ))}
    </ul>
  )
}
