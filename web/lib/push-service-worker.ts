import {
  requestWorkerState,
  type WebPushBinding,
  type WebPushWorkerState,
} from '@vouchington/utils/web-push-binding'

const messageType = 'voucha:web-push'

export async function readOrInitializePushBinding(
  registration: ServiceWorkerRegistration,
  binding?: WebPushBinding,
): Promise<WebPushWorkerState> {
  return requestWorkerState(
    registration,
    { action: 'read-or-initialize', binding },
    { messageType },
  )
}

export async function bindPushBinding(
  registration: ServiceWorkerRegistration,
  binding: WebPushBinding,
  expectedRevision: string,
): Promise<Extract<WebPushWorkerState, { status: 'bound' }>> {
  const state = await requestWorkerState(
    registration,
    {
      action: 'bind',
      binding,
      expected_revision: expectedRevision,
    },
    {
      messageType,
      accept: state =>
        state.status === 'bound' &&
        state.binding.endpoint === binding.endpoint &&
        state.binding.subscription_id === binding.subscription_id &&
        state.revision === expectedRevision,
    },
  )
  if (state.status !== 'bound') throw new Error('The service worker rejected the push binding.')
  return state
}

export async function clearPushBinding(
  registration: ServiceWorkerRegistration,
): Promise<Extract<WebPushWorkerState, { status: 'disabled' }>> {
  const state = await requestWorkerState(
    registration,
    { action: 'clear' },
    { messageType, accept: state => state.status === 'disabled' },
  )
  if (state.status !== 'disabled') throw new Error('The service worker rejected the push binding.')
  return state
}

export async function beginPushBindingReconciliation(
  registration: ServiceWorkerRegistration,
): Promise<Extract<WebPushWorkerState, { status: 'reconciling' }>> {
  const state = await requestWorkerState(
    registration,
    { action: 'begin-reconciliation' },
    { messageType, accept: state => state.status === 'reconciling' },
  )
  if (state.status !== 'reconciling')
    throw new Error('The service worker rejected push binding reconciliation.')
  return state
}
