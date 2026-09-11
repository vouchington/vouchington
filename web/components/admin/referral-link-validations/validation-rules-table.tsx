'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { AdminTableShell } from '@/components/admin/admin-table-shell'
import {
  deleteReferralLinkValidationRule,
  type ReferralLinkValidationRule,
} from '@/lib/api/client/referral-link-validations'
import onError, { onSuccess } from '@/lib/on-error'
import { ValidationRuleForm } from './validation-rule-form'
import { ValidationRuleRow } from './validation-rule-row'
import { useTranslations } from '@/lib/i18n/use-translations'

const VALIDATION_RULES_TABLE_COLUMNS = [
  ['hostname', 'extracted.referralLinkValidations.validationRulesTable.hostname_2db53355'],
  ['pathname', 'extracted.referralLinkValidations.validationRulesTable.pathname_d253dde0'],
  ['type', 'extracted.referralLinkValidations.validationRulesTable.type_baaddf70'],
  ['errorText', 'extracted.referralLinkValidations.validationRulesTable.errorText_5a5f7659'],
  ['exampleUrls', 'extracted.referralLinkValidations.validationRulesTable.exampleUrls_d31bbd04'],
  ['actions', 'extracted.referralLinkValidations.validationRulesTable.actions_ff8059dc'],
] as const

interface ValidationRulesTableProps {
  validationId: string
  initialRules: ReferralLinkValidationRule[]
}

export function ValidationRulesTable({ validationId, initialRules }: ValidationRulesTableProps) {
  const t = useTranslations()
  const [rules, setRules] = useState(initialRules)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [showAddForm, setShowAddForm] = useState(false)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null)

  async function confirmDelete() {
    if (!pendingDeleteId) return
    const ruleId = pendingDeleteId
    setPendingDeleteId(null)
    setDeletingId(ruleId)
    try {
      await deleteReferralLinkValidationRule(validationId, ruleId)
      setRules(prev => prev.filter(r => r.id !== ruleId))
      onSuccess(t('extracted.referralLinkValidations.validationRulesTable.ruleDeleted_92e561e3'))
    } catch (error) {
      onError(error, {
        fallback: t(
          'extracted.referralLinkValidations.validationRulesTable.failedToDeleteRule_eae0494c',
        ),
      })
    } finally {
      setDeletingId(null)
    }
  }

  function handleRuleUpdated(updated: ReferralLinkValidationRule) {
    setRules(prev => prev.map(r => (r.id === updated.id ? updated : r)))
    setEditingId(null)
  }

  function handleRuleCreated(rule: ReferralLinkValidationRule) {
    setRules(prev => [...prev, rule])
    setShowAddForm(false)
  }

  return (
    <div className='space-y-4'>
      <div className='flex items-center justify-between'>
        <h2
          className='text-lg font-semibold'
          data-pw='validation-rules-heading'
        >
          {t('extracted.referralLinkValidations.validationRulesTable.rules_4228aeb0')}
        </h2>
        <Button
          size='sm'
          onClick={() => setShowAddForm(v => !v)}
          data-pw='validation-rules-add-button'
        >
          {showAddForm
            ? t('extracted.referralLinkValidations.validationRulesTable.cancel_19766ed6')
            : t('extracted.referralLinkValidations.validationRulesTable.addRule_968c3cb8')}
        </Button>
      </div>
      {showAddForm && (
        <div className='rounded-md border p-4'>
          <ValidationRuleForm
            validationId={validationId}
            onSaved={handleRuleCreated}
            onCancel={() => setShowAddForm(false)}
          />
        </div>
      )}
      <AdminTableShell
        aria-label={t('extracted.referralLinkValidations.validationRulesTable.rules_4228aeb0')}
        isEmpty={rules.length === 0}
        emptyMessage={t(
          'extracted.referralLinkValidations.validationRulesTable.noRulesYetAddOneAbove_7ee684a8',
        )}
      >
        <table
          className='min-w-full divide-y divide-border'
          data-pw='validation-rules-table'
        >
          <thead className='bg-muted/50'>
            <tr>
              {VALIDATION_RULES_TABLE_COLUMNS.map(([col, messageKey]) => (
                <th
                  key={col}
                  scope='col'
                  className='px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-muted-foreground'
                >
                  {t(messageKey)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className='divide-y divide-border bg-card'>
            {rules.map(rule => (
              <ValidationRuleRow
                key={rule.id}
                rule={rule}
                validationId={validationId}
                isEditing={editingId === rule.id}
                isDeleting={deletingId === rule.id}
                onEdit={() => setEditingId(rule.id)}
                onSaved={handleRuleUpdated}
                onCancelEdit={() => setEditingId(null)}
                onDeleteRequest={() => setPendingDeleteId(rule.id)}
              />
            ))}
          </tbody>
        </table>
      </AdminTableShell>
      <AlertDialog
        open={pendingDeleteId !== null}
        onOpenChange={(open: boolean) => !open && setPendingDeleteId(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {t('extracted.referralLinkValidations.validationRulesTable.deleteRule_369c63a8')}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {t(
                'extracted.referralLinkValidations.validationRulesTable.deleteRuleDescription_7391f319',
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>
              {t('extracted.referralLinkValidations.validationRulesTable.cancel_19766ed6')}
            </AlertDialogCancel>
            <AlertDialogAction onClick={confirmDelete}>
              {t('extracted.referralLinkValidations.validationRulesTable.delete_e2d0a549')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
