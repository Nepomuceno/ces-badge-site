import { createFileRoute, Link, notFound } from '@tanstack/react-router'
import { useMemo, type ReactNode } from 'react'

import type {
  ChampionInsights,
  ChampionOpponentFact,
  ChampionWinStreak,
  ContestWithMetrics,
} from '../lib/contest-utils'

type ContestRecap = ContestWithMetrics & { isActive: boolean }

interface ContestResponse {
  contest?: ContestRecap
}

const TOP_FIVE_IMAGE_SIZES = ['h-24 w-24', 'h-20 w-20', 'h-16 w-16', 'h-14 w-14', 'h-12 w-12']

function formatScheduleRange(startsAt?: string | null, endsAt?: string | null) {
  const startDate = startsAt ? new Date(startsAt) : null
  const endDate = endsAt ? new Date(endsAt) : null
  const startValid = startDate && !Number.isNaN(startDate.getTime())
  const endValid = endDate && !Number.isNaN(endDate.getTime())

  if (startValid && endValid) {
    return `${startDate!.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })} → ${endDate!.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}`
  }

  if (startValid) {
    return startDate!.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
  }

  if (endValid) {
    return `Ended ${endDate!.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}`
  }

  return 'Schedule TBA'
}

async function fetchContestRecap(contestId: string): Promise<ContestRecap> {
  const response = await fetch(`/api/contests/${encodeURIComponent(contestId)}`, {
    headers: {
      Accept: 'application/json',
    },
  })

  if (response.status === 404) {
    throw notFound()
  }

  if (!response.ok) {
    throw new Error('Failed to load contest details.')
  }

  const data = (await response.json()) as ContestResponse
  if (!data.contest) {
    throw notFound()
  }

  return data.contest
}

export const Route = createFileRoute('/contest_results/$contestId')({
  loader: async ({ params }) => fetchContestRecap(params.contestId),
  head: ({ loaderData, params }) => {
    const contest = loaderData ?? null
    const title = contest
      ? `${contest.title} recap | CES3 Badge Arena`
      : `Contest ${params.contestId} | CES3 Badge Arena`
    return {
      meta: [
        {
          title,
        },
      ],
    }
  },
  component: ContestRecapPage,
})

function ContestRecapPage() {
  const contest = Route.useLoaderData()

  const topFive = useMemo(() => contest.leaderboard.slice(0, 5), [contest.leaderboard])
  const champion = topFive[0] ?? null
  const championInsights = contest.championInsights ?? null
  const hasLiveVoting = contest.votingOpen

  const statusVariant = hasLiveVoting
    ? {
        label: 'Voting open',
        classes:
          'border-emerald-300/50 bg-emerald-400/20 text-emerald-100 border',
      }
    : contest.isActive
      ? {
          label: 'Contest paused',
          classes:
            'border-amber-300/40 bg-amber-400/15 text-amber-100 border',
        }
      : {
          label: 'Archived contest',
          classes: 'border-white/20 bg-white/10 text-white/60 border',
        }

  const endedAt =
    contest.lastMatchAt ?? contest.endsAt ?? contest.archivedAt ?? null
  const endedLabel = endedAt
    ? new Date(endedAt).toLocaleString()
    : 'No recorded matches'
  const rangeLabel = formatScheduleRange(contest.startsAt, contest.endsAt)
  const subtitle = contest.subtitle?.trim()

  return (
    <div className="space-y-12 pb-16">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Link
          to="/contests"
          className="inline-flex items-center gap-2 rounded-full border border-white/20 px-4 py-2 text-sm font-semibold text-white/70 transition hover:border-cyan-300 hover:text-cyan-200"
        >
          <span aria-hidden>←</span>
          Back to contest timeline
        </Link>
        <span
          className={`rounded-full px-4 py-1 text-xs font-semibold uppercase tracking-[0.3em] ${statusVariant.classes}`}
        >
          {statusVariant.label}
        </span>
      </div>

      <header className="space-y-6 rounded-3xl border border-white/10 bg-white/5 p-10 backdrop-blur">
        <p className="text-sm uppercase tracking-[0.3em] text-cyan-200/70">
          Contest recap
        </p>
        <h1 className="text-4xl font-semibold text-white">{contest.title}</h1>
        {subtitle && <p className="text-lg text-white/70">{subtitle}</p>}
        {contest.description && (
          <p className="max-w-3xl text-white/70">{contest.description}</p>
        )}
        <div className="grid gap-4 text-xs uppercase tracking-[0.3em] text-white/50 sm:grid-cols-3">
          <ScheduleStat label="Run window" value={rangeLabel} />
          <ScheduleStat label="Finalized" value={endedLabel} />
          <ScheduleStat label="Match volume" value={`${contest.matchCount.toLocaleString()} battles`} />
        </div>
      </header>

      <section className="grid gap-6 lg:grid-cols-[1.4fr_1fr]">
        <div className="space-y-6 rounded-3xl border border-cyan-300/30 bg-cyan-300/10 p-10 backdrop-blur">
          <h2 className="text-2xl font-semibold text-cyan-100">Champion highlight</h2>
          {champion ? (
            <div className="grid gap-6 md:grid-cols-[2fr_3fr]">
              <div className="flex items-center justify-center rounded-3xl border border-white/20 bg-slate-950/60 p-6">
                <img
                  src={champion.logoImage}
                  alt={champion.logoName}
                  className="max-h-56 max-w-full object-contain"
                  loading="lazy"
                  decoding="async"
                />
              </div>
              <div className="space-y-4">
                <div className="space-y-1">
                  <p className="text-xs uppercase tracking-[0.35em] text-white/60">
                    #{1} overall
                  </p>
                  <h3 className="text-3xl font-semibold text-white">{champion.logoName}</h3>
                  <p className="text-xs uppercase tracking-[0.3em] text-white/40">{champion.logoCodename}</p>
                </div>
                <dl className="grid gap-4 text-sm text-white/80 sm:grid-cols-2">
                  <Stat label="Final rating" value={Math.round(champion.rating).toLocaleString()} />
                  <Stat label="Total matches" value={champion.matches.toLocaleString()} />
                  <Stat label="Wins" value={champion.wins.toLocaleString()} />
                  <Stat label="Losses" value={champion.losses.toLocaleString()} />
                </dl>
                {championInsights && (
                  <ChampionInsightsCard insights={championInsights} />
                )}
                {hasLiveVoting ? (
                  <Link
                    to="/scores"
                    className="inline-flex items-center gap-2 rounded-full border border-white/30 px-5 py-2 text-sm font-semibold text-white transition hover:border-cyan-200 hover:text-cyan-100"
                  >
                    View live standings
                    <span aria-hidden className="text-white/70">→</span>
                  </Link>
                ) : (
                  <p className="text-sm text-white/60">
                    Standings locked at the contest close.
                  </p>
                )}
              </div>
            </div>
          ) : (
            <p className="rounded-2xl border border-white/10 bg-slate-900/60 p-8 text-sm font-medium text-white/70">
              We didn&apos;t capture leaderboard data for this contest.
            </p>
          )}
        </div>
        <aside className="space-y-6 rounded-3xl border border-white/10 bg-white/5 p-8 backdrop-blur">
          <h2 className="text-xl font-semibold text-white">Contest stats</h2>
          <dl className="space-y-4 text-sm text-white/80">
            <Stat label="Participating logos" value={contest.logoCount.toLocaleString()} />
            <Stat label="Recorded matches" value={contest.matchCount.toLocaleString()} />
            <Stat label="Last matchup" value={endedLabel} />
          </dl>
          <div className={`rounded-2xl border p-4 text-xs uppercase tracking-[0.3em] ${hasLiveVoting ? 'border-emerald-300/40 bg-emerald-400/10 text-emerald-100' : 'border-white/10 bg-white/10 text-white/60'}`}>
            {hasLiveVoting
              ? 'Voting is currently open for this bracket.'
              : 'Voting is closed for this bracket.'}
          </div>
        </aside>
      </section>

      <section className="space-y-5">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="text-2xl font-semibold text-white">Top five finishers</h2>
            <p className="text-sm text-white/60">
              Final rankings captured at the close of the contest.
            </p>
          </div>
          <Link
            to="/gallery"
            className="inline-flex items-center gap-2 rounded-full border border-white/20 px-4 py-2 text-sm font-semibold text-white/70 transition hover:border-cyan-300 hover:text-cyan-200"
            aria-disabled
            tabIndex={-1}
          >
            Gallery locked
          </Link>
        </div>
        {topFive.length === 0 ? (
          <div className="rounded-3xl border border-white/10 bg-white/5 p-10 text-center text-white/70">
            Leaderboard data was not captured for this contest.
          </div>
        ) : (
          <ol className="space-y-4">
            {topFive.map((entry, index) => {
              const sizeClass =
                TOP_FIVE_IMAGE_SIZES[index] ??
                TOP_FIVE_IMAGE_SIZES[TOP_FIVE_IMAGE_SIZES.length - 1]

              return (
                <li
                  key={entry.logoId}
                  className="flex flex-col gap-4 rounded-3xl border border-white/10 bg-slate-900/60 p-5 sm:flex-row sm:items-center"
                >
                  <span className="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-full border border-cyan-200/40 bg-cyan-300/10 text-sm font-semibold text-cyan-100">
                    #{index + 1}
                  </span>
                  <img
                    src={entry.logoImage}
                    alt=""
                    className={`${sizeClass} flex-shrink-0 rounded-full border border-white/15 bg-slate-950/60 object-contain`}
                    loading="lazy"
                    decoding="async"
                  />
                  <div className="flex-1 space-y-2">
                    <div>
                      <p className="text-base font-semibold text-white">{entry.logoName}</p>
                      <p className="text-xs uppercase tracking-[0.3em] text-white/40">{entry.logoCodename}</p>
                    </div>
                    <div className="flex flex-wrap gap-3 text-xs text-white/60">
                      <span>{Math.round(entry.rating)} ELO</span>
                      <span>
                        {entry.wins}W · {entry.losses}L
                      </span>
                      <span>{entry.matches} matches</span>
                    </div>
                  </div>
                </li>
              )
            })}
          </ol>
        )}
      </section>

      {contest.leaderboard.length > 0 && (
        <section className="space-y-4">
          <h2 className="text-xl font-semibold text-white">Full leaderboard snapshot</h2>
          <div className="overflow-hidden rounded-3xl border border-white/10 bg-white/5">
            <table className="min-w-full divide-y divide-white/10 text-sm text-white/80">
              <thead className="bg-white/5 text-xs uppercase tracking-[0.3em] text-white/60">
                <tr>
                  <th className="px-5 py-3 text-left font-semibold">Rank</th>
                  <th className="px-5 py-3 text-left font-semibold">Logo</th>
                  <th className="px-5 py-3 text-left font-semibold">Rating</th>
                  <th className="px-5 py-3 text-left font-semibold">Matches</th>
                  <th className="px-5 py-3 text-left font-semibold">Wins</th>
                  <th className="px-5 py-3 text-left font-semibold">Losses</th>
                </tr>
              </thead>
              <tbody>
                {contest.leaderboard.map((entry, index) => (
                  <tr key={entry.logoId} className="border-white/5 odd:bg-slate-900/40">
                    <td className="px-5 py-4 font-semibold text-cyan-200">#{index + 1}</td>
                    <td className="px-5 py-4">
                      <div className="flex items-center gap-3">
                        <img
                          src={entry.logoImage}
                          alt=""
                          className="h-10 w-10 rounded-full border border-white/10 bg-slate-950/50 object-contain"
                          loading="lazy"
                          decoding="async"
                        />
                        <div>
                          <p className="font-semibold text-white">{entry.logoName}</p>
                          <p className="text-xs uppercase tracking-[0.3em] text-white/40">
                            {entry.logoCodename}
                          </p>
                        </div>
                      </div>
                    </td>
                    <td className="px-5 py-4 text-white">{Math.round(entry.rating)}</td>
                    <td className="px-5 py-4">{entry.matches}</td>
                    <td className="px-5 py-4 text-emerald-300">{entry.wins}</td>
                    <td className="px-5 py-4 text-rose-300">{entry.losses}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {!contest.isActive && (
        <section className="rounded-3xl border border-white/10 bg-white/5 p-8 text-center text-sm text-white/60">
          Looking for the next bracket? Keep an eye on the{' '}
          <Link
            to="/contests"
            className="font-semibold text-cyan-200 underline-offset-4 hover:underline"
          >
            contest timeline
          </Link>{' '}
          for fresh matchups.
        </section>
      )}
    </div>
  )
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-1">
      <span className="text-xs uppercase tracking-[0.3em] text-white/40">{label}</span>
      <span className="text-base font-semibold text-white">{value}</span>
    </div>
  )
}

function ScheduleStat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p>{label}</p>
      <p className="mt-1 text-sm font-semibold text-white">{value}</p>
    </div>
  )
}

function ChampionInsightsCard({ insights }: { insights: ChampionInsights }) {
  const { longestWinStreak, undefeatedOpponents, nemesis } = insights

  const entries: Array<{ label: string; content: ReactNode }> = []

  if (longestWinStreak) {
    entries.push({
      label: 'Longest winning streak',
      content: <span>{formatWinStreakLabel(longestWinStreak)}</span>,
    })
  }

  if (undefeatedOpponents.length > 0) {
    entries.push({
      label: 'Never lost to',
      content: (
        <div className="flex flex-wrap gap-2">
          {undefeatedOpponents.map((opponent) => (
            <span
              key={opponent.logoId}
              className="rounded-full border border-cyan-200/40 bg-cyan-300/10 px-2 py-1 text-[11px] font-semibold uppercase tracking-[0.25em] text-cyan-100"
            >
              {opponent.logoName}
              <span className="text-cyan-100/70"> ({opponent.wins}W)</span>
            </span>
          ))}
        </div>
      ),
    })
  }

  if (nemesis) {
    entries.push({
      label: 'Toughest opponent',
      content: <span>{formatNemesisLabel(nemesis)}</span>,
    })
  }

  if (entries.length === 0) {
    return null
  }

  return (
    <div className="space-y-4 rounded-2xl border border-cyan-300/25 bg-slate-950/50 p-5">
      <p className="text-xs uppercase tracking-[0.3em] text-cyan-200/70">Fun facts</p>
      <dl className="space-y-3">
        {entries.map((entry) => (
          <div key={entry.label} className="rounded-xl border border-white/10 bg-white/5 p-3">
            <dt className="text-[11px] uppercase tracking-[0.3em] text-white/50">{entry.label}</dt>
            <dd className="mt-1 text-sm text-white/80">{entry.content}</dd>
          </div>
        ))}
      </dl>
    </div>
  )
}

function formatWinStreakLabel(streak: ChampionWinStreak): string {
  const rangeLabel = formatStreakRange(streak)
  const matchLabel = `${streak.count} ${pluralize('match', streak.count)}`
  return rangeLabel ? `${matchLabel} · ${rangeLabel}` : matchLabel
}

function formatNemesisLabel(opponent: ChampionOpponentFact): string {
  const lossPart = `${opponent.losses} ${pluralize('loss', opponent.losses)}`
  const winPart = opponent.wins > 0 ? ` · ${opponent.wins} ${pluralize('win', opponent.wins)}` : ''
  return `${opponent.logoName} (${lossPart}${winPart})`
}

function formatStreakRange(streak: ChampionWinStreak): string | null {
  const { startedAt, endedAt } = streak
  if (!startedAt && !endedAt) {
    return null
  }

  const formatOptions: Intl.DateTimeFormatOptions = { month: 'short', day: 'numeric' }
  const startLabel = startedAt
    ? new Date(startedAt).toLocaleDateString(undefined, formatOptions)
    : null
  const endLabel = endedAt
    ? new Date(endedAt).toLocaleDateString(undefined, formatOptions)
    : null

  if (startLabel && endLabel) {
    return startLabel === endLabel ? startLabel : `${startLabel} – ${endLabel}`
  }

  return startLabel ?? endLabel
}

function pluralize(term: string, count: number): string {
  if (count === 1) {
    return term
  }

  const lower = term.toLowerCase()
  const irregular: Record<string, string> = {
    match: 'matches',
  }

  if (irregular[lower]) {
    return applyCase(term, irregular[lower])
  }

  if (/[^aeiou]y$/i.test(term)) {
    return term.replace(/y$/i, term === term.toUpperCase() ? 'IES' : 'ies')
  }

  if (/(s|x|z|ch|sh)$/i.test(term)) {
    if (term === term.toUpperCase()) {
      return `${term}ES`
    }
    return `${term}es`
  }

  return `${term}s`
}

function applyCase(source: string, value: string): string {
  if (source === source.toUpperCase()) {
    return value.toUpperCase()
  }

  if (source[0] === source[0].toUpperCase()) {
    return value.charAt(0).toUpperCase() + value.slice(1)
  }

  return value
}
