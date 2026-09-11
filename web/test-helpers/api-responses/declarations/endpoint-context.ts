import type { WebFixtureClientEndpointContext } from './client-endpoint-context'
import type { WebFixtureServerEndpointContext } from './server-endpoint-context'
import type { ServerRequest } from '@/lib/api/server/request'

export interface WebFixtureEndpointContext {
  readonly client: WebFixtureClientEndpointContext
  readonly server: WebFixtureServerEndpointContext
  readonly rawServer: Pick<ServerRequest, 'get'>
}
