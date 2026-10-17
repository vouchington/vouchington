export const NOTIFICATION_ID_PARAMETER = {
  type: 'string',
  format: 'uuid',
}

export const NOTIFICATION_ID_PARAMETERS = {
  type: 'object',
  properties: { notification_id: NOTIFICATION_ID_PARAMETER },
  required: ['notification_id'],
  additionalProperties: false,
}

export type NotificationToolArgs = { notification_id: string }
