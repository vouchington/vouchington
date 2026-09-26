const credentialId = 'storybook-credential'

export async function startAuthentication() {
  return {
    id: credentialId,
    rawId: credentialId,
    type: 'public-key' as const,
    response: {
      clientDataJSON: 'storybook',
      authenticatorData: 'storybook',
      signature: 'storybook',
      userHandle: 'storybook',
    },
    clientExtensionResults: {},
    authenticatorAttachment: 'platform' as const,
  }
}

export async function startRegistration() {
  return {
    id: credentialId,
    rawId: credentialId,
    type: 'public-key' as const,
    response: {
      clientDataJSON: 'storybook',
      attestationObject: 'storybook',
    },
    clientExtensionResults: {},
    authenticatorAttachment: 'platform' as const,
  }
}
