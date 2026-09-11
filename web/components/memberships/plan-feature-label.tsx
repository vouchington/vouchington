'use client'

import { Button } from '@/components/ui/button'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'

interface PlanFeatureLabelProps {
  label: string
  tooltip?: string
  className?: string
  'data-pw'?: string
}

export function PlanFeatureLabel({
  label,
  tooltip,
  className,
  'data-pw': dataPw = 'plan-feature-label',
}: PlanFeatureLabelProps) {
  return (
    <span
      data-pw={dataPw}
      className={tooltip ? 'min-w-0 flex-1' : className}
    >
      {tooltip ? (
        <TooltipProvider delayDuration={0}>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                type='button'
                variant='ghost'
                className={className}
              >
                {label}
              </Button>
            </TooltipTrigger>
            <TooltipContent>{tooltip}</TooltipContent>
          </Tooltip>
        </TooltipProvider>
      ) : (
        label
      )}
    </span>
  )
}
