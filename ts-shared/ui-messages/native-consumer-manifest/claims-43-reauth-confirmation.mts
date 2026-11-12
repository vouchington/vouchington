import type { NativeConsumerManifestEntry } from './types.mts'

export const NATIVE_CONSUMER_MANIFEST_CLAIMS_43_REAUTH_CONFIRMATION = [
  {
    key: 'extracted.auth.mfaStep.invalidVerificationCode_4ed23ad3',
    consumers: ['dotnet', 'swift'],
  },
  {
    key: 'extracted.auth.mfaStep.unableToVerifyPleaseTryAgain_b7979b96',
    consumers: ['dotnet', 'swift'],
  },
  {
    key: 'extracted.emailManager.verifyEmailForm.verificationCode_3ee75029',
    consumers: ['dotnet', 'swift'],
  },
  {
    key: 'extracted.mfaReauthDialog.methodSelector.authenticatorApp_09a12ace',
    consumers: ['dotnet', 'swift'],
  },
  {
    key: 'extracted.mfaReauthDialog.methodSelector.emailVerification_4d225196',
    consumers: ['dotnet', 'swift'],
  },
  {
    key: 'extracted.mfaReauthDialog.verificationPanes.enterThe6DigitCodeFrom_a160dee6',
    consumers: ['dotnet', 'swift'],
  },
  {
    key: 'extracted.mfaReauthDialog.verificationPanes.resend_1f948437',
    consumers: ['dotnet', 'swift'],
  },
  {
    key: 'extracted.mfaReauthDialog.verificationPanes.sendCode_66a5b409',
    consumers: ['dotnet', 'swift'],
  },
  {
    key: 'extracted.mfaReauthDialog.verificationPanes.verify_eea2745e',
    consumers: ['dotnet', 'swift'],
  },
  {
    key: 'extracted.mfaReauthDialog.verificationPanes.verifying_2ec1ac7d',
    consumers: ['dotnet', 'swift'],
  },
  {
    key: 'extracted.mfaReauthDialog.verificationPanes.weLlSendAVerificationCode_fc0ed3b9',
    consumers: ['dotnet', 'swift'],
  },
  {
    key: 'extracted.my.emailManager.invalidOrExpiredVerificationCode_9b5b98fe',
    consumers: ['dotnet', 'swift'],
  },
  { key: 'extracted.my.mfaReauthDialog.reAuthenticate_3887afa4', consumers: ['dotnet', 'swift'] },
  {
    key: 'extracted.my.mfaReauthDialog.verifyYourIdentityToRemoveYour_e7d1fbdb',
    consumers: ['dotnet', 'swift'],
  },
  { key: 'extracted.my.passkeyManager.passkeys_c87ccdb4', consumers: ['dotnet', 'swift'] },
] as const satisfies readonly NativeConsumerManifestEntry[]
