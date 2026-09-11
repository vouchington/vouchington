export function normalizeInboundEmailMessageId(
  emailMessageId: string | null | undefined,
): string | null {
  return emailMessageId?.trim() || null
}

export function normalizeInboundEmailMessageIds(
  emailMessageIds: Array<string | null | undefined>,
): string[] {
  return [
    ...new Set(
      emailMessageIds.flatMap(id => {
        const normalized = normalizeInboundEmailMessageId(id)
        return normalized == null ? [] : [normalized]
      }),
    ),
  ]
}
