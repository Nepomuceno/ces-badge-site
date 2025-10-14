import { createFileRoute, Link } from '@tanstack/react-router'
import { useCallback, useMemo, useState } from 'react'

import { useElo } from '../state/EloContext'
import { useAuth } from '../state/AuthContext'
import { hashAliasForVoting } from '../lib/auth-utils'
import { SignInPrompt } from '../components/AuthPrompts'
import { calculateTotalMatches } from '../lib/elo-engine'
import { useContest } from '../state/ContestContext'

export const Route = createFileRoute('/vote')({
  component: VotePage,
})

function VotePage() {
  const { user, isAuthenticated, loading } = useAuth()
  const { currentMatchup, selectWinner, skipMatchup, ratings } = useElo()
  const { liveContest, activeContest } = useContest()
  const [isSubmitting, setIsSubmitting] = useState(false)

  const totalMatches = useMemo(() => calculateTotalMatches(ratings), [ratings])

  const handleVote = useCallback(
    async (winnerId: string, loserId: string) => {
      if (!currentMatchup) return
      setIsSubmitting(true)
      try {
        let voterHash: string | null = null
        if (user?.alias) {
          try {
            const hashed = await hashAliasForVoting(user.alias)
            voterHash = hashed || null
          } catch (error) {
            console.error('Failed to hash voter identity', error)
            voterHash = null
          }
        }
        await selectWinner(winnerId, loserId, voterHash)
      } finally {
        setIsSubmitting(false)
      }
    },
    [currentMatchup, selectWinner, user],
  )

  if (!liveContest) {
    const fallbackTitle = activeContest?.title ?? 'the next CES3 contest'
    return (
      <div className="mx-auto max-w-3xl space-y-6 rounded-3xl border border-white/10 bg-white/5 p-12 text-center backdrop-blur">
        <h1 className="text-3xl font-semibold text-white">Voting is currently closed</h1>
        <p className="text-white/70">
          We&apos;ll reopen the arena when {fallbackTitle} goes live. In the meantime, explore past champions and upcoming matchups.
        </p>
        <div className="flex flex-wrap justify-center gap-3 pt-2">
          <Link
            to="/contests"
            className="rounded-full border border-cyan-300/40 px-5 py-2 text-sm font-semibold text-cyan-200 transition hover:border-cyan-200 hover:text-cyan-100"
          >
            View contest timeline
          </Link>
        </div>
      </div>
    )
  }

  if (loading) {
    return (
      <div className="mx-auto max-w-3xl space-y-6 rounded-3xl border border-white/10 bg-white/5 p-12 text-center backdrop-blur">
        <h1 className="text-3xl font-semibold text-white">Checking your access…</h1>
        <p className="text-white/70">Hang tight while we confirm your CES3 roster status.</p>
      </div>
    )
  }

  if (!isAuthenticated) {
    return (
      <SignInPrompt
        heading="Sign in to cast your vote"
        description="Enter your name and alias to join the CES3 matchups. Admins can use the password flow."
      />
    )
  }

  if (!currentMatchup) {
    return (
      <div className="mx-auto max-w-3xl space-y-6 rounded-3xl border border-white/10 bg-white/5 p-12 text-center backdrop-blur">
        <h1 className="text-3xl font-semibold text-white">
          We need more logos to generate matchups.
        </h1>
        <p className="text-white/70">
          Add additional variants to the catalog to compare designs side-by-side.
        </p>
      </div>
    )
  }

  return (
    <div className="space-y-12">
      <section className="space-y-10">
        <header className="space-y-3">
          <p className="text-sm uppercase tracking-[0.3em] text-cyan-200/70">
            Round in progress
          </p>
          <h1 className="text-4xl font-semibold text-white">
            Which logo feels more CES3?
          </h1>
          <p className="text-white/70">
            Choose the mark that best represents the team’s mission. Head to the standings page any time to see how your picks shape the overall rankings.
          </p>
        </header>

        <div className="relative">
          <div
            className="flex snap-x snap-mandatory gap-4 overflow-x-auto pb-6 [-ms-overflow-style:none] [scrollbar-width:none] sm:grid sm:snap-none sm:grid-cols-2 sm:gap-8 sm:overflow-visible sm:pb-0 [&::-webkit-scrollbar]:hidden"
            aria-live="polite"
          >
            {[currentMatchup.primary, currentMatchup.challenger].map((logo) => (
            <button
              key={logo.id}
              type="button"
              disabled={isSubmitting}
              onClick={() => {
                const winnerId = logo.id
                const loserId =
                  winnerId === currentMatchup.primary.id
                    ? currentMatchup.challenger.id
                    : currentMatchup.primary.id
                handleVote(winnerId, loserId)
              }}
              className="group flex min-w-[18.5rem] snap-center flex-col overflow-hidden rounded-3xl border border-white/15 bg-slate-900/70 text-left shadow-2xl transition hover:border-cyan-300/60 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-cyan-400 sm:min-w-0 sm:hover:-translate-y-1"
            >
              <div className="relative flex h-48 w-full items-center justify-center bg-slate-950/40 sm:h-64">
                <img
                  src={logo.image}
                  alt={logo.name}
                  className="max-h-full max-w-full object-contain"
                  loading="lazy"
                />
              </div>
              <div className="flex flex-1 flex-col gap-3 p-6">
                <div className="flex items-center justify-between text-xs uppercase tracking-[0.3em] text-white/50">
                  <span className="rounded-full border border-white/20 bg-white/5 px-3 py-1 text-[0.6rem] font-semibold text-white/70">
                    {logo.codename}
                  </span>
                  {logo.ownerAlias && (
                    <span className="text-[0.55rem] text-white/40">@{logo.ownerAlias}</span>
                  )}
                </div>
                <div className="space-y-2">
                  <h2 className="text-lg font-semibold text-white sm:text-xl">{logo.name}</h2>
                  {logo.description && (
                    <p className="text-xs text-white/70 sm:text-sm">
                      {logo.description}
                    </p>
                  )}
                </div>
                <div className="pt-3">
                  <span className="inline-flex items-center gap-2 rounded-full bg-cyan-400 px-4 py-2 text-sm font-semibold text-slate-900 shadow-lg transition group-hover:bg-cyan-300">
                    Choose {logo.codename}
                  </span>
                </div>
              </div>
            </button>
          ))}
          </div>
          <div className="pointer-events-none absolute inset-y-0 left-0 w-8 bg-gradient-to-r from-[#060d1c] via-[#060d1c]/70 to-transparent sm:hidden" aria-hidden />
          <div className="pointer-events-none absolute inset-y-0 right-0 w-8 bg-gradient-to-l from-[#060d1c] via-[#060d1c]/70 to-transparent sm:hidden" aria-hidden />
          <div className="mt-2 flex items-center justify-center gap-2 text-xs text-white/50 sm:hidden">
            <span className="inline-flex items-center gap-1 rounded-full border border-white/20 bg-white/5 px-3 py-1 font-medium text-white/70">
              Swipe to compare
            </span>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-4 text-sm text-white/60">
          <button
            type="button"
            className="rounded-full border border-white/20 px-4 py-2 font-medium transition hover:border-cyan-300 hover:text-cyan-200"
            onClick={() => skipMatchup()}
            disabled={isSubmitting}
          >
            Skip matchup
          </button>
          <p>Votes recorded: {totalMatches.toLocaleString()}</p>
          <Link
            to="/scores"
            className="inline-flex items-center gap-2 rounded-full border border-cyan-300/40 px-4 py-2 font-semibold text-cyan-200 transition hover:border-cyan-200 hover:text-cyan-100"
          >
            View standings
            <span aria-hidden className="text-cyan-200/60">→</span>
          </Link>
        </div>
      </section>
    </div>
  )
}
