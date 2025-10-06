import { Link, createFileRoute } from '@tanstack/react-router'
import { useMemo } from 'react'

import { useContest } from '../state/ContestContext'

type ContestSummary = ReturnType<typeof useContest>['contests'][number]

export const Route = createFileRoute('/contests')({
  component: ContestsTimelinePage,
})

function formatDateLabel(startsAt?: string | null, endsAt?: string | null) {
  const startDate = startsAt ? new Date(startsAt) : null
  const endDate = endsAt ? new Date(endsAt) : null

  const startValid = startDate && !Number.isNaN(startDate.getTime())
  const endValid = endDate && !Number.isNaN(endDate.getTime())

  if (startValid && endValid) {
    return `${startDate!.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })} → ${endDate!.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}`
  }

  if (startValid) {
    return `${startDate!.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}`
  }

  if (endValid) {
    return `Ended ${endDate!.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}`
  }

  return 'Schedule TBA'
}

function ContestsTimelinePage() {
  const { contests, activeContestId, loading, error } = useContest()

  const now = Date.now()

  const activeContest = useMemo(
    () => contests.find((contest) => contest.id === activeContestId) ?? contests.find((contest) => contest.isActive) ?? null,
    [activeContestId, contests],
  )

  const upcomingContests = useMemo(
    () =>
      contests
        .filter((contest) => {
          if (contest.id === activeContestId || contest.isActive) {
            return false
          }
          if (contest.status === 'upcoming') {
            return true
          }
          if (contest.startsAt) {
            const timestamp = Date.parse(contest.startsAt)
            return !Number.isNaN(timestamp) && timestamp > now
          }
          return false
        })
        .sort((a, b) => {
          const aTime = a.startsAt ? Date.parse(a.startsAt) : Number.POSITIVE_INFINITY
          const bTime = b.startsAt ? Date.parse(b.startsAt) : Number.POSITIVE_INFINITY
          return aTime - bTime
        }),
    [activeContestId, contests, now],
  )

  const archivedContests = useMemo(
    () =>
      contests
        .filter((contest) => {
          if (contest.isActive || contest.id === activeContestId) {
            return false
          }
          if (contest.status === 'archived') {
            return true
          }
          if (contest.endsAt) {
            const timestamp = Date.parse(contest.endsAt)
            return !Number.isNaN(timestamp) && timestamp < now
          }
          if (contest.matchCount > 0 && contest.status !== 'upcoming') {
            return true
          }
          return false
        })
        .sort((a, b) => {
          const aTime = a.endsAt ? Date.parse(a.endsAt) : Date.parse(a.updatedAt)
          const bTime = b.endsAt ? Date.parse(b.endsAt) : Date.parse(b.updatedAt)
          return bTime - aTime
        }),
    [activeContestId, contests, now],
  )

  if (loading) {
    return (
      <div className="mx-auto max-w-3xl space-y-6 rounded-3xl border border-white/10 bg-white/5 p-12 text-center backdrop-blur">
        <h1 className="text-3xl font-semibold text-white">Loading contest timeline…</h1>
        <p className="text-white/70">Pulling the full CES3 bracket history.</p>
      </div>
    )
  }

  if (error) {
    return (
      <div className="mx-auto max-w-3xl space-y-6 rounded-3xl border border-rose-300/30 bg-rose-300/10 p-12 text-center">
        <h1 className="text-3xl font-semibold text-white">We couldn&apos;t reach the contest vault</h1>
        <p className="text-rose-100/80">{error}</p>
      </div>
    )
  }

  return (
    <div className="space-y-14 pb-20">
      <header className="space-y-6 rounded-3xl border border-white/10 bg-white/5 p-10 backdrop-blur">
        <p className="text-sm uppercase tracking-[0.3em] text-cyan-200/70">Contest timeline</p>
        <h1 className="text-4xl font-semibold text-white">Track every CES3 arena</h1>
        <p className="max-w-3xl text-white/70">
          Explore active showdowns, see what&apos;s coming next, and revisit previous champions. Each archive includes match volume, participation, and the leading marks when the bracket closed.
        </p>
        <div className="flex flex-wrap items-center gap-3 text-sm text-white/60">
          <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs uppercase tracking-[0.3em] text-white/40">
            {contests.length} contest{contests.length === 1 ? '' : 's'} tracked
          </span>
          {activeContest && (
            <Link
              to="/vote"
              className="rounded-full border border-cyan-300/50 bg-cyan-300/10 px-5 py-2 text-sm font-semibold text-cyan-100 transition hover:border-cyan-200 hover:bg-cyan-200/20 hover:text-white"
            >
              Head to active vote
            </Link>
          )}
        </div>
      </header>

      {activeContest && (
        <section className="space-y-6">
          <h2 className="text-2xl font-semibold text-white">Live arena</h2>
          <ActiveContestCard contest={activeContest} />
        </section>
      )}

      {upcomingContests.length > 0 && (
        <section className="space-y-6">
          <h2 className="text-2xl font-semibold text-white">On deck</h2>
          <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-3">
            {upcomingContests.map((contest) => (
              <article
                key={contest.id}
                className="rounded-3xl border border-white/10 bg-slate-900/60 p-6"
              >
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <h3 className="text-xl font-semibold text-white">{contest.title}</h3>
                    {contest.subtitle && (
                      <p className="text-sm text-white/60">{contest.subtitle}</p>
                    )}
                  </div>
                  <span className="rounded-full border border-cyan-300/30 bg-cyan-300/10 px-3 py-1 text-xs uppercase tracking-[0.3em] text-cyan-100">
                    Upcoming
                  </span>
                </div>
                <p className="mt-4 text-sm text-white/60">{formatDateLabel(contest.startsAt, contest.endsAt)}</p>
                <div className="mt-6 grid grid-cols-2 gap-3 text-xs uppercase tracking-[0.25em] text-white/40">
                  <StatCell label="Logos queued" value={contest.logoCount.toLocaleString()} />
                  <StatCell label="Matches" value={contest.matchCount.toLocaleString()} />
                </div>
              </article>
            ))}
          </div>
        </section>
      )}

      <section className="space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-2xl font-semibold text-white">Archived results</h2>
          <p className="text-sm text-white/60">
            {archivedContests.length > 0
              ? 'Review previous champions and voter momentum.'
              : 'No archived contests yet—check back after the first bracket wraps.'}
          </p>
        </div>
        {archivedContests.length === 0 ? (
          <div className="rounded-3xl border border-white/10 bg-white/5 p-10 text-center text-white/70">
            We&apos;ll store a full recap here once the first contest completes.
          </div>
        ) : (
          <div className="grid gap-6 lg:grid-cols-2">
            {archivedContests.map((contest) => (
              <ArchivedContestCard key={contest.id} contest={contest} />
            ))}
          </div>
        )}
      </section>
    </div>
  )
}

function ActiveContestCard({ contest }: { contest: ContestSummary }) {
  const rangeLabel = formatDateLabel(contest.startsAt, contest.endsAt)
  const lastTracked = contest.lastMatchAt
    ? new Date(contest.lastMatchAt).toLocaleString()
    : 'No matches yet'

  return (
    <article className="rounded-3xl border border-cyan-300/40 bg-cyan-300/10 p-8 backdrop-blur">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-xs uppercase tracking-[0.35em] text-cyan-200/70">ID {contest.id}</p>
          <h3 className="mt-2 text-3xl font-semibold text-white">{contest.title}</h3>
          {contest.subtitle && <p className="mt-2 text-sm text-white/70">{contest.subtitle}</p>}
        </div>
        <span className="rounded-full border border-emerald-300/60 bg-emerald-400/20 px-4 py-1 text-xs font-semibold uppercase tracking-[0.3em] text-emerald-100">
          Active now
        </span>
      </div>
      <p className="mt-6 text-sm text-white/70">{rangeLabel}</p>
      <div className="mt-6 grid gap-4 text-xs uppercase tracking-[0.3em] text-white/40 md:grid-cols-3">
        <StatCell label="Logos" value={contest.logoCount.toLocaleString()} />
        <StatCell label="Matches" value={contest.matchCount.toLocaleString()} />
        <StatCell label="Last match" value={lastTracked} />
      </div>
      <div className="mt-8 flex flex-wrap items-center gap-3">
        <Link
          to="/vote"
          className="rounded-full bg-white px-5 py-2 text-sm font-semibold text-slate-900 transition hover:bg-cyan-100"
        >
          Cast your vote
        </Link>
        <Link
          to="/scores"
          className="rounded-full border border-white/30 px-5 py-2 text-sm font-semibold text-white transition hover:border-cyan-200 hover:text-cyan-100"
        >
          View live scores
        </Link>
      </div>
    </article>
  )
}

function ArchivedContestCard({ contest }: { contest: ContestSummary }) {
  const rangeLabel = formatDateLabel(contest.startsAt, contest.endsAt)
  const archivedLabel = contest.lastMatchAt
    ? `Closed ${new Date(contest.lastMatchAt).toLocaleString()}`
    : 'No recorded matches'

  const leaders = contest.leaderboard.slice(0, 4)

  return (
    <article className="space-y-6 rounded-3xl border border-white/10 bg-slate-900/60 p-6">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-xs uppercase tracking-[0.35em] text-white/40">{contest.id}</p>
          <h3 className="mt-2 text-2xl font-semibold text-white">{contest.title}</h3>
          {contest.subtitle && <p className="mt-2 text-sm text-white/60">{contest.subtitle}</p>}
        </div>
        <span className="rounded-full border border-white/20 bg-white/10 px-3 py-1 text-xs uppercase tracking-[0.3em] text-white/50">
          Archived
        </span>
      </div>
      <p className="text-sm text-white/60">{rangeLabel}</p>
      <div className="grid gap-3 text-xs uppercase tracking-[0.25em] text-white/40 md:grid-cols-3">
        <StatCell label="Logos" value={contest.logoCount.toLocaleString()} />
        <StatCell label="Matches" value={contest.matchCount.toLocaleString()} />
        <StatCell label="Last match" value={archivedLabel} />
      </div>
      <div>
        <h4 className="text-xs uppercase tracking-[0.3em] text-white/50">Top performers</h4>
        {leaders.length === 0 ? (
          <p className="mt-3 text-sm text-white/60">No leaderboard data was recorded.</p>
        ) : (
          <ul className="mt-3 space-y-3">
            {leaders.map((entry, index) => (
              <li
                key={entry.logoId}
                className="flex items-center justify-between gap-3 rounded-2xl border border-white/10 bg-white/5 px-3 py-2"
              >
                <div className="flex items-center gap-3">
                  <span className="text-sm font-semibold text-cyan-200">#{index + 1}</span>
                  <img
                    src={entry.logoImage}
                    alt=""
                    className="h-10 w-10 flex-shrink-0 rounded-full border border-white/15 bg-slate-900/70 object-contain"
                    loading="lazy"
                    decoding="async"
                  />
                  <div>
                    <p className="text-sm font-semibold text-white">{entry.logoName}</p>
                    <p className="text-[11px] uppercase tracking-[0.3em] text-white/40">{entry.logoCodename}</p>
                  </div>
                </div>
                <div className="text-right text-xs uppercase tracking-[0.25em] text-white/50">
                  <p className="text-white/80">{Math.round(entry.rating)}</p>
                  <p>
                    {entry.wins}W&nbsp;·&nbsp;{entry.losses}L
                  </p>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </article>
  )
}

function StatCell({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p>{label}</p>
      <p className="mt-1 text-sm font-semibold text-white">{value}</p>
    </div>
  )
}
