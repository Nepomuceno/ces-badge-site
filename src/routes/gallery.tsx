import { createFileRoute, Link } from '@tanstack/react-router'
import { useMemo, useState } from 'react'

import { LogoCard } from '../components/LogoCard'
import { useFavorites } from '../state/FavoritesContext'
import { useLogoLibrary } from '../state/LogoLibraryContext'
import { useContest } from '../state/ContestContext'

export const Route = createFileRoute('/gallery')({
  component: GalleryPage,
})

function GalleryPage() {
  const [query, setQuery] = useState('')
  const { favorites, toggleFavorite } = useFavorites()
  const { logos } = useLogoLibrary()
  const { liveContest, contests, activeContest } = useContest()
  const latestResultsContest = useMemo(() => {
    if (liveContest) {
      return null
    }

    const candidates = contests
      .filter((contest) => contest.matchCount > 0)
      .sort((a, b) => {
        const aTime = Date.parse(a.lastMatchAt ?? a.endsAt ?? a.updatedAt)
        const bTime = Date.parse(b.lastMatchAt ?? b.endsAt ?? b.updatedAt)
        return bTime - aTime
      })

    if (activeContest && activeContest.matchCount > 0) {
      return activeContest
    }

    return candidates[0] ?? null
  }, [activeContest, contests, liveContest])

  const normalizedQuery = query.trim().toLowerCase()

  const filtered = useMemo(() => {
    return logos.filter((logo) => {
      if (normalizedQuery.length === 0) {
        return true
      }

      const descriptionText = logo.description?.toLowerCase() ?? ''

      return (
        logo.name.toLowerCase().includes(normalizedQuery) ||
        descriptionText.includes(normalizedQuery) ||
        logo.codename.toLowerCase().includes(normalizedQuery) ||
        logo.ownerAlias?.includes(normalizedQuery)
      )
    })
  }, [logos, normalizedQuery])

  if (!liveContest) {
    const champion = latestResultsContest?.leaderboard[0] ?? null
    const podium = (latestResultsContest?.leaderboard.slice(0, 3) ?? []).map((entry, index) => ({
      rank: index + 1,
      ...entry,
    }))
    return (
      <div className="space-y-8 pb-10">
        <header className="space-y-6 rounded-3xl border border-white/10 bg-white/5 p-10 text-center backdrop-blur">
          <p className="text-sm uppercase tracking-[0.3em] text-cyan-200/70">Gallery offline</p>
          <h1 className="text-3xl font-semibold text-white">
            Voting is closed, but the recap is ready
          </h1>
          <p className="text-white/70">
            The gallery reopens when the next contest goes live. Until then, explore the latest badge
            results and relive the final matchups.
          </p>
          <div className="flex flex-wrap justify-center gap-3 pt-2">
            {latestResultsContest ? (
              <Link
                to="/contest_results/$contestId"
                params={{ contestId: latestResultsContest.id }}
                className="rounded-full bg-cyan-400 px-5 py-2 text-sm font-semibold text-slate-900 transition hover:bg-cyan-300"
              >
                View contest results
              </Link>
            ) : null}
            <Link
              to="/contests"
              className="rounded-full border border-cyan-300/40 px-5 py-2 text-sm font-semibold text-cyan-200 transition hover:border-cyan-200 hover:text-cyan-100"
            >
              Contest timeline
            </Link>
          </div>
        </header>
        {latestResultsContest && (
          <section className="space-y-6 rounded-3xl border border-cyan-300/30 bg-cyan-300/10 p-8 backdrop-blur">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div className="space-y-2 text-left">
                <p className="text-xs uppercase tracking-[0.3em] text-white/60">
                  {latestResultsContest.lastMatchAt
                    ? `Closed ${new Date(latestResultsContest.lastMatchAt).toLocaleDateString()}`
                    : 'Contest recap'}
                </p>
                <h2 className="text-2xl font-semibold text-white">{latestResultsContest.title}</h2>
                {latestResultsContest.subtitle && (
                  <p className="text-sm text-white/70">{latestResultsContest.subtitle}</p>
                )}
              </div>
              <Link
                to="/contest_results/$contestId"
                params={{ contestId: latestResultsContest.id }}
                className="inline-flex items-center gap-2 rounded-full border border-white/30 px-4 py-2 text-xs font-semibold uppercase tracking-[0.3em] text-white transition hover:border-white/60 hover:text-cyan-100"
              >
                See full recap
                <span aria-hidden>→</span>
              </Link>
            </div>
            {champion ? (
              <div className="grid gap-6 md:grid-cols-[1fr_2fr]">
                <div className="flex items-center justify-center rounded-3xl border border-white/20 bg-slate-950/60 p-6">
                  <img
                    src={champion.logoImage}
                    alt={champion.logoName}
                    className="max-h-48 max-w-full object-contain"
                    loading="lazy"
                  />
                </div>
                <div className="space-y-6">
                  <div>
                    <p className="text-xs uppercase tracking-[0.3em] text-white/60">Champion</p>
                    <h3 className="text-3xl font-semibold text-white">{champion.logoName}</h3>
                    <p className="text-xs uppercase tracking-[0.3em] text-white/40">
                      {champion.logoCodename}
                    </p>
                  </div>
                  <dl className="grid gap-4 text-sm text-white/80 sm:grid-cols-3">
                    <Stat label="Final rating" value={Math.round(champion.rating).toLocaleString()} />
                    <Stat label="Wins" value={champion.wins.toLocaleString()} />
                    <Stat label="Matches" value={champion.matches.toLocaleString()} />
                  </dl>
                </div>
              </div>
            ) : null}
            {podium.length > 0 && (
              <div>
                <h3 className="text-xs uppercase tracking-[0.3em] text-white/50">Podium</h3>
                <ul className="mt-3 grid gap-3 md:grid-cols-3">
                  {podium.map((entry) => (
                    <li
                      key={entry.logoId}
                      className="flex flex-col gap-3 rounded-2xl border border-white/15 bg-white/5 p-4 text-left"
                    >
                      <div className="flex items-center justify-between">
                        <span className="text-sm font-semibold text-cyan-100">
                          #{entry.rank}
                        </span>
                        <span className="text-xs uppercase tracking-[0.3em] text-white/50">
                          {Math.round(entry.rating)} ELO
                        </span>
                      </div>
                      <div className="flex items-center gap-3">
                        <img
                          src={entry.logoImage}
                          alt=""
                          className="h-12 w-12 flex-shrink-0 rounded-full border border-white/15 bg-slate-950/50 object-contain"
                          loading="lazy"
                          decoding="async"
                        />
                        <div className="space-y-1">
                          <p className="text-sm font-semibold text-white">{entry.logoName}</p>
                          <p className="text-[11px] uppercase tracking-[0.3em] text-white/40">
                            {entry.logoCodename}
                          </p>
                          <p className="text-[11px] uppercase tracking-[0.25em] text-white/40">
                            {entry.wins}W · {entry.losses}L
                          </p>
                        </div>
                      </div>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </section>
        )}
      </div>
    )
  }

  return (
    <div className="space-y-10 pb-10">
      <header className="space-y-4">
        <p className="text-sm uppercase tracking-[0.3em] text-cyan-200/70">
          CES3 design catalog
        </p>
        <h1 className="text-4xl font-semibold text-white">Explore every mark</h1>
        <p className="text-white/70">
          Browse the latest CES3 logos and save favorites to build your shortlist for executive review.
        </p>
        <div className="flex flex-wrap gap-4 pt-4">
          <input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search by name, codename, or owner..."
            className="w-full max-w-md rounded-full border border-white/20 bg-slate-900/70 px-5 py-3 text-sm text-white outline-none transition placeholder:text-white/40 focus:border-cyan-300"
          />
          <button
            type="button"
            onClick={() => {
              setQuery('')
            }}
            className="rounded-full border border-white/20 px-5 py-3 text-sm font-semibold text-white transition hover:border-cyan-300 hover:text-cyan-200"
          >
            Reset
          </button>
        </div>
      </header>

      <section className="grid gap-8 md:grid-cols-2 xl:grid-cols-3">
        {filtered.map((logo) => (
          <LogoCard
            key={logo.id}
            logo={logo}
            isFavorite={favorites.has(logo.id)}
            onFavoriteToggle={toggleFavorite}
          />
        ))}
        {filtered.length === 0 && (
          <div className="rounded-3xl border border-white/10 bg-white/5 p-12 text-center text-white/70">
            No logos match that search yet—try another term.
          </div>
        )}
      </section>
    </div>
  )
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="space-y-1">
      <p className="text-[11px] uppercase tracking-[0.3em] text-white/50">{label}</p>
      <p className="text-base font-semibold text-white">{value}</p>
    </div>
  )
}
