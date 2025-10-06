import { Outlet, createFileRoute, useRouterState } from '@tanstack/react-router'
import { useMemo, useState } from 'react'

import { LogoCard } from '../components/LogoCard'
import { useFavorites } from '../state/FavoritesContext'
import { useLogoLibrary } from '../state/LogoLibraryContext'

export const Route = createFileRoute('/gallery')({
  component: GalleryPage,
})

function GalleryPage() {
  const [query, setQuery] = useState('')
  const { favorites, toggleFavorite } = useFavorites()
  const { logos } = useLogoLibrary()
  const { hasDetail, selectedLogoId } = useRouterState({
    select: (state) => {
      const detailMatch = state.matches.find((match) => match.id === '/gallery/$logoId')
      const logoId =
        detailMatch && 'params' in detailMatch
          ? (detailMatch.params as { logoId?: string }).logoId ?? null
          : null

      return {
        hasDetail: Boolean(detailMatch),
        selectedLogoId: logoId,
      }
    },
  })

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

  const detailOutlet = <Outlet />

  return (
    <div className="space-y-10 pb-10">
      {hasDetail && detailOutlet}

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
            isActive={logo.id === selectedLogoId}
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
