import { Link, createFileRoute } from '@tanstack/react-router'
import { FormEvent, useEffect, useMemo, useState } from 'react'

import { SignInPrompt } from '../components/AuthPrompts'
import { hashPasswordWithAlias, normalizeAlias } from '../lib/auth-utils'
import { useAuth } from '../state/AuthContext'
import { useLogoLibrary, type LogoEntry } from '../state/LogoLibraryContext'

type MessageState = { tone: 'success' | 'error' | 'info'; text: string } | null

interface AllowedUserUpdatePayload {
  name?: string
  passwordHash?: string | null
}

export const Route = createFileRoute('/account')({
  component: AccountPage,
})

function AccountPage() {
  const { user, isAuthenticated, refreshRoster } = useAuth()
  const { getLogosOwnedBy, getLogosSubmittedBy } = useLogoLibrary()

  const [nameInput, setNameInput] = useState('')
  const [profileStatus, setProfileStatus] = useState<MessageState>(null)
  const [passwordStatus, setPasswordStatus] = useState<MessageState>(null)
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [profileSaving, setProfileSaving] = useState(false)
  const [passwordSaving, setPasswordSaving] = useState(false)
  const [removingPassword, setRemovingPassword] = useState(false)

  useEffect(() => {
    setNameInput(user?.name ?? '')
  }, [user?.name])

  const submittedLogos = useMemo(() => {
    if (!user) return []
    return getLogosSubmittedBy(user.email)
  }, [getLogosSubmittedBy, user])

  const ownedLogos = useMemo(() => {
    if (!user) return []
    const alias = normalizeAlias(user.alias)
    if (!alias) return []
    return getLogosOwnedBy(alias)
  }, [getLogosOwnedBy, user])

  if (!isAuthenticated || !user) {
    return (
      <SignInPrompt
        heading="Sign in to manage your account"
        description="Enter your alias to change your display name, manage your password, and review the logos tied to you."
      />
    )
  }

  const aliasChipClass =
    'rounded-full border border-white/10 bg-white/5 px-4 py-2 text-xs uppercase tracking-[0.3em] text-white/60'

  const buttonClass =
    'rounded-full bg-cyan-400 px-6 py-2 text-sm font-semibold text-slate-900 transition hover:bg-cyan-300 disabled:cursor-not-allowed disabled:opacity-70'

  const secondaryButtonClass =
    'rounded-full border border-white/20 px-6 py-2 text-sm font-semibold text-white transition hover:border-cyan-300 hover:text-cyan-200 disabled:cursor-wait'

  const helperTextClass = 'text-xs text-white/50'

  const resetPasswordForms = () => {
    setNewPassword('')
    setConfirmPassword('')
  }

  const updateRoster = async (payload: AllowedUserUpdatePayload) => {
    const response = await fetch('/api/allowed-users', {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ alias: user.alias, ...payload }),
    })

    if (!response.ok) {
      let message = 'We could not save your changes. Try again in a moment.'
      try {
        const data = (await response.json()) as { message?: string }
        if (typeof data.message === 'string') {
          message = data.message
        }
      } catch (error) {
        console.warn('Failed to parse roster update response', error)
      }
      throw new Error(message)
    }

    await refreshRoster()
  }

  const handleProfileSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const trimmed = nameInput.trim()

    if (!trimmed) {
      setProfileStatus({ tone: 'error', text: 'Display name cannot be empty.' })
      return
    }

    if (trimmed === user.name) {
      setProfileStatus({ tone: 'info', text: 'Your display name is already up to date.' })
      return
    }

    setProfileSaving(true)
    setProfileStatus(null)

    try {
      await updateRoster({ name: trimmed })
      setProfileStatus({ tone: 'success', text: 'Display name updated successfully.' })
    } catch (error) {
      setProfileStatus({ tone: 'error', text: (error as Error).message })
    } finally {
      setProfileSaving(false)
    }
  }

  const handlePasswordSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const trimmed = newPassword.trim()
    const confirmation = confirmPassword.trim()

    if (!trimmed) {
      setPasswordStatus({ tone: 'error', text: 'Enter a password before saving.' })
      return
    }

    if (trimmed.length < 6) {
      setPasswordStatus({ tone: 'error', text: 'Passwords need at least 6 characters.' })
      return
    }

    if (trimmed !== confirmation) {
      setPasswordStatus({ tone: 'error', text: 'Passwords do not match. Try again.' })
      return
    }

    setPasswordSaving(true)
    setPasswordStatus(null)

    try {
      const hash = await hashPasswordWithAlias(trimmed, user.alias)
      await updateRoster({ passwordHash: hash })
      setPasswordStatus({ tone: 'success', text: 'Password saved. You will be prompted for it next time you sign in.' })
      resetPasswordForms()
    } catch (error) {
      setPasswordStatus({ tone: 'error', text: (error as Error).message })
    } finally {
      setPasswordSaving(false)
    }
  }

  const handleRemovePassword = async () => {
    setRemovingPassword(true)
    setPasswordStatus(null)

    try {
      await updateRoster({ passwordHash: null })
      setPasswordStatus({ tone: 'info', text: 'Password removed. This alias will no longer prompt for one.' })
      resetPasswordForms()
    } catch (error) {
      setPasswordStatus({ tone: 'error', text: (error as Error).message })
    } finally {
      setRemovingPassword(false)
    }
  }

  const renderStatusBanner = (status: MessageState) => {
    if (!status) return null
    const baseClass =
      status.tone === 'success'
        ? 'border-emerald-300/40 bg-emerald-300/10 text-emerald-100'
        : status.tone === 'error'
          ? 'border-rose-400/40 bg-rose-400/10 text-rose-100'
          : 'border-cyan-300/40 bg-cyan-300/10 text-cyan-100'

    return (
      <div className={`rounded-3xl border px-4 py-3 text-sm ${baseClass}`}>
        {status.text}
      </div>
    )
  }

  const passwordStateChip = user.hasPassword
    ? 'Password required'
    : 'No password set'

  return (
    <div className="space-y-12 py-12">
      <header className="space-y-4">
        <p className="text-sm uppercase tracking-[0.3em] text-cyan-200/70">Account settings</p>
        <h1 className="text-4xl font-semibold text-white">Manage your CES3 identity</h1>
        <p className="text-white/70">
          Update how your name appears across the studio, adjust your sign-in password, and review the logos connected to you.
        </p>
        <div className="flex flex-wrap gap-2">
          <span className={aliasChipClass}>Alias: {user.alias}</span>
          <span className={aliasChipClass}>Role: {user.role === 'admin' ? 'Admin' : 'Member'}</span>
          <span className={aliasChipClass}>{passwordStateChip}</span>
        </div>
      </header>

      {renderStatusBanner(profileStatus)}

      <section className="grid gap-6 rounded-3xl border border-white/10 bg-white/5 p-8 backdrop-blur lg:grid-cols-[1fr_1fr]">
        <form onSubmit={handleProfileSubmit} className="space-y-4">
          <h2 className="text-2xl font-semibold text-white">Profile details</h2>
          <label className="flex flex-col gap-2 text-sm text-white/70">
            Display name
            <input
              type="text"
              value={nameInput}
              onChange={(event) => {
                setNameInput(event.target.value)
                if (profileStatus) setProfileStatus(null)
              }}
              className="rounded-full border border-white/15 bg-slate-900/70 px-4 py-3 text-white outline-none transition focus:border-cyan-300"
              placeholder="How teammates see your name"
            />
          </label>
          <div className="text-sm text-white/60">
            <p>Email: <span className="font-mono text-white/80">{user.email}</span></p>
            <p>Stored alias: <span className="font-mono text-white/80">{normalizeAlias(user.alias)}</span></p>
          </div>
          <button type="submit" className={buttonClass} disabled={profileSaving}>
            {profileSaving ? 'Saving…' : 'Save profile'}
          </button>
        </form>

        <form onSubmit={handlePasswordSubmit} className="space-y-4">
          <h2 className="text-2xl font-semibold text-white">Password (optional)</h2>
          <p className={helperTextClass}>
            Add a password if you want an extra confirmation when signing in. We hash it locally with your alias as the salt before storing it.
          </p>
          <label className="flex flex-col gap-2 text-sm text-white/70">
            New password
            <input
              type="password"
              value={newPassword}
              onChange={(event) => {
                setNewPassword(event.target.value)
                if (passwordStatus) setPasswordStatus(null)
              }}
              className="rounded-full border border-white/15 bg-slate-900/70 px-4 py-3 text-white outline-none transition focus:border-cyan-300"
              placeholder="Enter a new password"
            />
          </label>
          <label className="flex flex-col gap-2 text-sm text-white/70">
            Confirm password
            <input
              type="password"
              value={confirmPassword}
              onChange={(event) => {
                setConfirmPassword(event.target.value)
                if (passwordStatus) setPasswordStatus(null)
              }}
              className="rounded-full border border-white/15 bg-slate-900/70 px-4 py-3 text-white outline-none transition focus:border-cyan-300"
              placeholder="Re-enter it to confirm"
            />
          </label>
          <div className="flex flex-wrap gap-3">
            <button type="submit" className={buttonClass} disabled={passwordSaving}>
              {passwordSaving ? 'Securing…' : 'Save password'}
            </button>
            <button
              type="button"
              onClick={handleRemovePassword}
              className={secondaryButtonClass}
              disabled={removingPassword || !user.hasPassword}
            >
              {removingPassword ? 'Removing…' : 'Remove password'}
            </button>
          </div>
          {renderStatusBanner(passwordStatus)}
        </form>
      </section>

      <section className="space-y-6 rounded-3xl border border-white/10 bg-slate-900/60 p-8">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-2xl font-semibold text-white">Your logos at a glance</h2>
            <p className="text-sm text-white/60">
              Submitted: {submittedLogos.length} • Owned: {ownedLogos.length}
            </p>
          </div>
          <Link
            to="/my-logos"
            className="rounded-full border border-cyan-300/40 px-5 py-2 text-sm font-semibold text-cyan-100 transition hover:border-cyan-200 hover:text-cyan-50"
          >
            Go to My logos
          </Link>
        </div>

        <div className="grid gap-6 md:grid-cols-2">
          <LogoList heading="Submitted by you" emptyMessage="No submissions yet. Upload one from the My logos page." entries={submittedLogos} />
          <LogoList heading="Owned by you" emptyMessage="You don’t own any logos yet." entries={ownedLogos} />
        </div>
      </section>
    </div>
  )
}

interface LogoListProps {
  heading: string
  emptyMessage: string
  entries: LogoEntry[]
}

function LogoList({ heading, emptyMessage, entries }: LogoListProps) {
  if (!entries || entries.length === 0) {
    return (
      <div className="rounded-2xl border border-white/10 bg-white/5 p-6 text-sm text-white/60">
        {emptyMessage}
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <h3 className="text-lg font-semibold text-white">{heading}</h3>
      <div className="space-y-3">
        {entries.slice(0, 5).map((entry) => (
          <Link
            key={entry.id}
            to="/gallery/$logoId"
            params={{ logoId: entry.id }}
            className="flex items-center justify-between rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white/80 transition hover:border-cyan-300/60 hover:text-white"
          >
            <span className="font-semibold text-white">{entry.name}</span>
            <span className="text-xs uppercase tracking-[0.3em] text-white/40">{entry.codename}</span>
          </Link>
        ))}
        {entries.length > 5 && (
          <p className="text-xs uppercase tracking-[0.3em] text-white/40">
            + {entries.length - 5} more in the studio
          </p>
        )}
      </div>
    </div>
  )
}
