type FacebookLoginStatus = 'connected' | 'not_authorized' | 'unknown'

type FacebookAuthResponse = {
  accessToken: string
  expiresIn: number
  signedRequest: string
  userID: string
}

type FacebookLoginStatusResponse = {
  status: FacebookLoginStatus
  authResponse: FacebookAuthResponse | null
}

type FacebookLoginOptions = {
  scope?: string
  return_scopes?: boolean
  auth_type?: string
}

type FacebookInitOptions = {
  appId: string
  version: string
  cookie?: boolean
  xfbml?: boolean
}

type FB = {
  init: (options: FacebookInitOptions) => void
  login: (
    callback: (response: FacebookLoginStatusResponse) => void,
    options?: FacebookLoginOptions,
  ) => void
  getLoginStatus: (callback: (response: FacebookLoginStatusResponse) => void) => void
}

interface Window {
  FB: FB
  fbAsyncInit: () => void
}
