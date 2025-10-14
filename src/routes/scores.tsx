import { createFileRoute, Link } from '@tanstack/react-router'
import { useEffect, useMemo, useState } from 'react'

import { useElo } from '../state/EloContext'
import { useLogoLibrary } from '../state/LogoLibraryContext'
import { useAuth } from '../state/AuthContext'
import { SignInPrompt } from '../components/AuthPrompts'
import { hashAliasForVoting } from '../lib/auth-utils'
import { calculateTotalMatches } from '../lib/elo-engine'
import { useContest } from '../state/ContestContext'

export const Route = createFileRoute('/scores')({
  component: ScoresPage,
})

function ScoresPage() {
  const { user, isAuthenticated, loading } = useAuth()
  const { rankings, recentHistory, ratings } = useElo()
  const { logos } = useLogoLibrary()
  const { liveContest, activeContest } = useContest()
  const [myVoteHash, setMyVoteHash] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    async function computeHash() {
      if (!user?.alias) {
        setMyVoteHash(null)
        return
      }
      try {
        const hash = await hashAliasForVoting(user.alias)
        if (!cancelled) {
          setMyVoteHash(hash || null)
        }
      } catch (error) {
        console.error('Failed to hash voter identity', error)
        if (!cancelled) {
          setMyVoteHash(null)
        }
      }
    }
    computeHash()
    return () => {
      cancelled = true
    }
  }, [user?.alias])

  const totalMatches = useMemo(() => calculateTotalMatches(ratings), [ratings])
  const averageRating = useMemo(() => {
    const values = Object.values(ratings)
    if (values.length === 0) {
      return 0
    }
    const sum = values.reduce((acc, entry) => acc + entry.rating, 0)
    return Math.round(sum / values.length)
  }, [ratings])

  const logoLookup = useMemo(() => new Map(logos.map((logo) => [logo.id, logo])), [logos])

  const recent = useMemo(() => recentHistory.slice(0, 10), [recentHistory])

  if (!liveContest) {
    const fallbackTitle = activeContest?.title ?? 'recent contests'
    return (
      <div className="mx-auto max-w-3xl space-y-6 rounded-3xl border border-white/10 bg-white/5 p-12 text-center backdrop-blur">
        <h1 className="text-3xl font-semibold text-white">Standings are currently archived</h1>
        <p className="text-white/70">
          We&apos;ll publish live ELO rankings when the next contest opens. Until then, revisit {fallbackTitle} in the contest timeline.
        </p>
        <div className="flex justify-center pt-2">
          <Link
            to="/contests"
            className="rounded-full border border-cyan-300/40 px-5 py-2 text-sm font-semibold text-cyan-200 transition hover:border-cyan-200 hover:text-cyan-100"
          >
            Browse contest recaps
          </Link>
        </div>
      </div>
    )
  }

  if (loading) {
    return (
      <div className="mx-auto max-w-3xl space-y-6 rounded-3xl border border-white/10 bg-white/5 p-12 text-center backdrop-blur">
        <h1 className="text-3xl font-semibold text-white">Loading standings…</h1>
      </div>
    )
  }

  if (!isAuthenticated) {
    return (
      <SignInPrompt
        heading="Sign in to see CES3 standings"
        description="Enter your alias to unlock live rating data and matchup history."
      />
    )
  }

  return (
    <div className="space-y-12 pb-16">
      <header className="space-y-6 rounded-3xl border border-white/10 bg-white/5 p-10 backdrop-blur">
        <p className="text-sm uppercase tracking-[0.3em] text-cyan-200/70">
          CES3 standings
        </p>
        <h1 className="text-4xl font-semibold text-white">Live ELO scoreboard</h1>
        <p className="text-white/70">
          Every vote updates this board in real time. Share it before reviews or all-hands to highlight which marks are trending across the team.
        </p>
        <div className="grid gap-6 md:grid-cols-3">
          <StatCard label="Total matchups" value={totalMatches.toLocaleString()} subtle="Since local tracking began" />
          <StatCard label="Average rating" value={averageRating.toLocaleString()} subtle="Baseline is 1500" />
          <StatCard label="Catalog depth" value={rankings.length.toString()} subtle="Active logos in rotation" />
        </div>
      </header>

      <section className="space-y-6">
        <h2 className="text-2xl font-semibold text-white">Top rankings</h2>
        <div className="overflow-hidden rounded-3xl border border-white/10 bg-white/5">
          <table className="min-w-full divide-y divide-white/10 text-sm text-white/80">
            <thead className="bg-white/5 text-xs uppercase tracking-[0.3em] text-white/60">
              <tr>
                <th className="px-6 py-4 text-left font-semibold">Rank</th>
                <th className="px-6 py-4 text-left font-semibold">Logo</th>
                <th className="px-6 py-4 text-left font-semibold">Rating</th>
                <th className="px-6 py-4 text-left font-semibold">Matches</th>
                <th className="px-6 py-4 text-left font-semibold">Wins</th>
                <th className="px-6 py-4 text-left font-semibold">Losses</th>
              </tr>
            </thead>
            <tbody>
              {rankings.map(({ logo, entry, rank }) => (
                <tr key={logo.id} className="border-white/5 odd:bg-slate-900/40">
                  <td className="px-6 py-4 font-semibold text-cyan-200">#{rank}</td>
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-3">
                      <img
                        src={logo.image}
                        alt=""
                        className="h-10 w-10 rounded-full border border-white/10 bg-slate-900/60 object-contain"
                        loading="lazy"
                      />
                      <div>
                        <p className="font-semibold text-white">{logo.name}</p>
                        <p className="text-xs uppercase tracking-[0.3em] text-white/40">{logo.codename}</p>
                      </div>
                    </div>
                  </td>
                  <td className="px-6 py-4 text-white">{Math.round(entry.rating)}</td>
                  <td className="px-6 py-4">{entry.matches}</td>
                  <td className="px-6 py-4 text-emerald-300">{entry.wins}</td>
                  <td className="px-6 py-4 text-rose-300">{entry.losses}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {rankings.length === 0 && (
            <p className="px-6 py-10 text-center text-white/70">
              No entries yet—start voting to populate the board.
            </p>
          )}
        </div>
      </section>

      <section className="space-y-6">
        <h2 className="text-2xl font-semibold text-white">Recent matchups</h2>
        <div className="grid gap-4 md:grid-cols-2">
          {recent.map((match) => {
            const winner = logoLookup.get(match.winnerId)
            const loser = logoLookup.get(match.loserId)
            if (!winner || !loser) {
              return null
            }
            const timestamp = new Date(match.timestamp)
            const voterHash = match.voterHash ?? null
            const isYou = voterHash && myVoteHash && voterHash === myVoteHash
            const voterLabel = voterHash
              ? isYou
                ? 'You voted'
                : `Voter ${voterHash.slice(0, 8)}`
              : 'Anonymous voter'
            return (
              <article
                key={`${match.winnerId}-${match.loserId}-${match.timestamp}`}
                className="rounded-3xl border border-white/10 bg-slate-900/50 p-6"
              >
                <p className="text-xs uppercase tracking-[0.3em] text-white/40">
                  {timestamp.toLocaleString()}
                </p>
                <p className="mt-3 text-sm text-white/70">
                  <span className="font-semibold text-white">{winner.name}</span> defeated{' '}
                  <span className="font-semibold text-white">{loser.name}</span>
                </p>
                <p className="mt-2 text-xs uppercase tracking-[0.25em] text-cyan-200/70">
                  {voterLabel}
                </p>
              </article>
            )
          })}
          {recent.length === 0 && (
            <p className="rounded-3xl border border-white/10 bg-white/5 p-10 text-center text-white/70">
              Match history populates after your first few votes.
            </p>
          )}
        </div>
      </section>
    </div>
  )
}

function StatCard({
  label,
  value,
  subtle,
}: {
  label: string
  value: string
  subtle?: string
}) {
  return (
    <div className="rounded-2xl border border-white/10 bg-slate-900/60 p-6">
      <p className="text-xs uppercase tracking-[0.3em] text-white/50">{label}</p>
      <p className="mt-2 text-3xl font-semibold text-white">{value}</p>
      {subtle && <p className="mt-1 text-xs text-white/40">{subtle}</p>}
    </div>
  )
}
