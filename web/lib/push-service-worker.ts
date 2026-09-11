export type WebPushBinding = {
  endpoint: string
  subscription_id: string
}

export type WebPushWorkerState =
  | { status: 'uninitialized' }
  | { status: 'bound'; binding: WebPushBinding; revision: string }
  | { status: 'reconciling'; binding?: WebPushBinding; revision: string }
  | { status: 'disabled'; binding?: WebPushBinding; revision: string }

type WorkerRequest = {
  type: 'voucha:web-push'
  version: 1
  action: 'read-or-initialize' | 'begin-reconciliation' | 'bind' | 'clear'
  binding?: WebPushBinding
  expected_revision?: string
}

type WorkerResponse = {
  type: 'voucha:web-push'
  version: 1
  ok: boolean
  state?: WebPushWorkerState
  error?: string
}

const WORKER_ACK_TIMEOUT_MS = 5000

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

async function requestWorkerState(
  registration: ServiceWorkerRegistration,
  input: Omit<WorkerRequest, 'type' | 'version'>,
): Promise<WebPushWorkerState> {
  const worker = registration.active
  if (!worker) throw new Error('The active service worker is unavailable.')

  const channel = new MessageChannel()
  const request: WorkerRequest = { type: 'voucha:web-push', version: 1, ...input }
  return new Promise<WebPushWorkerState>((resolve, reject) => {
    const timeout = window.setTimeout(() => {
      channel.port1.close()
      reject(new Error('The service worker did not acknowledge the push binding request.'))
    }, WORKER_ACK_TIMEOUT_MS)
    channel.port1.onmessage = event => {
      window.clearTimeout(timeout)
      channel.port1.close()
      const response = event.data as WorkerResponse
      if (!isExpectedWorkerResponse(response, input)) {
        reject(
          new Error(response?.error ?? 'The service worker rejected the push binding request.'),
        )
        return
      }
      resolve(response.state)
    }
    worker.postMessage(request, [channel.port2])
  })
}

function isExpectedWorkerResponse(
  response: WorkerResponse | undefined,
  input: Omit<WorkerRequest, 'type' | 'version'>,
): response is WorkerResponse & { state: WebPushWorkerState } {
  if (
    !response ||
    response.type !== 'voucha:web-push' ||
    response.version !== 1 ||
    !response.ok ||
    !isWorkerState(response.state)
  )
    return false
  if (input.action === 'bind')
    return (
      response.state.status === 'bound' &&
      response.state.binding.endpoint === input.binding?.endpoint &&
      response.state.binding.subscription_id === input.binding?.subscription_id &&
      response.state.revision === input.expected_revision
    )
  if (input.action === 'clear') return response.state.status === 'disabled'
  return input.action !== 'begin-reconciliation' || response.state.status === 'reconciling'
}

function isWorkerState(value: unknown): value is WebPushWorkerState {
  if (!value || typeof value !== 'object') return false
  const state = value as { status?: unknown; binding?: unknown; revision?: unknown }
  if (state.status === 'uninitialized') return state.binding === undefined
  if (state.status === 'bound') return isWebPushBinding(state.binding) && isRevision(state.revision)
  return (
    (state.status === 'reconciling' || state.status === 'disabled') &&
    isRevision(state.revision) &&
    (state.binding === undefined || isWebPushBinding(state.binding))
  )
}

function isRevision(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0
}

function isWebPushBinding(value: unknown): value is WebPushBinding {
  if (!value || typeof value !== 'object') return false
  const binding = value as { endpoint?: unknown; subscription_id?: unknown }
  return (
    typeof binding.endpoint === 'string' &&
    binding.endpoint.length > 0 &&
    typeof binding.subscription_id === 'string' &&
    binding.subscription_id.length > 0
  )
}
