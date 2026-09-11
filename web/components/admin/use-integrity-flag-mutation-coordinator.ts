'use client'

import { useEffect, useReducer, useState } from 'react'
import {
  IntegrityFlagMutationController,
  type IntegrityFlagMutationControllerOptions,
  type IntegrityFlagMutationKind,
  type IntegrityFlagReconciliationKind,
} from './integrity-flag-mutation-controller'

export function useIntegrityFlagMutationCoordinator<F>(
  options: IntegrityFlagMutationControllerOptions<F>,
) {
  const [controller, setController] = useReducer(
    (
      current: IntegrityFlagMutationController<F>,
      nextOptions: IntegrityFlagMutationControllerOptions<F>,
    ) => {
      current.updateOptions(nextOptions)
      return current
    },
    options,
    initialOptions => new IntegrityFlagMutationController(initialOptions),
  )
  useEffect(() => setController(options), [options])
  const [state, setState] = useState(() => controller.state)
  const publish = () => setState(controller.state)

  function acquire(flagId: string, kind: IntegrityFlagMutationKind) {
    const acquired = controller.acquire(flagId, kind)
    publish()
    return acquired
  }

  function preventPenaltyRetry(flagId: string) {
    controller.preventPenaltyRetry(flagId)
  }

  function release(flagId: string) {
    controller.release(flagId)
    publish()
  }

  function fail(flagId: string, message: string) {
    controller.fail(flagId, message)
    publish()
  }

  function requireReconciliation(flagId: string, kind: IntegrityFlagReconciliationKind) {
    controller.requireReconciliation(flagId, kind)
    publish()
  }

  async function reconcile(flagId: string, kind: IntegrityFlagReconciliationKind) {
    const reconciled = await controller.reconcile(flagId, kind)
    publish()
    return reconciled
  }

  async function retryReconciliation(flagId: string) {
    await controller.retryReconciliation(flagId)
    publish()
  }

  return {
    ...state,
    acquire,
    fail,
    preventPenaltyRetry,
    reconcile,
    release,
    requireReconciliation,
    retryReconciliation,
  }
}
