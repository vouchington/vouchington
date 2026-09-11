'use client'

import { useCallback, useEffect, useReducer } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { fetchRefundableCharges } from '@/lib/api/client/memberships'
import type { RefundableCharge } from '@/types/api-responses'
import { chargeKey } from './membership-refund-charge-key.ts'
import { MembershipRefundForm } from './membership-refund-form.tsx'
import { useTranslations } from '@/lib/i18n/use-translations'

type ChargesState =
  | { status: 'loading'; userId: string; request: object | null }
  | { status: 'empty'; userId: string; request: object }
  | { status: 'loaded'; userId: string; request: object; charges: RefundableCharge[] }

type ChargesAction =
  | { type: 'loading'; userId: string; request: object }
  | { type: 'loaded'; userId: string; request: object; charges: RefundableCharge[] }
  | { type: 'empty'; userId: string; request: object }

function chargesReducer(state: ChargesState, action: ChargesAction): ChargesState {
  if (action.type === 'loading') return { status: 'loading', ...action }
  if (state.userId !== action.userId || state.request !== action.request) return state
  if (action.type === 'empty') return { status: 'empty', ...action }
  return action.charges.length === 0
    ? { status: 'empty', ...action }
    : { status: 'loaded', ...action, charges: action.charges }
}

interface MembershipRefundPanelProps {
  actorUserId: string
  userId: string
}

export function MembershipRefundPanel({ actorUserId, userId }: MembershipRefundPanelProps) {
  const t = useTranslations()
  const [state, dispatch] = useReducer(chargesReducer, {
    status: 'loading',
    userId,
    request: null,
  })

  const loadCharges = useCallback(async () => {
    const request = {}
    dispatch({ type: 'loading', userId, request })
    try {
      const { charges } = await fetchRefundableCharges(userId)
      dispatch({ type: 'loaded', userId, request, charges })
    } catch (error) {
      console.error('Failed to load refundable charges:', error)
      dispatch({ type: 'empty', userId, request })
    }
  }, [userId])

  useEffect(() => {
    void loadCharges()
  }, [loadCharges])

  const currentState = state.userId === userId ? state : { status: 'loading' as const }

  return (
    <Card>
      <CardHeader>
        <CardTitle data-pw='membership-refund-title'>
          {t('extracted.admin.membershipRefundPanel.membershipRefunds_9b8009ac')}
        </CardTitle>
        <CardDescription>
          {t('extracted.admin.membershipRefundPanel.issueAStripeRefundAgainstA_625df244')}
        </CardDescription>
      </CardHeader>
      <CardContent>
        {currentState.status === 'loading' ? (
          <p className='text-sm text-muted-foreground'>
            {t('extracted.admin.membershipRefundPanel.loadingCharges_8c970572')}
          </p>
        ) : currentState.status === 'empty' ? (
          <p
            data-pw='membership-refund-empty'
            className='text-sm text-muted-foreground'
          >
            {t('extracted.admin.membershipRefundPanel.noRefundableChargesThisMemberMay_92daf09a')}
          </p>
        ) : (
          <MembershipRefundForm
            key={`${actorUserId}:${userId}:${currentState.charges.map(chargeKey).toSorted().join(',')}`}
            actorUserId={actorUserId}
            userId={userId}
            charges={currentState.charges}
            onReload={() => {
              void loadCharges()
            }}
          />
        )}
      </CardContent>
    </Card>
  )
}
