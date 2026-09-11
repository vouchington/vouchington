import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { componentStoryRatchetParameters } from './component-story-ratchet-parameters'
import {
  ComponentStoryRatchetGrid,
  type RatchetedComponent,
} from './component-story-ratchet-renderer'
import { InternalCarouselPrevious as UiCarouselControlsInternalCarouselPrevious } from '@/components/ui/carousel/controls'
import {
  DialogClose as UiDialogDialogClose,
  DialogOverlay as UiDialogDialogOverlay,
  DialogPortal as UiDialogDialogPortal,
} from '@/components/ui/dialog'
import {
  SheetClose as UiSheetSheetClose,
  SheetOverlay as UiSheetSheetOverlay,
  SheetPortal as UiSheetSheetPortal,
} from '@/components/ui/sheet'
import {
  SidebarContent as UiSidebarLayoutSidebarContent,
  SidebarFooter as UiSidebarLayoutSidebarFooter,
  SidebarHeader as UiSidebarLayoutSidebarHeader,
  SidebarInput as UiSidebarLayoutSidebarInput,
  SidebarInset as UiSidebarLayoutSidebarInset,
  SidebarRail as UiSidebarLayoutSidebarRail,
  SidebarSeparator as UiSidebarLayoutSidebarSeparator,
  SidebarTrigger as UiSidebarLayoutSidebarTrigger,
} from '@/components/ui/sidebar/layout'
import { Sidebar as UiSidebarShellSidebar } from '@/components/ui/sidebar/shell'
import { RelationManagementAction as UsersRelationManagementActionRelationManagementAction } from '@/components/users/relation-management-action'

const ratchetedComponentsPart15 = [
  {
    key: 'web/components/ui/carousel/controls.tsx#InternalCarouselPrevious',
    component: UiCarouselControlsInternalCarouselPrevious,
  },
  { key: 'web/components/ui/dialog.tsx#DialogClose', component: UiDialogDialogClose },
  { key: 'web/components/ui/dialog.tsx#DialogOverlay', component: UiDialogDialogOverlay },
  { key: 'web/components/ui/dialog.tsx#DialogPortal', component: UiDialogDialogPortal },
  { key: 'web/components/ui/sheet.tsx#SheetClose', component: UiSheetSheetClose },
  { key: 'web/components/ui/sheet.tsx#SheetOverlay', component: UiSheetSheetOverlay },
  { key: 'web/components/ui/sheet.tsx#SheetPortal', component: UiSheetSheetPortal },
  {
    key: 'web/components/ui/sidebar/layout.tsx#SidebarContent',
    component: UiSidebarLayoutSidebarContent,
  },
  {
    key: 'web/components/ui/sidebar/layout.tsx#SidebarFooter',
    component: UiSidebarLayoutSidebarFooter,
  },
  {
    key: 'web/components/ui/sidebar/layout.tsx#SidebarHeader',
    component: UiSidebarLayoutSidebarHeader,
  },
  {
    key: 'web/components/ui/sidebar/layout.tsx#SidebarInput',
    component: UiSidebarLayoutSidebarInput,
    props: { 'aria-label': 'Search navigation' },
  },
  {
    key: 'web/components/ui/sidebar/layout.tsx#SidebarInset',
    component: UiSidebarLayoutSidebarInset,
  },
  {
    key: 'web/components/ui/sidebar/layout.tsx#SidebarRail',
    component: UiSidebarLayoutSidebarRail,
  },
  {
    key: 'web/components/ui/sidebar/layout.tsx#SidebarSeparator',
    component: UiSidebarLayoutSidebarSeparator,
  },
  {
    key: 'web/components/ui/sidebar/layout.tsx#SidebarTrigger',
    component: UiSidebarLayoutSidebarTrigger,
  },
  { key: 'web/components/ui/sidebar/shell.tsx#Sidebar', component: UiSidebarShellSidebar },
  {
    key: 'web/components/users/relation-management-action.tsx#RelationManagementAction',
    component: UsersRelationManagementActionRelationManagementAction,
  },
] satisfies RatchetedComponent[]

const meta = {
  title: 'Coverage/Component Story Ratchet Part 15',
} satisfies Meta

export default meta
type Story = StoryObj<typeof meta>

export const CoveragePart15: Story = {
  parameters: componentStoryRatchetParameters,
  render: () => (
    <ComponentStoryRatchetGrid
      title='Component Story Ratchet Part 15'
      components={ratchetedComponentsPart15}
    />
  ),
}
