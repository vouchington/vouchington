import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { componentStoryRatchetParameters } from './component-story-ratchet-parameters'
import {
  ComponentStoryRatchetGrid,
  type RatchetedComponent,
} from './component-story-ratchet-renderer'
import { UserModNotesCell as ModerationUserModNotesCellUserModNotesCell } from '@/components/moderation/user-mod-notes-cell'
import { UserModNotesPanel as ModerationUserModNotesPanelUserModNotesPanel } from '@/components/moderation/user-mod-notes-panel'
import { ApiKeysManager as MyApiKeysManagerApiKeysManager } from '@/components/my/api-keys-manager'
import { AddCardForm as MyCardsManagerAddCardFormAddCardForm } from '@/components/my/cards-manager/add-card-form'
import { CardEditFormView as MyCardsManagerCardEditFormCardEditFormView } from '@/components/my/cards-manager/card-edit-form'
import { CardDisplayRow as MyCardsManagerCardRowCardDisplayRow } from '@/components/my/cards-manager/card-row'
import { IdentityDisplayNameSourceSection as MyIdentityDisplayNameSourceSectionIdentityDisplayNameSourceSection } from '@/components/my/identity-display-name-source-section'
import { IdentityForm as MyIdentityFormIdentityForm } from '@/components/my/identity-form'
import { IdentityProfileImageSection as MyIdentityProfileImageSectionIdentityProfileImageSection } from '@/components/my/identity-profile-image-section'
import { ImportExportManager as MyImportExportImportExportManagerImportExportManager } from '@/components/my/import-export/import-export-manager'
import { ImportProgressBar as MyImportExportImportProgressBarImportProgressBar } from '@/components/my/import-export/import-progress-bar'
import { SourceFileInput as MyImportExportSourceFileInputSourceFileInput } from '@/components/my/import-export/source-file-input'
import { LandingPageEditor as MyLandingPageEditorLandingPageEditor } from '@/components/my/landing-page-editor'
import { LandingPagesIndex as MyLandingPagesIndexLandingPagesIndex } from '@/components/my/landing-pages-index'
import { LandingPagesUsernameRequired as MyLandingPagesManagerSectionsLandingPagesUsernameRequired } from '@/components/my/landing-pages-manager-sections'
import { AddTypeSelect as MyLandingPagesManagerItemPickerAddTypeAddTypeSelect } from '@/components/my/landing-pages-manager/item-picker-add-type'

const ratchetedComponentsPart6 = [
  {
    key: 'web/components/moderation/user-mod-notes-cell.tsx#UserModNotesCell',
    component: ModerationUserModNotesCellUserModNotesCell,
  },
  {
    key: 'web/components/moderation/user-mod-notes-panel.tsx#UserModNotesPanel',
    component: ModerationUserModNotesPanelUserModNotesPanel,
  },
  {
    key: 'web/components/my/api-keys-manager.tsx#ApiKeysManager',
    component: MyApiKeysManagerApiKeysManager,
  },
  {
    key: 'web/components/my/cards-manager/add-card-form.tsx#AddCardForm',
    component: MyCardsManagerAddCardFormAddCardForm,
  },
  {
    key: 'web/components/my/cards-manager/card-edit-form.tsx#CardEditFormView',
    component: MyCardsManagerCardEditFormCardEditFormView,
  },
  {
    key: 'web/components/my/cards-manager/card-row.tsx#CardDisplayRow',
    component: MyCardsManagerCardRowCardDisplayRow,
  },
  {
    key: 'web/components/my/identity-display-name-source-section.tsx#IdentityDisplayNameSourceSection',
    component: MyIdentityDisplayNameSourceSectionIdentityDisplayNameSourceSection,
  },
  {
    key: 'web/components/my/identity-form.tsx#IdentityForm',
    component: MyIdentityFormIdentityForm,
  },
  {
    key: 'web/components/my/identity-profile-image-section.tsx#IdentityProfileImageSection',
    component: MyIdentityProfileImageSectionIdentityProfileImageSection,
  },
  {
    key: 'web/components/my/import-export/import-export-manager.tsx#ImportExportManager',
    component: MyImportExportImportExportManagerImportExportManager,
    props: { feedType: 'topics' },
  },
  {
    key: 'web/components/my/import-export/import-progress-bar.tsx#ImportProgressBar',
    component: MyImportExportImportProgressBarImportProgressBar,
  },
  {
    key: 'web/components/my/import-export/source-file-input.tsx#SourceFileInput',
    component: MyImportExportSourceFileInputSourceFileInput,
  },
  {
    key: 'web/components/my/landing-page-editor.tsx#LandingPageEditor',
    component: MyLandingPageEditorLandingPageEditor,
  },
  {
    key: 'web/components/my/landing-pages-index.tsx#LandingPagesIndex',
    component: MyLandingPagesIndexLandingPagesIndex,
  },
  {
    key: 'web/components/my/landing-pages-manager-sections.tsx#LandingPagesUsernameRequired',
    component: MyLandingPagesManagerSectionsLandingPagesUsernameRequired,
  },
  {
    key: 'web/components/my/landing-pages-manager/item-picker-add-type.tsx#AddTypeSelect',
    component: MyLandingPagesManagerItemPickerAddTypeAddTypeSelect,
  },
] satisfies RatchetedComponent[]

const meta = {
  title: 'Coverage/Component Story Ratchet Part 6',
} satisfies Meta

export default meta
type Story = StoryObj<typeof meta>

export const CoveragePart6: Story = {
  parameters: componentStoryRatchetParameters,
  render: () => (
    <ComponentStoryRatchetGrid
      title='Component Story Ratchet Part 6'
      components={ratchetedComponentsPart6}
    />
  ),
}
