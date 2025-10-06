import { createFileRoute } from '@tanstack/react-router'
import { FormEvent, useEffect, useMemo, useState } from 'react'

import { AccessDeniedMessage, SignInPrompt } from '../components/AuthPrompts'
import type { ContestStatus } from '../lib/contest-utils'
import { useAuth } from '../state/AuthContext'
import { useContest } from '../state/ContestContext'

export const Route = createFileRoute('/admin/contests')({
  component: AdminContestsPage,
})

type ContestSummary = ReturnType<typeof useContest>['contests'][number]

type MessageState = { tone: 'success' | 'error'; text: string } | null

type ContestFormState = {
  title: string
  slug: string
  subtitle: string
  description: string
  status: ContestStatus
  votingOpen: boolean
  startsAt: string
  endsAt: string
  durationDays: string
  setActive: boolean
}

const STATUS_OPTIONS: ContestStatus[] = ['draft', 'upcoming', 'active', 'archived']

function toDateTimeLocal(value: string | null | undefined): string {
  if (!value) return ''
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) {
    return ''
  }
  const offsetMinutes = date.getTimezoneOffset()
  const local = new Date(date.getTime() - offsetMinutes * 60_000)
  return local.toISOString().slice(0, 16)
}

function fromDateTimeLocal(value: string | null | undefined): string | null {
  if (!value) return null
  const trimmed = value.trim()
  if (!trimmed) return null
  const date = new Date(trimmed)
  if (Number.isNaN(date.getTime())) {
    return null
  }
  return date.toISOString()
}

function diffInDays(startIso: string | null, endIso: string | null): string {
  if (!startIso || !endIso) return ''
  const start = new Date(startIso).getTime()
  const end = new Date(endIso).getTime()
  if (Number.isNaN(start) || Number.isNaN(end)) {
    return ''
  }
  const diff = end - start
  if (diff <= 0) return ''
  const days = diff / (1000 * 60 * 60 * 24)
  return days.toFixed(days % 1 === 0 ? 0 : 1)
}

function formatDuration(startsAt: string | null, endsAt: string | null): string {
  if (!startsAt) {
    return 'No start'
  }
  if (!endsAt) {
    return 'Open-ended'
  }
  const start = new Date(startsAt)
  const end = new Date(endsAt)
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || end <= start) {
    return 'Invalid range'
  }
  const diffMs = end.getTime() - start.getTime()
  const totalHours = Math.round(diffMs / (1000 * 60 * 60))
  const days = Math.floor(totalHours / 24)
  const hours = totalHours % 24
  if (days > 0 && hours > 0) {
    return `${days} day${days === 1 ? '' : 's'} ${hours} hr${hours === 1 ? '' : 's'}`
  }
  if (days > 0) {
    return `${days} day${days === 1 ? '' : 's'}`
  }
  return `${hours} hr${hours === 1 ? '' : 's'}`
}

function initialiseForm(): ContestFormState {
  const now = new Date()
  const defaultStart = new Date(now.getTime())
  defaultStart.setMinutes(0, 0, 0)
  const startLocal = toDateTimeLocal(defaultStart.toISOString())
  return {
    title: '',
    slug: '',
    subtitle: '',
    description: '',
    status: 'draft',
    votingOpen: false,
    startsAt: startLocal,
    endsAt: '',
    durationDays: '',
    setActive: false,
  }
}

function buildUpdatePayload(state: ContestFormState) {
  const startsAtIso = fromDateTimeLocal(state.startsAt)
  const endsAtIso = fromDateTimeLocal(state.endsAt)
  return {
    title: state.title.trim() || undefined,
    slug: state.slug.trim() || undefined,
    subtitle: state.subtitle.trim() || null,
    description: state.description.trim() || null,
    status: state.status,
    votingOpen: state.votingOpen,
    startsAt: startsAtIso,
    endsAt: endsAtIso,
    setActive: state.setActive,
  }
}

function useContestCards(contests: ContestSummary[]) {
  return useMemo(() => {
    return [...contests].sort((a, b) => {
      const aTime = a.startsAt ? new Date(a.startsAt).getTime() : 0
      const bTime = b.startsAt ? new Date(b.startsAt).getTime() : 0
      return bTime - aTime
    })
  }, [contests])
}

function AdminContestsPage() {
  const { isAuthenticated, isAdmin, loading } = useAuth()
  const {
    contests,
    activeContestId,
    createContest,
    updateContest,
    setActiveContest,
    refresh,
  } = useContest()

  const [createForm, setCreateForm] = useState<ContestFormState>(initialiseForm)
  const [creating, setCreating] = useState(false)
  const [createStatus, setCreateStatus] = useState<MessageState>(null)
  const [refreshing, setRefreshing] = useState(false)
  const [busyContestId, setBusyContestId] = useState<string | null>(null)
  const [cardNotices, setCardNotices] = useState<Record<string, MessageState>>({})

  const orderedContests = useContestCards(contests)

  const handleCreateSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setCreating(true)
    setCreateStatus(null)

    try {
      if (!createForm.title.trim()) {
        throw new Error('Title is required to create a contest.')
      }

      const payload = buildUpdatePayload(createForm)

      if (payload.startsAt && payload.endsAt) {
        const start = Date.parse(payload.startsAt)
        const end = Date.parse(payload.endsAt)
        if (!Number.isNaN(start) && !Number.isNaN(end) && end <= start) {
          throw new Error('End time must be after the start time.')
        }
      }

      const created = await createContest({
        title: payload.title ?? createForm.title.trim(),
        slug: payload.slug,
        subtitle: payload.subtitle ?? null,
        description: payload.description ?? null,
        status: payload.status,
        startsAt: payload.startsAt ?? null,
        endsAt: payload.endsAt ?? null,
        votingOpen: payload.votingOpen,
        setActive: payload.setActive,
      })

      setCreateStatus({ tone: 'success', text: `Contest “${created?.title ?? createForm.title}” created.` })
      setCreateForm(initialiseForm())
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to create contest.'
      setCreateStatus({ tone: 'error', text: message })
    } finally {
      setCreating(false)
    }
  }

  const handleRefresh = async () => {
    setRefreshing(true)
    try {
      await refresh()
    } finally {
      setRefreshing(false)
    }
  }

  if (loading) {
    return (
      <div className="mx-auto max-w-3xl space-y-6 rounded-3xl border border-white/10 bg-white/5 p-12 text-center backdrop-blur">
        <h1 className="text-3xl font-semibold text-white">Checking admin access…</h1>
        <p className="text-white/70">Hang tight while we confirm your CES3 permissions.</p>
      </div>
    )
  }

  if (!isAuthenticated) {
    return (
      <SignInPrompt
        heading="Sign in to manage contests"
        description="Admins can create competitions, switch the active bracket, and schedule start/end windows."
      />
    )
  }

  if (!isAdmin) {
    return (
      <AccessDeniedMessage
        title="Admin access required"
        description="Only CES3 admins can manage contest settings. Ask the brand council to promote your alias."
        hint="Need elevated access? Email the app admin."
      />
    )
  }

  return (
    <div className="space-y-12 pb-20">
      <header className="space-y-4">
        <p className="text-sm uppercase tracking-[0.3em] text-cyan-200/70">Contest control room</p>
        <h1 className="text-4xl font-semibold text-white">Manage arenas & schedules</h1>
        <p className="max-w-3xl text-white/70">
          Spin up new showdowns, mark the active bracket, and define clear start and end windows. Use this panel to keep the studio focused on the right contest.
        </p>
        <div className="flex flex-wrap items-center gap-3 text-sm text-white/60">
          <button
            type="button"
            onClick={handleRefresh}
            className="rounded-full border border-white/15 bg-white/10 px-4 py-2 font-semibold text-white transition hover:border-cyan-300 hover:text-cyan-200 disabled:cursor-wait disabled:text-white/40"
            disabled={refreshing}
          >
            {refreshing ? 'Refreshing…' : 'Reload contests'}
          </button>
          <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs uppercase tracking-[0.3em] text-white/40">
            Active: {activeContestId ?? 'none'}
          </span>
        </div>
      </header>

      <section className="grid gap-8 rounded-3xl border border-white/10 bg-white/5 p-8 lg:grid-cols-[380px_1fr]">
        <form onSubmit={handleCreateSubmit} className="space-y-5">
          <div>
            <h2 className="text-2xl font-semibold text-white">Create a contest</h2>
            <p className="text-sm text-white/60">Provide the basics, set optional scheduling, and choose whether to flip it live immediately.</p>
          </div>

          <label className="flex flex-col gap-2 text-sm text-white/70">
            Title
            <input
              type="text"
              value={createForm.title}
              onChange={(event) => {
                const value = event.target.value
                setCreateForm((prev) => ({ ...prev, title: value }))
              }}
              className="rounded-2xl border border-white/15 bg-slate-900/70 px-4 py-3 text-white outline-none transition focus:border-cyan-300"
              placeholder="e.g. Halo Iconic Moments"
              required
            />
          </label>

          <label className="flex flex-col gap-2 text-sm text-white/70">
            Custom slug (optional)
            <input
              type="text"
              value={createForm.slug}
              onChange={(event) => {
                const value = event.target.value
                setCreateForm((prev) => ({ ...prev, slug: value }))
              }}
              className="rounded-2xl border border-white/15 bg-slate-900/70 px-4 py-3 text-white outline-none transition focus:border-cyan-300"
              placeholder="halo-icons"
            />
          </label>

          <label className="flex flex-col gap-2 text-sm text-white/70">
            Subtitle
            <input
              type="text"
              value={createForm.subtitle}
              onChange={(event) => {
                const value = event.target.value
                setCreateForm((prev) => ({ ...prev, subtitle: value }))
              }}
              className="rounded-2xl border border-white/15 bg-slate-900/70 px-4 py-3 text-white outline-none transition focus:border-cyan-300"
              placeholder="Elevate the Spartan mark"
            />
          </label>

          <label className="flex flex-col gap-2 text-sm text-white/70">
            Description
            <textarea
              value={createForm.description}
              onChange={(event) => {
                const value = event.target.value
                setCreateForm((prev) => ({ ...prev, description: value }))
              }}
              className="h-28 rounded-2xl border border-white/15 bg-slate-900/70 px-4 py-3 text-white outline-none transition focus:border-cyan-300"
              placeholder="Give voters context about this bracket."
            />
          </label>

          <div className="grid gap-4 md:grid-cols-2">
            <label className="flex flex-col gap-2 text-sm text-white/70">
              Starts at
              <input
                type="datetime-local"
                value={createForm.startsAt}
                onChange={(event) => {
                  const value = event.target.value
                  setCreateForm((prev) => {
                    const startsAt = value
                    const endsAt = prev.durationDays
                      ? computeEndsAtFromDuration(value, prev.durationDays)
                      : prev.endsAt
                    return { ...prev, startsAt, endsAt }
                  })
                }}
                className="rounded-2xl border border-white/15 bg-slate-900/70 px-4 py-3 text-white outline-none transition focus:border-cyan-300"
              />
            </label>
            <label className="flex flex-col gap-2 text-sm text-white/70">
              Ends at
              <input
                type="datetime-local"
                value={createForm.endsAt}
                onChange={(event) => {
                  const value = event.target.value
                  setCreateForm((prev) => ({
                    ...prev,
                    endsAt: value,
                    durationDays: value && prev.startsAt
                      ? diffInDays(fromDateTimeLocal(prev.startsAt), fromDateTimeLocal(value))
                      : prev.durationDays,
                  }))
                }}
                className="rounded-2xl border border-white/15 bg-slate-900/70 px-4 py-3 text-white outline-none transition focus:border-cyan-300"
              />
            </label>
            <label className="flex flex-col gap-2 text-sm text-white/70">
              Duration (days)
              <input
                type="number"
                min="0"
                step="0.5"
                value={createForm.durationDays}
                onChange={(event) => {
                  const value = event.target.value
                  setCreateForm((prev) => ({
                    ...prev,
                    durationDays: value,
                    endsAt: computeEndsAtFromDuration(prev.startsAt, value),
                  }))
                }}
                className="rounded-2xl border border-white/15 bg-slate-900/70 px-4 py-3 text-white outline-none transition focus:border-cyan-300"
                placeholder="7"
              />
            </label>
            <label className="flex flex-col gap-2 text-sm text-white/70">
              Status
              <select
                value={createForm.status}
                onChange={(event) => {
                  const value = event.target.value as ContestStatus
                  setCreateForm((prev) => ({ ...prev, status: value }))
                }}
                className="rounded-2xl border border-white/15 bg-slate-900/70 px-4 py-3 text-white outline-none transition focus:border-cyan-300"
              >
                {STATUS_OPTIONS.map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <div className="flex flex-col gap-3 rounded-2xl border border-white/10 bg-slate-900/50 p-4 text-sm text-white/70">
            <label className="flex items-center gap-3">
              <input
                type="checkbox"
                checked={createForm.votingOpen}
                onChange={(event) => {
                  const checked = event.target.checked
                  setCreateForm((prev) => ({ ...prev, votingOpen: checked }))
                }}
                className="h-4 w-4 rounded border border-white/30 bg-transparent accent-cyan-400"
              />
              Voting open by default
            </label>
            <label className="flex items-center gap-3">
              <input
                type="checkbox"
                checked={createForm.setActive}
                onChange={(event) => {
                  const checked = event.target.checked
                  setCreateForm((prev) => ({ ...prev, setActive: checked }))
                }}
                className="h-4 w-4 rounded border border-white/30 bg-transparent accent-cyan-400"
              />
              Make active immediately
            </label>
          </div>

          <button
            type="submit"
            className="w-full rounded-full bg-cyan-400 px-5 py-3 text-base font-semibold text-slate-900 transition hover:bg-cyan-300 disabled:cursor-not-allowed disabled:opacity-70"
            disabled={creating}
          >
            {creating ? 'Creating…' : 'Create contest'}
          </button>

          {createStatus && (
            <p
              className={`rounded-2xl border px-4 py-3 text-sm ${
                createStatus.tone === 'success'
                  ? 'border-emerald-300/40 bg-emerald-300/10 text-emerald-100'
                  : 'border-rose-300/40 bg-rose-300/10 text-rose-100'
              }`}
            >
              {createStatus.text}
            </p>
          )}
        </form>

        <div className="space-y-6">
          <h2 className="text-2xl font-semibold text-white">Current contests</h2>
          {orderedContests.length === 0 ? (
            <p className="rounded-2xl border border-white/10 bg-white/5 p-8 text-white/70">
              No contests yet. Create one to kick off the first bracket.
            </p>
          ) : (
            <div className="space-y-6">
              {orderedContests.map((contest) => (
                <ContestCard
                  key={contest.id}
                  contest={contest}
                  isActive={contest.id === activeContestId}
                  onUpdate={async (payload) => {
                    setBusyContestId(contest.id)
                    setCardNotices((prev) => ({ ...prev, [contest.id]: null }))
                    try {
                      const updated = await updateContest(contest.id, payload)
                      setCardNotices((prev) => ({
                        ...prev,
                        [contest.id]: {
                          tone: 'success',
                          text: `Contest updated (${updated?.title ?? contest.title}).`,
                        },
                      }))
                    } catch (error) {
                      const message = error instanceof Error ? error.message : 'Failed to update contest.'
                      setCardNotices((prev) => ({
                        ...prev,
                        [contest.id]: { tone: 'error', text: message },
                      }))
                    } finally {
                      setBusyContestId(null)
                    }
                  }}
                  onSetActive={async () => {
                    setBusyContestId(contest.id)
                    setCardNotices((prev) => ({ ...prev, [contest.id]: null }))
                    try {
                      await setActiveContest(contest.id)
                      setCardNotices((prev) => ({
                        ...prev,
                        [contest.id]: { tone: 'success', text: 'Contest set as active.' },
                      }))
                    } catch (error) {
                      const message = error instanceof Error ? error.message : 'Failed to activate contest.'
                      setCardNotices((prev) => ({
                        ...prev,
                        [contest.id]: { tone: 'error', text: message },
                      }))
                    } finally {
                      setBusyContestId(null)
                    }
                  }}
                  notice={cardNotices[contest.id] ?? null}
                  busy={busyContestId === contest.id}
                />
              ))}
            </div>
          )}
        </div>
      </section>
    </div>
  )
}

interface ContestCardProps {
  contest: ContestSummary
  isActive: boolean
  busy: boolean
  notice: MessageState
  onUpdate: (payload: Parameters<ReturnType<typeof useContest>['updateContest']>[1]) => Promise<void>
  onSetActive: () => Promise<void>
}

function computeEndsAtFromDuration(startsAtLocal: string, durationDays: string): string {
  const parsedDays = Number.parseFloat(durationDays)
  if (!startsAtLocal || Number.isNaN(parsedDays) || parsedDays <= 0) {
    return ''
  }
  const startIso = fromDateTimeLocal(startsAtLocal)
  if (!startIso) return ''
  const startDate = new Date(startIso)
  startDate.setSeconds(0, 0)
  startDate.setHours(startDate.getHours() + parsedDays * 24)
  return toDateTimeLocal(startDate.toISOString())
}

function ContestCard({ contest, isActive, busy, notice, onUpdate, onSetActive }: ContestCardProps) {
  const [form, setForm] = useState<ContestFormState>(() => ({
    title: contest.title,
    slug: contest.slug,
    subtitle: contest.subtitle ?? '',
    description: contest.description ?? '',
    status: contest.status,
    votingOpen: contest.votingOpen,
    startsAt: toDateTimeLocal(contest.startsAt ?? null),
    endsAt: toDateTimeLocal(contest.endsAt ?? null),
    durationDays: diffInDays(contest.startsAt ?? null, contest.endsAt ?? null),
    setActive: false,
  }))

  const [updating, setUpdating] = useState(false)
  const [localNotice, setLocalNotice] = useState<MessageState>(null)

  useEffect(() => {
    setForm({
      title: contest.title,
      slug: contest.slug,
      subtitle: contest.subtitle ?? '',
      description: contest.description ?? '',
      status: contest.status,
      votingOpen: contest.votingOpen,
      startsAt: toDateTimeLocal(contest.startsAt ?? null),
      endsAt: toDateTimeLocal(contest.endsAt ?? null),
      durationDays: diffInDays(contest.startsAt ?? null, contest.endsAt ?? null),
      setActive: false,
    })
  }, [contest])

  useEffect(() => {
    if (notice) {
      setLocalNotice(null)
    }
  }, [notice])

  const durationLabel = formatDuration(
    fromDateTimeLocal(form.startsAt),
    fromDateTimeLocal(form.endsAt),
  )

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setUpdating(true)
    try {
      const payload = buildUpdatePayload(form)

      if (payload.startsAt && payload.endsAt) {
        const start = Date.parse(payload.startsAt)
        const end = Date.parse(payload.endsAt)
        if (!Number.isNaN(start) && !Number.isNaN(end) && end <= start) {
          setLocalNotice({ tone: 'error', text: 'End time must be after the start time.' })
          return
        }
      }

      setLocalNotice(null)

      await onUpdate({
        title: payload.title,
        slug: payload.slug,
        subtitle: payload.subtitle ?? null,
        description: payload.description ?? null,
        status: payload.status,
        startsAt: payload.startsAt ?? null,
        endsAt: payload.endsAt ?? null,
        votingOpen: payload.votingOpen,
        setActive: payload.setActive,
      })
      setForm((prev) => ({ ...prev, setActive: false }))
    } finally {
      setUpdating(false)
    }
  }

  const statusBadgeClass =
    contest.status === 'active'
      ? 'bg-emerald-400/20 text-emerald-200 border-emerald-400/40'
      : contest.status === 'archived'
        ? 'bg-white/5 text-white/60 border-white/20'
        : contest.status === 'upcoming'
          ? 'bg-cyan-400/20 text-cyan-100 border-cyan-400/30'
          : 'bg-amber-400/20 text-amber-100 border-amber-400/30'

  return (
    <form
      onSubmit={handleSubmit}
      className="space-y-5 rounded-3xl border border-white/10 bg-slate-900/60 p-6"
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="text-xl font-semibold text-white">{contest.title}</h3>
          <p className="text-xs uppercase tracking-[0.3em] text-white/40">{contest.id}</p>
        </div>
        <span
          className={`inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs font-semibold uppercase tracking-[0.3em] ${statusBadgeClass}`}
        >
          {contest.status}
          {isActive && <span className="rounded-full bg-emerald-300/30 px-2 text-[0.6rem] text-emerald-100">ACTIVE</span>}
        </span>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <label className="flex flex-col gap-2 text-sm text-white/70">
          Title
          <input
            type="text"
            value={form.title}
            onChange={(event) => setForm((prev) => ({ ...prev, title: event.target.value }))}
            className="rounded-2xl border border-white/15 bg-slate-900/70 px-4 py-3 text-white outline-none transition focus:border-cyan-300"
          />
        </label>
        <label className="flex flex-col gap-2 text-sm text-white/70">
          Slug
          <input
            type="text"
            value={form.slug}
            onChange={(event) => setForm((prev) => ({ ...prev, slug: event.target.value }))}
            className="rounded-2xl border border-white/15 bg-slate-900/70 px-4 py-3 text-white outline-none transition focus:border-cyan-300"
          />
        </label>
        <label className="flex flex-col gap-2 text-sm text-white/70 md:col-span-2">
          Subtitle
          <input
            type="text"
            value={form.subtitle}
            onChange={(event) => setForm((prev) => ({ ...prev, subtitle: event.target.value }))}
            className="rounded-2xl border border-white/15 bg-slate-900/70 px-4 py-3 text-white outline-none transition focus:border-cyan-300"
          />
        </label>
        <label className="flex flex-col gap-2 text-sm text-white/70 md:col-span-2">
          Description
          <textarea
            value={form.description}
            onChange={(event) => setForm((prev) => ({ ...prev, description: event.target.value }))}
            className="h-28 rounded-2xl border border-white/15 bg-slate-900/70 px-4 py-3 text-white outline-none transition focus:border-cyan-300"
          />
        </label>
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <label className="flex flex-col gap-2 text-sm text-white/70">
          Starts at
          <input
            type="datetime-local"
            value={form.startsAt}
            onChange={(event) => {
              const value = event.target.value
              setForm((prev) => ({
                ...prev,
                startsAt: value,
                endsAt: prev.durationDays
                  ? computeEndsAtFromDuration(value, prev.durationDays)
                  : prev.endsAt,
              }))
            }}
            className="rounded-2xl border border-white/15 bg-slate-900/70 px-4 py-3 text-white outline-none transition focus:border-cyan-300"
          />
        </label>
        <label className="flex flex-col gap-2 text-sm text-white/70">
          Ends at
          <input
            type="datetime-local"
            value={form.endsAt}
            onChange={(event) => {
              const value = event.target.value
              setForm((prev) => ({
                ...prev,
                endsAt: value,
                durationDays: value && prev.startsAt
                  ? diffInDays(fromDateTimeLocal(prev.startsAt), fromDateTimeLocal(value))
                  : prev.durationDays,
              }))
            }}
            className="rounded-2xl border border-white/15 bg-slate-900/70 px-4 py-3 text-white outline-none transition focus:border-cyan-300"
          />
        </label>
        <label className="flex flex-col gap-2 text-sm text-white/70">
          Duration (days)
          <input
            type="number"
            min="0"
            step="0.5"
            value={form.durationDays}
            onChange={(event) => {
              const value = event.target.value
              setForm((prev) => ({
                ...prev,
                durationDays: value,
                endsAt: computeEndsAtFromDuration(prev.startsAt, value),
              }))
            }}
            className="rounded-2xl border border-white/15 bg-slate-900/70 px-4 py-3 text-white outline-none transition focus:border-cyan-300"
          />
        </label>
        <label className="flex flex-col gap-2 text-sm text-white/70">
          Status
          <select
            value={form.status}
            onChange={(event) => {
              const value = event.target.value as ContestStatus
              setForm((prev) => ({ ...prev, status: value }))
            }}
            className="rounded-2xl border border-white/15 bg-slate-900/70 px-4 py-3 text-white outline-none transition focus:border-cyan-300"
          >
            {STATUS_OPTIONS.map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <div className="space-y-3 rounded-2xl border border-white/10 bg-slate-900/50 p-4 text-sm text-white/70">
          <label className="flex items-center gap-3">
            <input
              type="checkbox"
              checked={form.votingOpen}
              onChange={(event) => {
                const checked = event.target.checked
                setForm((prev) => ({ ...prev, votingOpen: checked }))
              }}
              className="h-4 w-4 rounded border border-white/30 bg-transparent accent-cyan-400"
            />
            Voting open
          </label>
          <label className="flex items-center gap-3">
            <input
              type="checkbox"
              checked={form.setActive}
              onChange={(event) => {
                const checked = event.target.checked
                setForm((prev) => ({ ...prev, setActive: checked }))
              }}
              className="h-4 w-4 rounded border border-white/30 bg-transparent accent-cyan-400"
            />
            Set active after update
          </label>
        </div>
        <div className="rounded-2xl border border-white/10 bg-white/5 p-4 text-sm text-white/70">
          <p className="font-semibold text-white">Summary</p>
          <dl className="mt-2 space-y-1">
            <div className="flex justify-between text-xs uppercase tracking-[0.25em] text-white/40">
              <dt>Logos</dt>
              <dd className="text-white/70">{contest.logoCount}</dd>
            </div>
            <div className="flex justify-between text-xs uppercase tracking-[0.25em] text-white/40">
              <dt>Matches</dt>
              <dd className="text-white/70">{contest.matchCount}</dd>
            </div>
            <div className="flex justify-between text-xs uppercase tracking-[0.25em] text-white/40">
              <dt>Window</dt>
              <dd className="text-white/70">{durationLabel}</dd>
            </div>
          </dl>
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="space-x-3">
          <button
            type="submit"
            className="rounded-full bg-cyan-400 px-5 py-2 text-sm font-semibold text-slate-900 transition hover:bg-cyan-300 disabled:cursor-not-allowed disabled:opacity-70"
            disabled={busy || updating}
          >
            {updating ? 'Saving…' : 'Save changes'}
          </button>
          {!isActive && (
            <button
              type="button"
              onClick={() => {
                void onSetActive()
              }}
              className="rounded-full border border-emerald-300/40 px-5 py-2 text-sm font-semibold text-emerald-100 transition hover:border-emerald-200 hover:text-emerald-50 disabled:cursor-not-allowed disabled:opacity-70"
              disabled={busy}
            >
              {busy ? 'Activating…' : 'Set active'}
            </button>
          )}
        </div>
        <p className="text-xs uppercase tracking-[0.3em] text-white/40">
          Updated {new Date(contest.updatedAt).toLocaleString()}
        </p>
      </div>

      {(localNotice || notice) && (
        <p
          className={`rounded-2xl border px-4 py-3 text-sm ${
            (localNotice ?? notice)!.tone === 'success'
              ? 'border-emerald-300/40 bg-emerald-300/10 text-emerald-100'
              : 'border-rose-300/40 bg-rose-300/10 text-rose-100'
          }`}
        >
          {(localNotice ?? notice)!.text}
        </p>
      )}
    </form>
  )
}
