'use client'

import { useReducer, useRef } from 'react'
import { Breadcrumbs } from '@/components/ui/breadcrumb'
import { useResolvedBreadcrumbs } from '@/lib/navigation/use-resolved-breadcrumbs'
import { grantMembership, fetchPlans } from '@/lib/api/client/memberships'
import { useTranslations } from '@/lib/i18n/use-translations'
import { groupStripeMembershipProducts } from '@/lib/memberships/catalog'

import { MembershipGrantForm } from './membership-grant-form'
import {
  initialMembershipGrantState,
  membershipGrantReducer,
  isValidDurationDays,
} from './membership-grant-state'

export default function MembershipsAdminPage() {
  const t = useTranslations()
  const [state, dispatch] = useReducer(membershipGrantReducer, initialMembershipGrantState)
  const latestPlanRef = useRef('') // discard stale fetchPlans responses

  async function handlePlanChange(selectedPlan: string) {
    latestPlanRef.current = selectedPlan
    dispatch({ plan: selectedPlan, skuId: '', skuOptions: [], errorMessage: '' })
    if (!selectedPlan) return
    try {
      const r = await fetchPlans()
      if (latestPlanRef.current === selectedPlan) {
        dispatch({ skuOptions: groupStripeMembershipProducts(r.products)[selectedPlan] ?? [] })
      }
    } catch {
      if (latestPlanRef.current === selectedPlan) {
        dispatch({
          errorMessage: t(
            'extracted.grants.membershipsAdminClient.failedToLoadSkusForSelectedPlan_7a1b2c3d',
          ),
        })
      }
    }
  }

  async function handleGrant() {
    if (!state.userId || !state.plan || !state.skuId || !isValidDurationDays(state.durationDays))
      return
    dispatch({ loading: true, successMessage: '', errorMessage: '' })
    try {
      const result = await grantMembership(
        state.userId,
        state.plan,
        state.skuId,
        Number(state.durationDays),
      )
      dispatch(s => ({
        successMessage: t(
          result.queued
            ? 'extracted.grants.membershipsAdminClient.membershipGrantQueued_9f0a1b2c'
            : 'extracted.grants.membershipsAdminClient.membershipGrantedSuccessfully_8e9f0a1b',
        ),
        userId: '',
        plan: '',
        skuId: '',
        durationDays: '',
        skuOptions: [],
        userKey: s.userKey + 1,
      }))
    } catch (error) {
      dispatch({
        errorMessage:
          error instanceof Error
            ? error.message
            : t('extracted.grants.membershipsAdminClient.unknownError_2c3d4e5f'),
      })
    } finally {
      dispatch({ loading: false })
    }
  }

  const breadcrumbItems = useResolvedBreadcrumbs({
    tail: [{ name: 'Memberships', path: '/memberships/grants' }],
  })

  return (
    <div className='space-y-4'>
      <Breadcrumbs items={breadcrumbItems} />
      <div>
        <h1
          data-pw='memberships-admin-heading'
          className='text-2xl font-bold'
        >
          {t('extracted.grants.membershipsAdminClient.membershipsAdmin_1e190901')}
        </h1>
        <p className='text-sm text-muted-foreground'>
          {t('extracted.grants.membershipsAdminClient.grantMembershipsToUsers_016a2232')}
        </p>
      </div>

      <MembershipGrantForm
        state={state}
        dispatch={dispatch}
        handlePlanChange={handlePlanChange}
        handleGrant={handleGrant}
      />
    </div>
  )
}
