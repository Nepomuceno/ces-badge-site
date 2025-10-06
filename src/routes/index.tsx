import { createFileRoute, Link } from '@tanstack/react-router'
import { useMemo } from 'react'

import { useElo } from '../state/EloContext'
import { useLogoLibrary } from '../state/LogoLibraryContext'
import { useContest } from '../state/ContestContext'
import { DEFAULT_CONTEST_TITLE } from '../lib/contest-utils'

export const Route = createFileRoute('/')({
  component: Home,
})

function Home() {
  const { rankings } = useElo()
  const { logos } = useLogoLibrary()
  const { selectedContest, activeContest } = useContest()
  const contest = selectedContest ?? activeContest

  const contestTitle = contest?.title?.trim() || DEFAULT_CONTEST_TITLE
  const contestSubtitle =
    contest?.subtitle?.trim() || 'Vote, compare, and crown the next CES3 identity.'
  const contestDescription =
    contest?.description?.trim() ||
    'We use pairwise matchups powered by an ELO ranking system so every comparison matters. Cast as many votes as you like—our board keeps the standings fair no matter how big the crowd.'

  const leaders = useMemo(() => rankings.slice(0, 3), [rankings])
  const featured = useMemo(
    () => logos.filter((logo) => logo.source === 'catalog').slice(0, 3),
    [logos],
  )

  return (
    <div className="space-y-16 pb-16 pt-12">
      <section className="grid gap-10 rounded-3xl border border-white/10 bg-white/5 p-12 backdrop-blur-xl md:grid-cols-[3fr_2fr]">
        <div className="space-y-6">
          <p className="inline-flex items-center gap-2 rounded-full border border-cyan-400/40 bg-cyan-400/10 px-4 py-2 text-sm font-semibold uppercase tracking-[0.3em] text-cyan-200">
            {contestTitle}
          </p>
          <h1 className="text-4xl font-bold leading-tight text-white md:text-5xl">
            {contestSubtitle}
          </h1>
          <p className="text-lg text-slate-200/80">
            {contestDescription}
          </p>
          <div className="flex flex-wrap gap-4 pt-4">
            <Link
              to="/vote"
              className="rounded-full bg-cyan-400 px-6 py-3 text-base font-semibold text-slate-900 transition hover:bg-cyan-300"
            >
              Start voting
            </Link>
            <Link
              to="/gallery"
              className="rounded-full border border-white/40 px-6 py-3 text-base font-semibold text-white transition hover:border-cyan-300 hover:text-cyan-200"
            >
              Browse gallery
            </Link>
            <Link
              to="/scores"
              className="rounded-full border border-cyan-300/30 px-6 py-3 text-base font-semibold text-cyan-200 transition hover:border-cyan-200 hover:text-cyan-100"
            >
              View standings
            </Link>
          </div>
        </div>
        <div className="flex flex-col gap-4 rounded-2xl border border-white/10 bg-slate-900/60 p-6">
          <h2 className="text-lg font-semibold text-cyan-200">Current leaders</h2>
          <ol className="space-y-3">
            {leaders.map(({ logo, entry, rank }) => (
              <li
                key={logo.id}
                className="flex items-center justify-between rounded-xl border border-white/10 bg-white/5 px-4 py-3"
              >
                <div>
                  <p className="text-sm uppercase tracking-[0.3em] text-white/60">#{rank}</p>
                  <p className="text-lg font-semibold text-white">{logo.name}</p>
                </div>
                <p className="text-sm font-medium text-cyan-200">
                  {Math.round(entry.rating)} <span className="text-white/60">ELO</span>
                </p>
              </li>
            ))}
            {leaders.length === 0 && (
              <li className="rounded-xl border border-white/10 bg-white/5 px-4 py-6 text-sm text-white/70">
                Cast the very first vote to seed the leaderboard.
              </li>
            )}
          </ol>
        </div>
      </section>
      <section className="grid gap-8 md:grid-cols-3">
        {[{
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
        }].map((item) => (
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

      <section className="space-y-6 rounded-3xl border border-cyan-300/30 bg-cyan-300/10 p-10">
        <h2 className="text-2xl font-semibold text-cyan-100">Featured variants</h2>
        <div className="grid gap-6 md:grid-cols-3">
          {featured.map((logo) => (
            <Link
              key={logo.id}
              to="/gallery/$logoId"
              params={{ logoId: logo.id }}
              className="group overflow-hidden rounded-2xl border border-white/10 bg-slate-900/60 shadow-lg transition hover:-translate-y-1 hover:border-cyan-200/60"
            >
              <img
                src={logo.image}
                alt={logo.name}
                className="h-40 w-full object-cover"
                loading="lazy"
              />
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
    </div>
  )
}
