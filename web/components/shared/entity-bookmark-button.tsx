'use client'
import type { ReactNode } from 'react'
import { Button, type ButtonProps } from '@/components/ui/button'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import { useTranslations } from '@/lib/i18n/use-translations'
import { BOOKMARK_PRESETS, type EntityBookmarkPreset } from './entity-bookmark-button-presets'
import { EntityActionIcons, type EntityActionIconKey } from './entity-action-icons'

import { useEntityBookmarkState } from './use-entity-bookmark-state'

export interface EntityBookmarkButtonProps {
  entityType: string
  entityId: string
  preset?: EntityBookmarkPreset
  predicate?: string
  activeLabel?: string
  inactiveLabel?: string
  errorLabel?: string
  initialActive?: boolean
  variant?: 'default' | 'secondary' | 'outline'
  size?: ButtonProps['size']
  tooltip?: ReactNode
  loadingTooltip?: string
  activeTooltip?: string
  inactiveTooltip?: string
  iconKey?: EntityActionIconKey
  onChange?: (isActive: boolean) => void
  'aria-label'?: string
  'data-pw'?: string
}
export function EntityBookmarkButton({
  entityType,
  entityId,
  preset,
  predicate,
  activeLabel,
  inactiveLabel,
  errorLabel,
  initialActive,
  variant,
  size = 'sm',
  tooltip,
  loadingTooltip,
  activeTooltip,
  inactiveTooltip,
  iconKey,
  onChange,
  'aria-label': ariaLabel,
  'data-pw': dataPw = 'entity-bookmark-button',
}: EntityBookmarkButtonProps) {
  const t = useTranslations()
  const presetConfig = preset ? BOOKMARK_PRESETS[preset] : undefined
  const resolvedPredicate = predicate ?? presetConfig?.predicate
  const resolvedActiveLabel =
    activeLabel ?? (presetConfig ? t(presetConfig.activeLabel) : undefined)
  const resolvedInactiveLabel =
    inactiveLabel ?? (presetConfig ? t(presetConfig.inactiveLabel) : undefined)
  const resolvedErrorLabel =
    errorLabel ??
    (presetConfig ? t(presetConfig.errorLabel) : undefined) ??
    t('extracted.shared.entityBookmarkButton.bookmark_ffe7fcd2')
  const resolvedVariant = variant ?? presetConfig?.variant ?? 'default'
  const resolvedLoadingTooltip =
    loadingTooltip ?? (presetConfig?.loadingTooltip ? t(presetConfig.loadingTooltip) : undefined)
  const resolvedActiveTooltip = activeTooltip
  const resolvedInactiveTooltip = inactiveTooltip
  if (!resolvedPredicate || !resolvedActiveLabel || !resolvedInactiveLabel) {
    throw new Error('EntityBookmarkButton requires a preset or predicate and labels.')
  }
  const { isActive, isPending, canToggle, handleToggle } = useEntityBookmarkState({
    entityType,
    entityId,
    resolvedPredicate,
    initialActive,
    resolvedErrorLabel,
    onChange,
  })
  const buttonLabel = isActive ? resolvedActiveLabel : resolvedInactiveLabel
  const buttonVariant = isActive ? 'secondary' : resolvedVariant
  const Icon = iconKey ? EntityActionIcons[iconKey] : undefined
  const button = (
    <Button
      type='button'
      variant={buttonVariant}
      size={size}
      onClick={handleToggle}
      disabled={isPending || !canToggle}
      aria-pressed={isActive}
      aria-label={ariaLabel}
      data-pw={dataPw}
      data-active={isActive}
    >
      {Icon ? <Icon /> : null}
      {buttonLabel}
    </Button>
  )
  const stateTooltip =
    tooltip !== undefined ? tooltip : isActive ? resolvedActiveTooltip : resolvedInactiveTooltip
  const currentTooltip =
    resolvedLoadingTooltip && !canToggle ? resolvedLoadingTooltip : stateTooltip
  const tooltipTrigger =
    resolvedLoadingTooltip && !canToggle ? (
      <Button
        type='button'
        variant={buttonVariant}
        size={size}
        aria-disabled='true'
        className='cursor-not-allowed opacity-50'
        onClick={event => event.preventDefault()}
      >
        {Icon ? <Icon /> : null}
        {buttonLabel}
      </Button>
    ) : (
      button
    )
  if (currentTooltip) {
    return (
      <TooltipProvider delayDuration={0}>
        <Tooltip>
          <TooltipTrigger asChild>{tooltipTrigger}</TooltipTrigger>
          <TooltipContent>{currentTooltip}</TooltipContent>
        </Tooltip>
      </TooltipProvider>
    )
  }
  return button
}
