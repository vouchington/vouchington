export type OAuthLoginToken =
  | { provider: 'facebook'; token: string }
  | { provider: 'apple'; token: string; nonce: string; userData?: { name?: string } }
  | { provider: 'google'; credential: string }
  | { provider: 'x'; code: string; codeVerifier: string; redirectUri: string }
  | { provider: 'linkedin'; code: string; codeVerifier: string; redirectUri: string }
  | { provider: 'microsoft'; code: string; codeVerifier: string; redirectUri: string }
  | { provider: 'github'; code: string; redirectUri: string }
