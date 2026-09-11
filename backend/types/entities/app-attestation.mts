export type AppAttestEnvironment = 'production' | 'development'

export type AppAttestChallengeType = 'attestation' | 'assertion'

export type AttestationResult = {
  keyId: string
  environment: AppAttestEnvironment
}

export type AssertionResult = {
  keyId: string
  signCount: number
}
