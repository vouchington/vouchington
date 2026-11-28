import { render, screen } from '@testing-library/react'
import React from 'react'
import type * as AvatarPrimitive from '@radix-ui/react-avatar'
import { describe, expect, it, vi } from 'vitest'

vi.mock(import('@radix-ui/react-avatar'), async () => {
  return {
    Root: function Root({
      children,
      ref,
      ...props
    }: React.ComponentPropsWithoutRef<typeof AvatarPrimitive.Root> & {
      ref?: React.Ref<React.ComponentRef<typeof AvatarPrimitive.Root>>
    }) {
      return (
        <span
          ref={ref}
          {...props}
        >
          {children}
        </span>
      )
    },
    Image: function Image({
      ref,
      ...props
    }: React.ComponentPropsWithoutRef<typeof AvatarPrimitive.Image> & {
      ref?: React.Ref<React.ComponentRef<typeof AvatarPrimitive.Image>>
    }) {
      return React.createElement('img', { alt: '', ...props, ref })
    },
    Fallback: function Fallback({
      children,
      ref,
      ...props
    }: React.ComponentPropsWithoutRef<typeof AvatarPrimitive.Fallback> & {
      ref?: React.Ref<React.ComponentRef<typeof AvatarPrimitive.Fallback>>
    }) {
      return (
        <span
          ref={ref}
          {...props}
        >
          {children}
        </span>
      )
    },
  } as unknown as typeof import('@radix-ui/react-avatar')
})

import { Alert, AlertDescription, AlertTitle } from '../alert'
import { Avatar, AvatarFallback, AvatarImage } from '../avatar'
import { Badge } from '../badge'
import { Button } from '../button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../card'
import { CheckboxCard } from '../checkbox-card'
import { Input } from '../input'
import { Kbd, KbdGroup } from '../kbd'
import { Label } from '../label'
import { Menubar, MenubarContent, MenubarItem, MenubarMenu, MenubarTrigger } from '../menubar'
import { Progress } from '../progress'
import { Separator } from '../separator'
import { Skeleton } from '../skeleton'
import { Spinner } from '../spinner'
import { Switch } from '../switch'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../tabs'
import { Textarea } from '../textarea'

describe('pure ui primitive data-pw contracts', () => {
  it('renders Button data-pw and forwards override props', () => {
    render(<Button data-pw='custom-button'>Save</Button>)
    expect(screen.getByRole('button', { name: 'Save' })).toHaveAttribute('data-pw', 'custom-button')
  })

  it('renders Badge data-pw', () => {
    const { container } = render(<Badge>Default</Badge>)
    expect(container.querySelector('[data-pw="badge"]')).not.toBeNull()
  })

  it('renders Alert parts with data-pw', () => {
    const { container } = render(
      <Alert>
        <AlertTitle>Heads up</AlertTitle>
        <AlertDescription>Details</AlertDescription>
      </Alert>,
    )
    expect(container.querySelector('[data-pw="alert"]')).not.toBeNull()
    expect(container.querySelector('[data-pw="alert-title"]')).not.toBeNull()
    expect(container.querySelector('[data-pw="alert-description"]')).not.toBeNull()
  })

  it('renders Card parts with data-pw', () => {
    const { container } = render(
      <Card>
        <CardHeader>
          <CardTitle>Title</CardTitle>
          <CardDescription>Description</CardDescription>
        </CardHeader>
        <CardContent>Content</CardContent>
      </Card>,
    )
    for (const id of ['card', 'card-header', 'card-title', 'card-description', 'card-content']) {
      expect(container.querySelector(`[data-pw="${id}"]`)).not.toBeNull()
    }
  })

  it('renders Kbd and KbdGroup data-pw', () => {
    const { container } = render(
      <KbdGroup>
        <Kbd>⌘</Kbd>
        <Kbd>K</Kbd>
      </KbdGroup>,
    )
    expect(container.querySelector('[data-pw="kbd-group"]')).not.toBeNull()
    expect(container.querySelectorAll('[data-pw="kbd"]')).toHaveLength(2)
  })

  it('renders Spinner data-pw and the status label', () => {
    const { container } = render(
      <>
        <Spinner />
        <Spinner />
        <Spinner aria-hidden />
      </>,
    )
    const [status, sized] = screen.getAllByRole('status', { name: 'Loading' })
    const decorative = container.querySelectorAll('[data-pw="spinner"]')

    expect(status).toHaveAttribute('data-pw', 'spinner')
    expect(sized).toHaveAttribute('data-pw', 'spinner')
    expect(decorative).toHaveLength(3)
    expect(decorative[2]).toHaveAttribute('aria-hidden', 'true')
    expect(screen.getAllByRole('status')).toHaveLength(2)
  })

  it('renders Progress value and data-pw', () => {
    render(
      <>
        <Progress
          value={40}
          aria-label='Upload'
        />
        <Progress
          value={0}
          aria-label='Empty'
        />
      </>,
    )
    const upload = screen.getByRole('progressbar', { name: 'Upload' })
    const empty = screen.getByRole('progressbar', { name: 'Empty' })

    expect(upload).toHaveAttribute('data-pw', 'progress')
    expect(upload).toHaveAttribute('aria-valuenow', '40')
    expect(upload.querySelector('[data-slot="progress-indicator"]')).toHaveStyle({
      transform: 'translateX(-60%)',
    })
    expect(empty).toHaveAttribute('aria-valuenow', '0')
  })

  it('keeps Progress indeterminate without a value and fills to max', () => {
    render(
      <>
        <Progress aria-label='Unknown' />
        <Progress
          value={null}
          aria-label='Waiting'
        />
        <Progress
          value={50}
          max={50}
          aria-label='Done'
        />
      </>,
    )
    const unknown = screen.getByRole('progressbar', { name: 'Unknown' })
    const waiting = screen.getByRole('progressbar', { name: 'Waiting' })
    const done = screen.getByRole('progressbar', { name: 'Done' })

    expect(unknown).not.toHaveAttribute('aria-valuenow')
    expect(unknown).toHaveAttribute('data-state', 'indeterminate')
    expect(waiting).not.toHaveAttribute('aria-valuenow')
    expect(done).toHaveAttribute('aria-valuenow', '50')
    expect(done).toHaveAttribute('aria-valuemax', '50')
    expect(done.querySelector('[data-slot="progress-indicator"]')).toHaveStyle({
      transform: 'translateX(0%)',
    })
  })

  it('renders Input and Skeleton data-pw', () => {
    const { container } = render(
      <>
        <Input aria-label='Email' />
        <Skeleton />
      </>,
    )
    expect(screen.getByLabelText('Email')).toHaveAttribute('data-pw', 'input')
    expect(container.querySelector('[data-pw="skeleton"]')).not.toBeNull()
  })

  it('renders Textarea, Switch, Label, Separator, and CheckboxCard data-pw', () => {
    const { container } = render(
      <>
        <Label htmlFor='textarea'>Textarea</Label>
        <Textarea
          id='textarea'
          aria-label='Textarea'
        />
        <Switch aria-label='Enabled' />
        <Separator />
        <CheckboxCard
          id='checkbox-card'
          checked={false}
          onCheckedChange={() => undefined}
          label='Checkbox card'
        />
      </>,
    )

    for (const id of ['label', 'textarea', 'switch', 'separator', 'checkbox-card']) {
      expect(container.querySelector(`[data-pw="${id}"]`)).not.toBeNull()
    }
  })

  it('renders Tabs and Avatar primitive data-pw hooks', () => {
    const { container } = render(
      <>
        <Tabs defaultValue='one'>
          <TabsList>
            <TabsTrigger value='one'>One</TabsTrigger>
          </TabsList>
          <TabsContent value='one'>Content</TabsContent>
        </Tabs>
        <Avatar>
          <AvatarImage
            src='https://example.com/avatar.png'
            alt='Example'
          />
          <AvatarFallback>EX</AvatarFallback>
        </Avatar>
      </>,
    )

    for (const id of [
      'tabs-list',
      'tabs-trigger',
      'tabs-content',
      'avatar',
      'avatar-image',
      'avatar-fallback',
    ]) {
      expect(container.querySelector(`[data-pw="${id}"]`)).not.toBeNull()
    }
  })

  it('renders Menubar primitive data-pw hooks', () => {
    const { container } = render(
      <Menubar value='tags'>
        <MenubarMenu value='tags'>
          <MenubarTrigger>Manage Tags</MenubarTrigger>
          <MenubarContent forceMount>
            <MenubarItem>Category Topics</MenubarItem>
          </MenubarContent>
        </MenubarMenu>
      </Menubar>,
    )

    for (const id of ['menubar', 'menubar-trigger']) {
      expect(container.querySelector(`[data-pw="${id}"]`)).not.toBeNull()
    }
  })
})
