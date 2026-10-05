import type {
  CopyrightCounterNoticeGuidance,
  CopyrightLegalHoldGuidance,
} from '@/types/copyright-notices'
import { COPYRIGHT_AI_GUIDANCE_LABEL } from './copyright-staff-guidance-label'

type Props =
  | { kind: 'counter_notice'; guidance: CopyrightCounterNoticeGuidance }
  | { kind: 'court_or_ccb_hold'; guidance: CopyrightLegalHoldGuidance }

const COUNTER_ELEMENT_LABELS: Record<
  CopyrightCounterNoticeGuidance['elements'][number]['element'],
  string
> = {
  signature: 'Signature',
  material_identification: 'Identification of the material',
  has_good_faith_statement: 'Good-faith statement',
  contact_and_jurisdiction_consent: 'Contact details and jurisdiction consent',
}

const HOLD_CRITERION_LABELS: Record<
  CopyrightLegalHoldGuidance['criteria'][number]['criterion'],
  string
> = {
  is_from_original_claimant: 'From the original claimant',
  proceeding_kind: 'Type of proceeding',
  commenced_at: 'Proceeding commenced',
  received_by_designated_agent_at: 'Designated agent received proof',
  is_same_material: 'Same material',
}

const COUNTER_RISK_LABELS: Record<
  CopyrightCounterNoticeGuidance['risk_notes'][number]['kind'],
  string
> = {
  material_mismatch: 'Material mismatch',
  good_faith_concern: 'Good-faith concern',
  jurisdiction_consent_gap: 'Jurisdiction consent gap',
  abuse_signal: 'Abuse signal',
  other: 'Other concern',
}

const HOLD_RISK_LABELS: Record<CopyrightLegalHoldGuidance['risk_notes'][number]['kind'], string> = {
  claimant_mismatch: 'Claimant mismatch',
  proceeding_gap: 'Proceeding gap',
  timing_gap: 'Timing gap',
  material_mismatch: 'Material mismatch',
  other: 'Other concern',
}

/** A staff aid for reviewing a submission. Staff record the decision separately. */
export function CopyrightStaffSubmissionGuidance(props: Props) {
  const items =
    props.kind === 'counter_notice'
      ? props.guidance.elements.map(item => ({
          key: item.element,
          label: COUNTER_ELEMENT_LABELS[item.element],
          status: item.status,
          gap: item.gap,
        }))
      : props.guidance.criteria.map(item => ({
          key: item.criterion,
          label: HOLD_CRITERION_LABELS[item.criterion],
          status: item.status,
          gap: item.gap,
        }))
  const risks =
    props.kind === 'counter_notice'
      ? props.guidance.risk_notes.map(risk => ({
          key: `${risk.kind}:${risk.note}`,
          label: COUNTER_RISK_LABELS[risk.kind],
          note: risk.note,
        }))
      : props.guidance.risk_notes.map(risk => ({
          key: `${risk.kind}:${risk.note}`,
          label: HOLD_RISK_LABELS[risk.kind],
          note: risk.note,
        }))
  return (
    <section
      aria-label={COPYRIGHT_AI_GUIDANCE_LABEL}
      className='space-y-2 rounded border border-dashed p-3 text-sm'
    >
      <h4 className='font-medium'>{COPYRIGHT_AI_GUIDANCE_LABEL}</h4>
      <p>{props.guidance.summary}</p>
      <h5 className='font-medium'>Review checklist</h5>
      <ul className='space-y-1'>
        {items.map(item => (
          <li key={item.key}>
            {item.label}: {item.status}
            {item.gap ? `. ${item.gap}` : ''}
          </li>
        ))}
      </ul>
      {risks.length > 0 ? (
        <>
          <h5 className='font-medium'>Risk notes</h5>
          <ul className='space-y-1'>
            {risks.map(risk => (
              <li key={risk.key}>
                {risk.label}: {risk.note}
              </li>
            ))}
          </ul>
        </>
      ) : null}
    </section>
  )
}
