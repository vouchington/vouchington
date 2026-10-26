import { createRequest, type AuthenticatedAgent } from './api/server.mts'

export function createNativeRequest(): AuthenticatedAgent {
  const agent = createRequest()
  agent.setClientInfo({
    'x-voucha-client': 'dotnet',
    'x-voucha-platform': 'windows',
    'x-voucha-app-version': 'test',
  })
  return agent
}
