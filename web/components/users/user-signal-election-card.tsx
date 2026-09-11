'use client'

import { useState, type ComponentType } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import { useTranslations } from '@/lib/i18n/use-translations'
import {
  isEmailVerificationRequired,
  useEmailVerificationRecovery,
} from '@/lib/email-verification-recovery-context'

type VoteChoice = import('@/lib/api/client/elections').SentimentChoice

interface SignalAction {
  choice: VoteChoice
  label: string
  ariaLabel: string
  tooltip: string
  successMessage: string
  icon: ComponentType<{ className?: string }>
  variant?: 'outline' | 'destructive'
}

export interface UserSignalElectionCardProps {
  userId: string
  title: string
  description: string
  submitVote: (id: string, choice: VoteChoice) => Promise<void>
  clearVote?: (id: string) => Promise<void>
  errorMessage: string
  actions: readonly SignalAction[]
  initialChoice?: VoteChoice | null
  canCreateTrustSignal?: boolean
  onVoteSubmitted?: (choice: VoteChoice) => void
  'data-pw'?: string
}

export function UserSignalElectionCard({
  initialChoice = null,
  userId,
  ...props
}: UserSignalElectionCardProps) {
  return (
    <UserSignalElectionCardContent
      key={`${userId}:${initialChoice ?? 'none'}`}
      {...props}
      userId={userId}
      initialChoice={initialChoice}
    />
  )
}

function UserSignalElectionCardContent({
  userId,
  title,
  description,
  submitVote,
  clearVote,
  errorMessage,
  actions,
  initialChoice = null,
  canCreateTrustSignal = true,
  onVoteSubmitted,
  'data-pw': dataPw = 'user-signal-election-card',
}: UserSignalElectionCardProps) {
  const t = useTranslations()
  const emailRecovery = useEmailVerificationRecovery()
  const [isLoading, setIsLoading] = useState(false)
  const [selectedChoice, setSelectedChoice] = useState<VoteChoice | null>(initialChoice)

  async function handleVote(action: SignalAction) {
    if (isLoading) return

    setIsLoading(true)
    const previousChoice = selectedChoice
    setSelectedChoice(action.choice)
    try {
      await submitVote(userId, action.choice)
      toast.success(action.successMessage)
      onVoteSubmitted?.(action.choice)
    } catch (error) {
      setSelectedChoice(previousChoice)
      if (isEmailVerificationRequired(error)) {
        emailRecovery?.openEmailVerificationRecovery()
      } else {
        toast.error(errorMessage)
      }
    } finally {
      setIsLoading(false)
    }
  }

  async function handleClear() {
    if (isLoading) return
    const previousChoice = selectedChoice
    setIsLoading(true)
    setSelectedChoice(null)
    try {
      if (!clearVote) return
      await clearVote(userId)
    } catch (error) {
      setSelectedChoice(previousChoice)
      if (isEmailVerificationRequired(error)) {
        emailRecovery?.openEmailVerificationRecovery()
      } else {
        toast.error(errorMessage)
      }
    } finally {
      setIsLoading(false)
    }
  }

  const visibleActions = actions.filter(
    action => action.choice !== 'neutral' || selectedChoice !== null,
  )

  return (
    <Card
      className='border-dashed border-border/70 bg-card/95 shadow-sm'
      data-pw={dataPw}
    >
      <CardHeader className='gap-2'>
        <p className='text-[11px] font-medium uppercase tracking-[0.24em] text-muted-foreground'>
          {t('extracted.users.userSignalElectionCard.communitySignal_f86353d0')}
        </p>
        <CardTitle className='text-base'>{title}</CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent>
        <TooltipProvider delayDuration={0}>
          <div className='flex flex-wrap gap-2'>
            {visibleActions.map(action => {
              const Icon = action.icon

              return (
                <Tooltip key={action.label}>
                  <TooltipTrigger asChild>
                    <Button
                      type='button'
                      variant={action.variant ?? 'outline'}
                      size='sm'
                      aria-label={action.ariaLabel}
                      aria-pressed={selectedChoice === action.choice}
                      onClick={() => handleVote(action)}
                      disabled={isLoading || !canCreateTrustSignal}
                      className='flex items-center gap-2'
                      data-pw='user-signal-vote-choice'
                      data-vote-choice={action.choice}
                    >
                      <Icon className='h-4 w-4' />
                      {action.label}
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>{action.tooltip}</TooltipContent>
                </Tooltip>
              )
            })}
          </div>
          {clearVote && !canCreateTrustSignal && selectedChoice !== null && (
            <Button
              type='button'
              variant='ghost'
              size='sm'
              disabled={isLoading}
              onClick={() => {
                void handleClear()
              }}
              data-pw='user-signal-vote-clear'
            >
              {t('extracted.votes.semanticVote.clear')}
            </Button>
          )}
        </TooltipProvider>
      </CardContent>
    </Card>
  )
}
