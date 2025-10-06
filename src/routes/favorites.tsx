import { createFileRoute, Link } from '@tanstack/react-router'

import { LogoCard } from '../components/LogoCard'
import { useFavorites } from '../state/FavoritesContext'
import { useLogoLibrary } from '../state/LogoLibraryContext'

export const Route = createFileRoute('/favorites')({
  component: FavoritesPage,
})

function FavoritesPage() {
  const { favorites, toggleFavorite } = useFavorites()
  const { logos } = useLogoLibrary()
  const favoriteLogos = logos.filter((logo) => favorites.has(logo.id))

  return (
    <div className="space-y-10 pb-16">
      <header className="space-y-3">
        <p className="text-sm uppercase tracking-[0.3em] text-cyan-200/70">
          Your shortlist
        </p>
        <h1 className="text-4xl font-semibold text-white">Favorites</h1>
        <p className="text-white/70">
          Bring these into your next deck or keep voting to see how they stack up. Favorites sync per account, so your picks stay private.
        </p>
      </header>

      {favoriteLogos.length === 0 ? (
        <div className="rounded-3xl border border-white/10 bg-white/5 p-12 text-center text-white/70">
          <p>No favorites yet. Explore the <Link to="/gallery" className="text-cyan-200 underline">gallery</Link> and add the marks that resonate.</p>
        </div>
      ) : (
        <section className="grid gap-8 md:grid-cols-2 xl:grid-cols-3">
          {favoriteLogos.map((logo) => (
            <LogoCard
              key={logo.id}
              logo={logo}
              isFavorite
              onFavoriteToggle={toggleFavorite}
            />
          ))}
        </section>
      )}
    </div>
  )
}
