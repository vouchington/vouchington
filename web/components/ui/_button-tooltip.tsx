'use client'

import * as React from 'react'

import { Button, type ButtonProps } from '@/components/ui/button'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'

function ButtonTooltip({
  children,
  tooltip,
}: {
  children: React.ReactNode
  tooltip: React.ReactNode
}) {
  return (
    <TooltipProvider delayDuration={0}>
      <Tooltip>
        <TooltipTrigger asChild>{children}</TooltipTrigger>
        <TooltipContent>{tooltip}</TooltipContent>
      </Tooltip>
    </TooltipProvider>
  )
}

export type TooltipButtonProps = ButtonProps & {
  tooltip: React.ReactNode
  ref?: React.Ref<HTMLButtonElement>
}

export function TooltipButton({ tooltip, ref, ...props }: TooltipButtonProps) {
  return (
    <ButtonTooltip tooltip={tooltip}>
      <Button
        ref={ref}
        {...props}
      />
    </ButtonTooltip>
  )
}
TooltipButton.displayName = 'TooltipButton'
