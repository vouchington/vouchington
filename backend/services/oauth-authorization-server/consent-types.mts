import type { ApiScope } from '@modules/scopes'

export type AuthorizationRequestRow = {
  id: string
  client_id: string
  user_id: string
  redirect_uri: string
  client_state: string
  resource: string
  scopes: ApiScope[]
  client_scopes: ApiScope[]
  redirect_uris: string[]
  code_challenge: string
  owner_user_id: string | null
}
