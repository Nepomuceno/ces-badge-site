import { createFileRoute, notFound } from '@tanstack/react-router'
import { useMemo } from 'react'

import { logoCatalog } from '../data/logo-catalog'
import { useFavorites } from '../state/FavoritesContext'
import { useElo } from '../state/EloContext'
import { useLogoLibrary } from '../state/LogoLibraryContext'

export const Route = createFileRoute('/gallery/$logoId')({
  loader: ({ params }) => ({ logoId: params.logoId }),
  head: ({ params }) => {
    const logo = logoCatalog.find((item) => item.id === params.logoId)
    if (!logo) {
      return {
        meta: [
          {
            title: 'Logo not found | CES3 Badge Arena',
          },
        ],
      }
    }
    const description =
      logo.description ?? 'Discover this CES3 badge contender inside the arena.'
    const previewImage = logo.image

    return {
      meta: [
        {
          title: `${logo.name} | CES3 Badge Arena`,
        },
        {
          name: 'description',
          content: description,
        },
        {
          property: 'og:title',
          content: `${logo.name} | CES3 Badge Arena`,
        },
        {
          property: 'og:description',
          content: description,
        },
        {
          property: 'og:image',
          content: previewImage,
        },
        {
          property: 'twitter:card',
          content: 'summary_large_image',
        },
        {
          property: 'twitter:title',
          content: `${logo.name} | CES3 Badge Arena`,
        },
        {
          property: 'twitter:description',
          content: description,
        },
        {
          property: 'twitter:image',
          content: previewImage,
        },
      ],
    }
  },
  component: LogoDetail,
})

function LogoDetail() {
  const { logoId: rawLogoId } = Route.useLoaderData()
  let logoId = rawLogoId
  try {
    logoId = decodeURIComponent(rawLogoId)
  } catch (error) {
    console.warn('Failed to decode logo id, using raw value.', error)
  }
  const { getLogoById } = useLogoLibrary()
  const { isFavorite, toggleFavorite } = useFavorites()
  const { ratings, rankings } = useElo()

  const logo = useMemo(() => getLogoById(logoId), [getLogoById, logoId])

  if (!logo) {
    throw notFound()
  }

  const entry = ratings[logo.id]
  const ranking = rankings.find((item) => item.logo.id === logo.id)
  const shareUrl = useMemo(() => {
    if (typeof window === 'undefined') return `https://ces3.microsoft.com/gallery/${logo.id}`
    return `${window.location.origin}/gallery/${logo.id}`
  }, [logo.id])

  return (
    <article className="space-y-12 pb-16">
      <header className="grid gap-8 rounded-3xl border border-white/10 bg-white/5 p-10 backdrop-blur xl:grid-cols-[1.2fr_minmax(0,_1fr)]">
        <div className="space-y-6">
          <p className="text-sm uppercase tracking-[0.3em] text-white/50">
            {logo.codename}
          </p>
          <h1 className="text-4xl font-semibold text-white">{logo.name}</h1>
          {logo.description && (
            <p className="text-white/70 text-lg leading-relaxed">{logo.description}</p>
          )}
          <div className="flex flex-wrap gap-4 text-xs uppercase tracking-[0.25em] text-cyan-200/70">
            {logo.submittedBy && <span>Submitted by {logo.submittedBy}</span>}
            {logo.ownerAlias && <span>Owned by @{logo.ownerAlias}</span>}
          </div>
          <div className="flex flex-wrap gap-4">
            <button
              type="button"
              onClick={() => toggleFavorite(logo.id)}
              className={`rounded-full px-5 py-3 text-sm font-semibold transition ${
                isFavorite(logo.id)
                  ? 'border border-cyan-300 bg-cyan-300 text-slate-900'
                  : 'border border-white/20 bg-white/5 text-white hover:border-cyan-200/40 hover:text-cyan-100'
              }`}
            >
              {isFavorite(logo.id) ? 'Saved to favorites' : 'Add to favorites'}
            </button>
            <a
              href={logo.image}
              download
              className="rounded-full border border-white/20 px-5 py-3 text-sm font-semibold text-white transition hover:border-cyan-300 hover:text-cyan-200"
            >
              Download image
            </a>
            <button
              type="button"
              className="rounded-full border border-cyan-300/50 bg-cyan-300/10 px-5 py-3 text-sm font-semibold text-cyan-100 transition hover:border-cyan-200 hover:text-cyan-50"
              onClick={async () => {
                try {
                  if (typeof navigator !== 'undefined' && navigator.share) {
                    await navigator.share({
              title: `${logo.name} | CES3 Badge Arena`,
                      text: logo.description ?? undefined,
                      url: shareUrl,
                    })
                    return
                  }
                  if (typeof navigator !== 'undefined' && navigator.clipboard) {
                    await navigator.clipboard.writeText(shareUrl)
                    window.alert('Link copied! Send it to teammates in Teams.')
                    return
                  }
                  window.prompt('Copy this link', shareUrl)
                } catch (error) {
                  console.error('Share failed', error)
                  window.prompt('Copy this link', shareUrl)
                }
              }}
            >
              Share badge link
            </button>
          </div>
        </div>
        <div className="overflow-hidden rounded-2xl border border-white/10 bg-slate-900/60 shadow-2xl">
          <div className="flex max-h-[32rem] w-full items-center justify-center bg-slate-950/40 p-6">
            <img
              src={logo.image}
              alt={logo.name}
              className="max-h-full max-w-full object-contain"
              loading="lazy"
            />
          </div>
        </div>
      </header>

      <div className="space-y-4 rounded-3xl border border-white/10 bg-white/5 p-8 backdrop-blur">
        <h2 className="text-lg font-semibold text-white">Live performance</h2>
        <p className="text-sm text-white/70">
          ELO rankings adjust dynamically as CES3 teammates compare logos. Higher numbers indicate stronger preference signals across the org.
        </p>
        <div className="flex flex-wrap gap-4 text-sm">
          <div className="rounded-2xl border border-cyan-300/40 bg-cyan-300/10 px-5 py-4 text-cyan-100">
            <p className="text-xs uppercase tracking-[0.3em] text-cyan-200/70">Rating</p>
            <p className="text-3xl font-semibold text-white">
              {Math.round(entry?.rating ?? 1500)}
            </p>
          </div>
          <div className="rounded-2xl border border-white/15 bg-white/5 px-5 py-4 text-white/80">
            <p className="text-xs uppercase tracking-[0.3em] text-white/60">Rank</p>
            <p className="text-3xl font-semibold text-white">
              {ranking?.rank ?? '—'}
            </p>
          </div>
          <div className="rounded-2xl border border-white/15 bg-white/5 px-5 py-4 text-white/80">
            <p className="text-xs uppercase tracking-[0.3em] text-white/60">Matches</p>
            <p className="text-3xl font-semibold text-white">
              {entry?.matches ?? 0}
            </p>
          </div>
        </div>
      </div>
    </article>
  )
}
