import type {
  ProcessSendCommunityInviteEmailVariables,
  ProcessSendEmailAddressLoginTokenVariables,
  ProcessSendEmailVerificationTokenVariables,
  ProcessSendWelcomeEmailVariables,
  ProcessSendDataExportReadyEmailVariables,
  ProcessSendCommunityApplicationDecisionEmailVariables,
  ProcessSendCommunityRoleChangeEmailVariables,
  ProcessSendCommunityOwnershipTransferEmailVariables,
} from '../types.mts'

export const inviteVariableKeys = {
  communityName: true,
  inviterName: true,
  code: true,
  uiLocale: true,
} as const satisfies Record<keyof ProcessSendCommunityInviteEmailVariables, true>

export const loginVariableKeys = {
  token: true,
  expiration: true,
  uiLocale: true,
} as const satisfies Record<keyof ProcessSendEmailAddressLoginTokenVariables, true>

export const verificationVariableKeys = {
  token: true,
  uiLocale: true,
} as const satisfies Record<keyof ProcessSendEmailVerificationTokenVariables, true>

export const welcomeVariableKeys = {
  userName: true,
  uiLocale: true,
} as const satisfies Record<keyof ProcessSendWelcomeEmailVariables, true>

export const dataExportVariableKeys = {
  requestId: true,
} as const satisfies Record<keyof ProcessSendDataExportReadyEmailVariables, true>

export const applicationVariableKeys = {
  communityName: true,
  communityUrl: true,
  rejectionReason: true,
  status: true,
  uiLocale: true,
} as const satisfies Record<keyof ProcessSendCommunityApplicationDecisionEmailVariables, true>

export const roleVariableKeys = {
  communityName: true,
  communityUrl: true,
  newRole: true,
  direction: true,
  uiLocale: true,
} as const satisfies Record<keyof ProcessSendCommunityRoleChangeEmailVariables, true>

export const ownershipVariableKeys = {
  communityName: true,
  communityUrl: true,
  recipientRole: true,
  uiLocale: true,
} as const satisfies Record<keyof ProcessSendCommunityOwnershipTransferEmailVariables, true>
