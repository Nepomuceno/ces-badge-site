import { createFileRoute, Link } from '@tanstack/react-router'
import { useMemo } from 'react'

import { useElo } from '../state/EloContext'
import { useLogoLibrary } from '../state/LogoLibraryContext'
import { useContest } from '../state/ContestContext'
import {
  DEFAULT_CONTEST_DESCRIPTION,
  DEFAULT_CONTEST_SUBTITLE,
  DEFAULT_CONTEST_TITLE,
} from '../lib/contest-utils'

export const Route = createFileRoute('/')({
  component: Home,
})

type CTAStyle = 'primary' | 'ghost' | 'outline'
type CTAPath =
  | '/vote'
  | '/gallery'
  | '/scores'
  | '/guidelines'
  | '/contests'
  | '/contest_results/$contestId'

interface CTAItem {
  to: CTAPath
  label: string
  variant: CTAStyle
  params?: { contestId: string }
}

interface LeaderCard {
  id: string
  name: string
  codename?: string
  rating: number
  wins: number
  losses: number
  matches: number
  rank: number
  source: 'live' | 'archived'
}

function Home() {
  const { rankings } = useElo()
  const { logos } = useLogoLibrary()
  const { contests, liveContest, hasLiveContest } = useContest()

  const resultsReadyContests = useMemo(
    () =>
      [...contests]
        .filter((contest) => contest.matchCount > 0 && !contest.votingOpen)
        .sort((a, b) => {
          const aTime = Date.parse(a.lastMatchAt ?? a.endsAt ?? a.updatedAt)
          const bTime = Date.parse(b.lastMatchAt ?? b.endsAt ?? b.updatedAt)
          return bTime - aTime
        }),
    [contests],
  )

  const archivedContests = useMemo(
    () =>
      [...contests]
        .filter((contest) => {
          if (contest.matchCount > 0 && !contest.votingOpen) {
            return true
          }
          if (contest.isActive && contest.votingOpen) {
            return false
          }
          if (contest.status === 'archived') {
            return true
          }
          if (contest.lastMatchAt || contest.endsAt) {
            return true
          }
          return contest.matchCount > 0
        })
        .sort((a, b) => {
          const aTime = Date.parse(a.lastMatchAt ?? a.endsAt ?? a.updatedAt)
          const bTime = Date.parse(b.lastMatchAt ?? b.endsAt ?? b.updatedAt)
          return bTime - aTime
        }),
    [contests],
  )

  const latestResultsContest = resultsReadyContests[0] ?? null
  const archivedShowcase = latestResultsContest ?? archivedContests[0] ?? null

  const leaders = useMemo<LeaderCard[]>(() => {
    if (hasLiveContest) {
      return rankings.slice(0, 3).map(({ logo, entry, rank }) => ({
        id: logo.id,
        name: logo.name,
        codename: logo.codename,
        rating: Math.round(entry.rating),
        wins: entry.wins,
        losses: entry.losses,
        matches: entry.matches,
        rank,
        source: 'live',
      }))
    }

    if (latestResultsContest) {
      return latestResultsContest.leaderboard.slice(0, 5).map((entry, index) => ({
        id: entry.logoId,
        name: entry.logoName,
        codename: entry.logoCodename,
        rating: Math.round(entry.rating),
        wins: entry.wins,
        losses: entry.losses,
        matches: entry.matches,
        rank: index + 1,
        source: 'archived',
      }))
    }

    return []
  }, [hasLiveContest, latestResultsContest, rankings])

  const heroContest = hasLiveContest ? liveContest : archivedShowcase

  const contestTitle = heroContest?.title?.trim() || DEFAULT_CONTEST_TITLE
  const contestSubtitle = hasLiveContest
    ? heroContest?.subtitle?.trim() || DEFAULT_CONTEST_SUBTITLE
    : latestResultsContest
      ? `${archivedShowcase.title} has wrapped—relive the finish and prep for the next arena.`
      : "We're prepping the next CES3 badge arena."
  const contestDescription = hasLiveContest
    ? heroContest?.description?.trim() || DEFAULT_CONTEST_DESCRIPTION
    : latestResultsContest
      ? `The ${latestResultsContest.title} bracket closed with ${leaders[0]?.name ?? 'a new champion'} on top. Explore the recap while we ready the next arena.`
      : 'Browse previous contests to see how the team crowned earlier champions and stay tuned for the return of voting.'

  const leaderHeading = hasLiveContest
    ? 'Current leaders'
    : latestResultsContest
      ? 'Latest podium'
      : 'Contest leaders'
  const leaderEmptyMessage = hasLiveContest
    ? 'Cast the very first vote to seed the leaderboard.'
    : "We'll publish the podium once the next contest closes."

  const featured = useMemo(
    () => logos.filter((logo) => logo.source === 'catalog').slice(0, 3),
    [logos],
  )

  const highlightCards = hasLiveContest
    ? [
        {
          title: 'Pairwise ELO voting',
          description:
            'Every matchup updates the live standings instantly. More votes simply make the ranking stronger.',
        },
        {
          title: 'Curated CES3 gallery',
          description:
            'Explore ready-to-ship marks crafted for executive decks, events, swag, and digital embeds.',
        },
        {
          title: 'Guidelines & usage tips',
          description:
            'Quick reminders on where each mark shines so your storytelling stays on brand and compliant.',
        },
      ]
    : [
        {
          title: 'Contest recap library',
          description:
            'Relive the latest arenas with champion highlights, final rankings, and match stats.',
        },
        {
          title: 'Contest timeline',
          description:
            'Track upcoming brackets and revisit archived showdowns to see how the badge evolved.',
        },
        {
          title: 'Guidelines & usage tips',
          description:
            'Even off-season, keep your decks and swag aligned with CES3 brand guidance.',
        },
      ]

  const archivedHighlights = useMemo(
    () => resultsReadyContests.slice(0, 2),
    [resultsReadyContests],
  )

  const ctas: CTAItem[] = hasLiveContest
    ? [
        { to: '/vote', label: 'Start voting', variant: 'primary' },
        { to: '/gallery', label: 'Browse gallery', variant: 'ghost' },
        { to: '/scores', label: 'View standings', variant: 'outline' },
      ]
    : latestResultsContest
      ? [
          {
            to: '/contest_results/$contestId',
            params: { contestId: latestResultsContest.id },
            label: 'See full recap',
            variant: 'primary',
          },
          { to: '/contests', label: 'Contest timeline', variant: 'ghost' },
          { to: '/guidelines', label: 'Review guidelines', variant: 'outline' },
        ]
      : [
          { to: '/contests', label: 'Contest timeline', variant: 'primary' },
          { to: '/scores', label: 'How rankings work', variant: 'ghost' },
          { to: '/guidelines', label: 'Review guidelines', variant: 'outline' },
        ]

  const variantClasses: Record<CTAStyle, string> = {
    primary:
      'rounded-full bg-cyan-400 px-6 py-3 text-base font-semibold text-slate-900 transition hover:bg-cyan-300',
    ghost:
      'rounded-full border border-white/40 px-6 py-3 text-base font-semibold text-white transition hover:border-cyan-300 hover:text-cyan-200',
    outline:
      'rounded-full border border-cyan-300/30 px-6 py-3 text-base font-semibold text-cyan-200 transition hover:border-cyan-200 hover:text-cyan-100',
  }

  return (
    <div className="space-y-16 pb-16 pt-12">
      <section className="grid gap-10 rounded-3xl border border-white/10 bg-white/5 p-12 backdrop-blur-xl md:grid-cols-[3fr_2fr]">
        <div className="space-y-6">
          <div className="flex flex-wrap items-center gap-3">
            <p className="inline-flex items-center gap-2 rounded-full border border-cyan-400/40 bg-cyan-400/10 px-4 py-2 text-sm font-semibold uppercase tracking-[0.3em] text-cyan-200">
              {contestTitle}
            </p>
            {!hasLiveContest && (
              <span className="inline-flex items-center rounded-full border border-white/20 bg-white/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.3em] text-white/60">
                Voting closed
              </span>
            )}
          </div>
          <h1 className="text-4xl font-bold leading-tight text-white md:text-5xl">
            {contestSubtitle}
          </h1>
          <p className="text-lg text-slate-200/80">{contestDescription}</p>
          <div className="flex flex-wrap gap-4 pt-4">
            {ctas.map((cta) => (
              <Link
                key={`${cta.to}-${cta.label}`}
                to={cta.to}
                params={cta.params}
                className={variantClasses[cta.variant]}
              >
                {cta.label}
              </Link>
            ))}
          </div>
        </div>
        <div className="flex flex-col gap-4 rounded-2xl border border-white/10 bg-slate-900/60 p-6">
          <h2 className="text-lg font-semibold text-cyan-200">{leaderHeading}</h2>
          <ol className="space-y-3">
            {leaders.map((entry) => (
              <li
                key={entry.id}
                className="flex items-center justify-between gap-3 rounded-xl border border-white/10 bg-white/5 px-4 py-3"
              >
                <div>
                  <p className="text-sm uppercase tracking-[0.3em] text-white/60">
                    #{entry.rank}
                  </p>
                  <p className="text-lg font-semibold text-white">{entry.name}</p>
                  {entry.codename && (
                    <p className="text-[11px] uppercase tracking-[0.3em] text-white/40">
                      {entry.codename}
                    </p>
                  )}
                </div>
                <div className="text-right text-sm font-medium text-cyan-200">
                  <p>
                    {entry.rating}{' '}
                    <span className="text-white/60">ELO</span>
                  </p>
                  <p className="text-[11px] uppercase tracking-[0.3em] text-white/40">
                    {entry.source === 'archived'
                      ? `${entry.wins}W · ${entry.losses}L`
                      : `${entry.matches} matches`}
                  </p>
                </div>
              </li>
            ))}
            {leaders.length === 0 && (
              <li className="rounded-xl border border-white/10 bg-white/5 px-4 py-6 text-sm text-white/70">
                {leaderEmptyMessage}
              </li>
            )}
          </ol>
          {!hasLiveContest && latestResultsContest && (
            <Link
              to="/contest_results/$contestId"
              params={{ contestId: latestResultsContest.id }}
              className="mt-2 inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.3em] text-cyan-200 transition hover:text-cyan-100"
            >
              See top five
              <span aria-hidden>→</span>
            </Link>
          )}
        </div>
      </section>

      <section className="grid gap-8 md:grid-cols-3">
        {highlightCards.map((item) => (
          <article
            key={item.title}
            className="rounded-2xl border border-white/10 bg-white/5 p-6 shadow-lg backdrop-blur"
          >
            <h3 className="text-xl font-semibold text-white">{item.title}</h3>
            <p className="mt-2 text-sm leading-relaxed text-slate-200/80">
              {item.description}
            </p>
          </article>
        ))}
      </section>

      {hasLiveContest && featured.length > 0 && (
        <section className="space-y-6 rounded-3xl border border-cyan-300/30 bg-cyan-300/10 p-10">
          <h2 className="text-2xl font-semibold text-cyan-100">Featured variants</h2>
          <div className="grid gap-6 md:grid-cols-3">
            {featured.map((logo) => (
              <Link
                key={logo.id}
                to="/logos/$logoId"
                params={{ logoId: logo.id }}
                className="group overflow-hidden rounded-2xl border border-white/10 bg-slate-900/60 shadow-lg transition hover:-translate-y-1 hover:border-cyan-200/60"
              >
                <div className="flex h-40 w-full items-center justify-center bg-slate-950/40">
                  <img
                    src={logo.image}
                    alt={logo.name}
                    className="max-h-full max-w-full object-contain"
                    loading="lazy"
                  />
                </div>
                <div className="space-y-2 p-5">
                  <p className="text-xs uppercase tracking-[0.25em] text-white/60">
                    {logo.codename}
                  </p>
                  <p className="text-lg font-semibold text-white">{logo.name}</p>
                  {logo.description && (
                    <p className="text-sm text-slate-200/80 line-clamp-3">
                      {logo.description}
                    </p>
                  )}
                </div>
              </Link>
            ))}
          </div>
        </section>
      )}

      {!hasLiveContest && archivedHighlights.length > 0 && (
        <section className="space-y-6 rounded-3xl border border-white/10 bg-white/5 p-10">
          <h2 className="text-2xl font-semibold text-white">Recent contest highlights</h2>
          <div className="grid gap-6 md:grid-cols-2">
            {archivedHighlights.map((contest) => {
              const champion = contest.leaderboard[0] ?? null
              const closedDate = contest.lastMatchAt
                ? new Date(contest.lastMatchAt).toLocaleDateString(undefined, {
                    month: 'short',
                    day: 'numeric',
                    year: 'numeric',
                  })
                : null
              const closedLabel = closedDate ? `Closed ${closedDate}` : 'Awaiting recap'
              return (
                <Link
                  key={contest.id}
                  to="/contest_results/$contestId"
                  params={{ contestId: contest.id }}
                  className="group flex flex-col overflow-hidden rounded-2xl border border-white/10 bg-slate-900/60 shadow-lg transition hover:-translate-y-1 hover:border-cyan-200/60"
                >
                  <div className="flex h-40 items-center justify-center bg-slate-950/40">
                    {champion ? (
                      <img
                        src={champion.logoImage}
                        alt={champion.logoName}
                        className="max-h-full max-w-full object-contain transition group-hover:scale-[1.02]"
                        loading="lazy"
                        decoding="async"
                      />
                    ) : (
                      <span className="text-sm font-semibold uppercase tracking-[0.3em] text-white/40">
                        Recap pending
                      </span>
                    )}
                  </div>
                  <div className="space-y-2 p-5">
                    <p className="text-xs uppercase tracking-[0.3em] text-white/40">
                      {closedLabel}
                    </p>
                    <h3 className="text-lg font-semibold text-white">{contest.title}</h3>
                    <p className="text-sm text-white/70">
                      {champion ? (
                        <>
                          Champion:{' '}
                          <span className="font-semibold text-white">
                            {champion.logoName}
                          </span>
                        </>
                      ) : (
                        'Leaderboard snapshot available inside the recap.'
                      )}
                    </p>
                  </div>
                </Link>
              )
            })}
          </div>
        </section>
      )}
    </div>
  )
}
