export type CopyrightEmailApprovalTarget = {
  id: string
  post_id: string
  image_id: string
  target_url: string
}

export type CopyrightEmailApprovalDraft = {
  jurisdiction: 'us_dmca'
  claimant_display_name: string
  claimant_contact: string
  claimant_email: string
  work_description: string
  good_faith_belief: boolean
  accuracy_authority_under_penalty_of_perjury: boolean
  electronic_signature: string
  targets: CopyrightEmailApprovalTarget[]
}

function blankTarget(target_url = ''): CopyrightEmailApprovalTarget {
  return { id: crypto.randomUUID(), post_id: '', image_id: '', target_url }
}

export function createCopyrightEmailApprovalDraft(
  output: Record<string, unknown> | undefined,
): CopyrightEmailApprovalDraft {
  const targetUrls = Array.isArray(output?.target_urls)
    ? output.target_urls.filter((value): value is string => typeof value === 'string')
    : []
  return {
    jurisdiction: 'us_dmca',
    claimant_display_name: stringValue(output?.claimant_name),
    claimant_contact: stringValue(output?.claimant_contact),
    claimant_email: stringValue(output?.claimant_email),
    work_description: stringValue(output?.work_description),
    good_faith_belief: output?.good_faith_belief === true,
    accuracy_authority_under_penalty_of_perjury:
      output?.accuracy_authority_under_penalty_of_perjury === true,
    electronic_signature: stringValue(output?.electronic_signature),
    targets: (targetUrls.length > 0 ? targetUrls : ['']).map(blankTarget),
  }
}

export function addCopyrightEmailApprovalTarget(
  draft: CopyrightEmailApprovalDraft,
): CopyrightEmailApprovalDraft {
  return { ...draft, targets: [...draft.targets, blankTarget()] }
}

export function isCompleteCopyrightEmailApprovalDraft(draft: CopyrightEmailApprovalDraft): boolean {
  return Boolean(
    draft.claimant_contact.trim() &&
    draft.claimant_email.trim() &&
    draft.work_description.trim() &&
    draft.electronic_signature.trim() &&
    draft.good_faith_belief &&
    draft.accuracy_authority_under_penalty_of_perjury &&
    draft.targets.length > 0 &&
    draft.targets.every(
      target => target.post_id.trim() && target.image_id.trim() && target.target_url.trim(),
    ),
  )
}

export function toCopyrightEmailApprovalInput(draft: CopyrightEmailApprovalDraft) {
  return { ...draft, targets: draft.targets.map(({ id: _id, ...target }) => target) }
}

function stringValue(value: unknown): string {
  return typeof value === 'string' ? value : ''
}
