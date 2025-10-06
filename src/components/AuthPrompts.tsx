import { useMemo, useState, type FormEvent } from 'react'

import { useAuth } from '../state/AuthContext'

type AuthPanelVariant = 'card' | 'inline'

interface SignInPanelProps {
  variant?: AuthPanelVariant
  heading?: string
  description?: string
  onSuccess?: () => void
}

function createErrorMessage(reason: ReturnType<typeof useAuth>['deniedReason']) {
  switch (reason) {
    case 'alias-not-found':
      return 'We could not find that alias in the CES3 roster.'
    case 'password-invalid':
      return 'That password does not match what we have on file for this alias.'
    case 'network-error':
      return 'We could not reach the roster service. Try again in a moment.'
    default:
      return null
  }
}

export function SignInPrompt({
  variant = 'card',
  heading = 'Sign in to continue',
  description = 'Enter your CES3 alias to unlock the studio. Some aliases are protected with a password for extra security.',
  onSuccess,
}: SignInPanelProps) {
  const {
    loginWithAlias,
    deniedReason,
    clearDeniedReason,
    loading,
    user,
    isAuthenticated,
  } = useAuth()

  const [alias, setAlias] = useState('')
  const [password, setPassword] = useState('')
  const [phase, setPhase] = useState<'alias' | 'password'>('alias')
  const [pendingAlias, setPendingAlias] = useState<string | null>(null)
  const [lastAttempt, setLastAttempt] = useState<'alias' | 'password' | null>(null)

  const aliasDisabled = loading && lastAttempt === 'alias'
  const passwordDisabled = loading && lastAttempt === 'password'

  const aliasError = useMemo(() => {
    if (!deniedReason) return null
    if (deniedReason === 'alias-not-found') {
      return createErrorMessage(deniedReason)
    }
    if (deniedReason === 'network-error' && lastAttempt === 'alias') {
      return createErrorMessage(deniedReason)
    }
    return null
  }, [deniedReason, lastAttempt])

  const passwordNotice = useMemo(() => {
    if (!deniedReason) return null
    if (deniedReason === 'password-required') {
      return {
        tone: 'info' as const,
        message: 'This alias uses a password. Enter it to finish signing in.',
      }
    }
    if (deniedReason === 'password-invalid') {
      return {
        tone: 'error' as const,
        message: createErrorMessage(deniedReason),
      }
    }
    if (deniedReason === 'network-error' && lastAttempt === 'password') {
      return {
        tone: 'error' as const,
        message: createErrorMessage(deniedReason),
      }
    }
    return null
  }, [deniedReason, lastAttempt])

  const containerClass =
    variant === 'card'
      ? 'mx-auto max-w-3xl space-y-6 rounded-3xl border border-white/10 bg-white/5 p-12 text-center backdrop-blur'
      : 'space-y-6 rounded-2xl border border-white/10 bg-white/5 p-6 text-left shadow-lg backdrop-blur'

  const headingClass = variant === 'card' ? 'text-3xl text-white font-semibold' : 'text-xl text-white font-semibold'
  const descriptionClass =
    variant === 'card'
      ? 'text-white/70 text-lg leading-relaxed'
      : 'text-white/70 text-sm leading-relaxed'

  const formLabelClass = 'text-left text-xs font-semibold uppercase tracking-[0.3em] text-white/60'
  const inputClass =
    'w-full rounded-2xl border border-white/15 bg-black/30 px-4 py-3 text-base text-white outline-none focus:border-cyan-300 focus:ring-2 focus:ring-cyan-300/40'
  const buttonClass =
    'w-full rounded-full bg-cyan-400 px-6 py-3 text-base font-semibold text-slate-900 transition hover:bg-cyan-300 disabled:cursor-not-allowed disabled:opacity-70'

  const secondaryButtonClass =
    'w-full rounded-full border border-white/20 px-6 py-3 text-base font-semibold text-white transition hover:border-cyan-300 hover:text-cyan-200 disabled:cursor-not-allowed disabled:opacity-70'

  const handleAliasSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setLastAttempt('alias')
    const result = await loginWithAlias({ alias })

    if (result.status === 'success') {
      setAlias('')
      setPassword('')
      setPhase('alias')
      setPendingAlias(null)
      setLastAttempt(null)
      clearDeniedReason()
      onSuccess?.()
    } else if (result.status === 'password-required') {
      setPhase('password')
      setPendingAlias(result.alias)
      setPassword('')
    }
  }

  const handlePasswordSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setLastAttempt('password')
    const targetAlias = pendingAlias ?? alias
    if (!targetAlias) return

    const result = await loginWithAlias({ alias: targetAlias, password })

    if (result.status === 'success') {
      setAlias('')
      setPassword('')
      setPhase('alias')
      setPendingAlias(null)
      setLastAttempt(null)
      clearDeniedReason()
      onSuccess?.()
    }
  }

  const resetAliasError = () => {
    if (deniedReason && lastAttempt === 'alias') {
      clearDeniedReason()
      setLastAttempt(null)
    }
  }

  if (isAuthenticated && user) {
    return (
      <div className={containerClass}>
        <h2 className={headingClass}>You&apos;re signed in</h2>
        <p className={descriptionClass}>
          Welcome back {user.name}! You&apos;re authenticated as{' '}
          <span className="font-semibold">{user.role === 'admin' ? 'an admin' : 'a team member'}</span>.
        </p>
      </div>
    )
  }

  return (
    <div className={containerClass}>
      <h1 className={headingClass}>{heading}</h1>
      <p className={descriptionClass}>{description}</p>

      <form className="space-y-4 text-left" onSubmit={handleAliasSubmit}>
        <p className={formLabelClass}>Team member access</p>
        <div className="space-y-2">
          <label className="text-xs font-semibold uppercase tracking-[0.3em] text-white/50">
            Alias
            <input
              type="text"
              value={alias}
              onChange={(event) => {
                setAlias(event.target.value)
                if (phase !== 'alias') {
                  setPhase('alias')
                  setPendingAlias(null)
                  setPassword('')
                }
                resetAliasError()
              }}
              placeholder="alias or alias@microsoft.com"
              className={inputClass}
              required
              disabled={phase === 'password'}
            />
          </label>
        </div>
        {aliasError && (
          <p className="rounded-2xl border border-rose-400/40 bg-rose-400/10 px-4 py-3 text-sm text-rose-100">
            {aliasError}
          </p>
        )}
        {phase === 'password' ? (
          <button
            type="button"
            onClick={() => {
              setPhase('alias')
              setPendingAlias(null)
              setPassword('')
              clearDeniedReason()
            }}
            className={secondaryButtonClass}
          >
            Use a different alias
          </button>
        ) : (
          <button
            type="submit"
            className={buttonClass}
            disabled={aliasDisabled || !alias.trim()}
          >
            {aliasDisabled ? 'Checking…' : 'Next'}
          </button>
        )}
      </form>

      {phase === 'password' && (
        <form className="space-y-3 text-left" onSubmit={handlePasswordSubmit}>
          <p className={formLabelClass}>Secure password check</p>
          <input
            type="password"
            value={password}
            onChange={(event) => {
              setPassword(event.target.value)
              if (deniedReason && lastAttempt === 'password') {
                clearDeniedReason()
                setLastAttempt(null)
              }
            }}
            placeholder={`Password for ${pendingAlias ?? alias}`}
            className={inputClass}
            required
          />
          {passwordNotice && (
            <p
              className={`rounded-2xl border px-4 py-3 text-sm ${
                passwordNotice.tone === 'info'
                  ? 'border-cyan-300/50 bg-cyan-300/10 text-cyan-100'
                  : 'border-rose-400/40 bg-rose-400/10 text-rose-100'
              }`}
            >
              {passwordNotice.message}
            </p>
          )}
          <button
            type="submit"
            className={buttonClass}
            disabled={passwordDisabled || !password.trim()}
          >
            {passwordDisabled ? 'Verifying…' : 'Sign in'}
          </button>
        </form>
      )}
    </div>
  )
}

interface AccessDeniedMessageProps {
  title?: string
  description?: string
  hint?: string
}

export function AccessDeniedMessage({
  title = 'Need access to CES3?',
  description =
    'Your alias is not in our roster yet. Ping the CES3 brand crew and we’ll get you sorted.',
  hint = 'Email ces3-brand@microsoft.com with your alias to request an invite.',
}: AccessDeniedMessageProps) {
  return (
    <div className="mx-auto max-w-3xl space-y-6 rounded-3xl border border-rose-300/40 bg-rose-300/10 p-12 text-center backdrop-blur">
      <h1 className="text-3xl font-semibold text-white">{title}</h1>
      <p className="text-white/80 text-lg leading-relaxed">{description}</p>
      <p className="text-sm uppercase tracking-[0.3em] text-white/50">{hint}</p>
    </div>
  )
}
