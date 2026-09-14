const PUSH_STATE_DB = 'voucha-web-push-v1'
const PUSH_STATE_STORE = 'state'
const PUSH_STATE_KEY = 'binding'
let pushWork = Promise.resolve()
const isRevision = value => typeof value === 'string' && value.length > 0

self.addEventListener('message', event => {
  const port = event.ports?.[0]
  if (!port) return
  event.waitUntil(
    enqueuePushWork(async () => {
      try {
        const state = await handlePushMessage(event.data)
        port.postMessage({ type: 'voucha:web-push', version: 1, ok: true, state })
      } catch (error) {
        port.postMessage({
          type: 'voucha:web-push',
          version: 1,
          ok: false,
          error: error instanceof Error ? error.message : 'Invalid push binding request.',
        })
      }
    }),
  )
})

self.addEventListener('push', event => {
  let data = {}
  if (event.data) {
    try {
      data = event.data.json()
    } catch {
      data = {}
    }
  }
  event.waitUntil(enqueuePushWork(() => showBoundPushNotification(data)))
})

function enqueuePushWork(work) {
  const next = pushWork.then(work, work)
  pushWork = next.catch(console.error)
  return next
}

async function handlePushMessage(message) {
  if (!message || message.type !== 'voucha:web-push' || message.version !== 1)
    throw new Error('Unsupported push binding protocol.')
  const current = await readRevisionedPushState()
  if (message.action === 'read-or-initialize') {
    if (current) return current
    if (!isBinding(message.binding)) return { status: 'uninitialized' }
    const state = { status: 'bound', binding: message.binding, revision: crypto.randomUUID() }
    await writePushState(state)
    return state
  }
  if (message.action === 'bind') {
    if (!isBinding(message.binding)) throw new Error('A complete push binding is required.')
    if (!isRevision(message.expected_revision) || current?.revision !== message.expected_revision)
      throw new Error('The push binding barrier was superseded.')
    const state = {
      status: 'bound',
      binding: message.binding,
      revision: message.expected_revision,
    }
    await writePushState(state)
    return state
  }
  if (message.action === 'begin-reconciliation') {
    const binding = current?.binding
    const revision = crypto.randomUUID()
    const state = binding
      ? { status: 'reconciling', binding, revision }
      : { status: 'reconciling', revision }
    await writePushState(state)
    return state
  }
  if (message.action === 'clear') {
    const binding = current?.binding
    const revision = crypto.randomUUID()
    const state = binding
      ? { status: 'disabled', binding, revision }
      : { status: 'disabled', revision }
    await writePushState(state)
    await closeBoundNotificationsBestEffort(binding)
    return state
  }
  throw new Error('Unsupported push binding action.')
}

async function readRevisionedPushState() {
  const state = await readPushState()
  if (!state || state.status === 'uninitialized' || isRevision(state.revision)) return state
  const revisioned = { ...state, revision: crypto.randomUUID() }
  await writePushState(revisioned)
  return revisioned
}

async function showBoundPushNotification(data) {
  const state = await readPushState()
  if (
    (state?.status !== 'bound' && state?.status !== 'reconciling') ||
    !isBinding(state.binding) ||
    !matchesBinding(data, state.binding)
  )
    return
  const title = typeof data.title === 'string' ? data.title : 'Voucha'
  const body = typeof data.body === 'string' ? data.body : ''
  const url = getPushUrl(data)
  await self.registration.showNotification(title, {
    body,
    data: {
      url,
      web_push_endpoint: state.binding.endpoint,
      web_push_subscription_id: state.binding.subscription_id,
    },
  })
}

function getPushUrl(data) {
  if (data.target_intent === 'notifications_inbox') return '/my/notifications'
  if (
    data.target_entity?.__entity_type === 'community' &&
    typeof data.target_entity.slug === 'string'
  )
    return `/communities/${encodeURIComponent(data.target_entity.slug)}`
  return typeof data.url === 'string' ? data.url : '/'
}

function isBinding(value) {
  return Boolean(
    value &&
    typeof value.endpoint === 'string' &&
    value.endpoint &&
    typeof value.subscription_id === 'string' &&
    value.subscription_id,
  )
}

function matchesBinding(value, binding) {
  return (
    value &&
    value.web_push_endpoint === binding.endpoint &&
    value.web_push_subscription_id === binding.subscription_id
  )
}

async function closeBoundNotificationsBestEffort(binding) {
  const notifications = await self.registration.getNotifications().catch(() => [])
  for (const notification of notifications) {
    if (!binding || !matchesBinding(notification.data, binding)) continue
    try {
      notification.close()
    } catch {
      // The disabled tombstone is already durable.
    }
  }
}

function readPushState() {
  return withPushStore('readonly', store => requestResult(store.get(PUSH_STATE_KEY)))
}

function writePushState(state) {
  return withPushStore('readwrite', store => requestResult(store.put(state, PUSH_STATE_KEY)))
}

async function withPushStore(mode, operation) {
  const db = await openPushDb()
  const transaction = db.transaction(PUSH_STATE_STORE, mode)
  const request = operation(transaction.objectStore(PUSH_STATE_STORE))
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve(request)
    transaction.onerror = () =>
      reject(storageError('Push state transaction failed.', transaction.error))
    transaction.onabort = () =>
      reject(storageError('Push state transaction aborted.', transaction.error))
  })
}

function requestResult(request) {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(storageError('Push state request failed.', request.error))
  })
}

function openPushDb() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(PUSH_STATE_DB, 1)
    request.onupgradeneeded = () => request.result.createObjectStore(PUSH_STATE_STORE)
    request.onsuccess = () => resolve(request.result)
    request.onerror = () =>
      reject(storageError('Unable to open push state storage.', request.error))
  })
}

function storageError(message, cause) {
  return cause ? new Error(message, { cause }) : new Error(message)
}
