import { useState } from 'react'
import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { ValidationRuleForm } from '@/components/admin/referral-link-validations/validation-rule-form'
import { ValidationRulesTable } from '@/components/admin/referral-link-validations/validation-rules-table'
import {
  RuleTypeSelect,
  type RuleType,
} from '@/components/admin/referral-link-validations/rule-type-select'
import { ValidationRuleRow } from '@/components/admin/referral-link-validations/validation-rule-row'
import type { ReferralLinkValidationRule } from '@/lib/api/client/referral-link-validations'

const meta = {
  title: 'Design System/Components/Admin Referral Link Validations',
} satisfies Meta

export default meta
type Story = StoryObj<typeof meta>

const sampleRule: ReferralLinkValidationRule = {
  id: 'rule-001',
  referral_program_link_validation_id: 'validation-001',
  hostname: 'refer.chase.com',
  pathname: '/refer/%',
  is_referral_link_url: true,
  is_invalid_referral_link_url: false,
  user_error_text: null,
  example_urls: ['https://refer.chase.com/refer?ref=abc123'],
}

export const AddRule: Story = {
  render: () => <ValidationRuleForm validationId='validation-001' />,
}

export const EditRule: Story = {
  render: () => (
    <ValidationRuleForm
      validationId='validation-001'
      existing={sampleRule}
    />
  ),
}

export const RulesTable: Story = {
  render: () => (
    <ValidationRulesTable
      validationId='validation-001'
      initialRules={[sampleRule]}
    />
  ),
}

export const EmptyRulesTable: Story = {
  render: () => (
    <ValidationRulesTable
      validationId='validation-001'
      initialRules={[]}
    />
  ),
}

function RuleTypeSelectStandalone() {
  const [value, setValue] = useState<RuleType>('valid')
  return (
    <RuleTypeSelect
      value={value}
      onValueChange={setValue}
    />
  )
}

export const RuleTypeSelectField: Story = {
  render: () => <RuleTypeSelectStandalone />,
}

export const RuleRow: Story = {
  render: () => (
    <table>
      <tbody>
        <ValidationRuleRow
          rule={sampleRule}
          validationId='validation-001'
          isEditing={false}
          isDeleting={false}
          onEdit={() => {}}
          onSaved={() => {}}
          onCancelEdit={() => {}}
          onDeleteRequest={() => {}}
        />
      </tbody>
    </table>
  ),
}

export const RuleRowEditing: Story = {
  render: () => (
    <table>
      <tbody>
        <ValidationRuleRow
          rule={sampleRule}
          validationId='validation-001'
          isEditing
          isDeleting={false}
          onEdit={() => {}}
          onSaved={() => {}}
          onCancelEdit={() => {}}
          onDeleteRequest={() => {}}
        />
      </tbody>
    </table>
  ),
}
