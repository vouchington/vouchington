import type { PrivateUser } from '@services/users/types'
import type { RequestContextStore } from '@modules/utils/request-context'

export { createRequestContextListener, setRequestCurrentUser } from '@modules/utils/request-context'

/** Request-local actor and committed user-agent identities; target entities are not cached here. */
export type RequestContext = Omit<RequestContextStore, 'currentUser'> & {
  currentUser?: PrivateUser | null
}
