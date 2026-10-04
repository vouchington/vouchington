import type { CopyrightFormGuidance } from '@/types/copyright-notices'
import { COPYRIGHT_AI_GUIDANCE_LABEL } from './copyright-staff-guidance-label'

const ELEMENT_LABELS: Record<CopyrightFormGuidance['elements'][number]['element'], string> = {
  signature: 'Signature',
  work_identification: 'Identification of the work',
  material_identification: 'Identification of the material',
  contact_information: 'Contact information',
  good_faith_statement: 'Good-faith statement',
  accuracy_authority_statement: 'Accuracy and authority statement',
}

const RISK_LABELS: Record<CopyrightFormGuidance['risk_notes'][number]['kind'], string> = {
  possible_fair_use: 'Possible fair use',
  abuse_signal: 'Abuse signal',
  mismatched_claimant: 'Mismatched claimant',
}

const ACTION_LABELS: Record<CopyrightFormGuidance['suggested_action'], string> = {
  approve_intake: 'Approve intake',
  request_information: 'Request information',
  reject_intake: 'Reject intake',
  escalate_to_counsel: 'Escalate to counsel',
}

/** Advisory form guidance. It informs the moderator's review and never records a decision. */
export function CopyrightStaffFormGuidance({ guidance }: { guidance: CopyrightFormGuidance }) {
  return (
    <section
      aria-label={COPYRIGHT_AI_GUIDANCE_LABEL}
      className='space-y-2 rounded border border-dashed p-3 text-sm'
    >
      <h4 className='font-medium'>{COPYRIGHT_AI_GUIDANCE_LABEL}</h4>
      <p>{guidance.summary}</p>
      <ul className='space-y-1'>
        {guidance.elements.map(item => (
          <li key={item.element}>
            {ELEMENT_LABELS[item.element]}: {item.status}
            {item.gap ? ` — ${item.gap}` : ''}
          </li>
        ))}
      </ul>
      {guidance.risk_notes.length > 0 ? (
        <ul className='space-y-1'>
          {guidance.risk_notes.map(risk => (
            <li key={`${risk.kind}:${risk.note}`}>
              {RISK_LABELS[risk.kind]}: {risk.note}
            </li>
          ))}
        </ul>
      ) : null}
      <p className='text-muted-foreground'>
        Advisory suggestion: {ACTION_LABELS[guidance.suggested_action]}
      </p>
    </section>
  )
}
