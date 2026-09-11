import { CardFields } from './type-attributes-card-fields'
import { RewardsStatusFields, TopicIdAttribute } from './type-attributes-fields'
import type { TopicIdField, TypeAttributeNames, TypeAttributes } from './topic-edit-model'

export function AttributeFields({
  currentTopicType,
  typeAttributes,
  getValue,
  names,
  setId,
  disabled,
  annualFeeError,
  onAnnualFeeChange,
}: {
  currentTopicType: string
  typeAttributes: TypeAttributes | null
  getValue: (field: TopicIdField) => string | null
  names: TypeAttributeNames
  setId: (field: TopicIdField) => (id: string) => void
  disabled: boolean
  annualFeeError: string | null
  onAnnualFeeChange: () => void
}) {
  if (currentTopicType === 'card') {
    return (
      <CardFields
        typeAttributes={typeAttributes}
        getValue={getValue}
        names={names}
        setId={setId}
        disabled={disabled}
        annualFeeError={annualFeeError}
        onAnnualFeeChange={onAnnualFeeChange}
      />
    )
  }
  if (currentTopicType === 'rewards_program') {
    return (
      <TopicIdAttribute
        fieldId='company_id'
        label='Company'
        value={getValue('company_id')}
        name={names.company_id}
        onChange={setId('company_id')}
        disabled={disabled}
      />
    )
  }
  if (currentTopicType === 'referral_program') {
    return (
      <>
        <TopicIdAttribute
          fieldId='company_id'
          label='Company'
          value={getValue('company_id')}
          name={names.company_id}
          onChange={setId('company_id')}
          disabled={disabled}
        />
        <TopicIdAttribute
          fieldId='rewards_program_id'
          label='Rewards Program'
          value={getValue('rewards_program_id')}
          name={names.rewards_program_id}
          onChange={setId('rewards_program_id')}
          disabled={disabled}
        />
      </>
    )
  }
  if (currentTopicType === 'rewards_program_status') {
    return (
      <RewardsStatusFields
        typeAttributes={typeAttributes}
        getValue={getValue}
        names={names}
        setId={setId}
        disabled={disabled}
      />
    )
  }
  return null
}
