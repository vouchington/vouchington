import {
  requestWorkerState as requestSharedWorkerState,
  type WebPushBinding,
  type WebPushWorkerState,
} from '@vouchington/utils/web-push-binding'

type WorkerAction = 'read-or-initialize' | 'begin-reconciliation' | 'bind' | 'clear'
type WorkerRequest = {
  action: WorkerAction
  binding?: WebPushBinding
  expected_revision?: string
}

export async function readOrInitializePushBinding(
  registration: ServiceWorkerRegistration,
  binding?: WebPushBinding,
): Promise<WebPushWorkerState> {
  return requestWorkerState(registration, { action: 'read-or-initialize', binding })
}

export async function bindPushBinding(
  registration: ServiceWorkerRegistration,
  binding: WebPushBinding,
  expectedRevision: string,
): Promise<Extract<WebPushWorkerState, { status: 'bound' }>> {
  const state = await requestWorkerState(registration, {
    action: 'bind',
    binding,
    expected_revision: expectedRevision,
  })
  if (state.status !== 'bound') throw new Error('The service worker rejected the push binding.')
  return state
}

export async function clearPushBinding(
  registration: ServiceWorkerRegistration,
): Promise<Extract<WebPushWorkerState, { status: 'disabled' }>> {
  const state = await requestWorkerState(registration, { action: 'clear' })
  if (state.status !== 'disabled') throw new Error('The service worker rejected the push binding.')
  return state
}

export async function beginPushBindingReconciliation(
  registration: ServiceWorkerRegistration,
): Promise<Extract<WebPushWorkerState, { status: 'reconciling' }>> {
  const state = await requestWorkerState(registration, { action: 'begin-reconciliation' })
  if (state.status !== 'reconciling')
    throw new Error('The service worker rejected push binding reconciliation.')
  return state
}

function requestWorkerState(
  registration: ServiceWorkerRegistration,
  input: WorkerRequest,
): Promise<WebPushWorkerState> {
  return requestSharedWorkerState(registration, input, {
    messageType: 'voucha:web-push',
    accept: state => {
      if (input.action === 'bind')
        return (
          state.status === 'bound' &&
          state.binding.endpoint === input.binding?.endpoint &&
          state.binding.subscription_id === input.binding?.subscription_id &&
          state.revision === input.expected_revision
        )
      if (input.action === 'clear') return state.status === 'disabled'
      return input.action !== 'begin-reconciliation' || state.status === 'reconciling'
    },
  })
}
