import { Link } from '@tanstack/react-router'

import type { LogoEntry } from '../state/LogoLibraryContext'

interface LogoCardProps {
  logo: LogoEntry
  isFavorite: boolean
  onFavoriteToggle: (logoId: string) => void
  showFavoriteAction?: boolean
  isActive?: boolean
}

export function LogoCard({
  logo,
  isFavorite,
  onFavoriteToggle,
  showFavoriteAction = true,
  isActive = false,
}: LogoCardProps) {
  const wrapperClasses = [
    'flex h-full flex-col overflow-hidden rounded-3xl border border-white/10 bg-slate-900/60 shadow-xl transition hover:-translate-y-1 hover:border-cyan-200/60',
    isActive ? 'border-cyan-300/70 shadow-cyan-300/40 ring-2 ring-cyan-300/60' : '',
  ]
    .filter(Boolean)
    .join(' ')

  return (
    <article className={wrapperClasses}>
      <div className="flex h-48 w-full items-center justify-center bg-slate-950/40">
        <img
          src={logo.image}
          alt={logo.name}
          className="max-h-full max-w-full object-contain"
          loading="lazy"
        />
      </div>
      <div className="flex flex-1 flex-col gap-4 p-6">
        <div className="space-y-1">
          <p className="text-xs uppercase tracking-[0.3em] text-white/50">
            {logo.codename}
          </p>
          <h3 className="text-xl font-semibold text-white">{logo.name}</h3>
          {logo.description && (
            <p className="text-sm text-white/70">{logo.description}</p>
          )}
          {logo.source === 'user' && logo.submittedBy && (
            <p className="text-xs uppercase tracking-[0.2em] text-cyan-200/70">
              Submitted by {logo.submittedBy}
            </p>
          )}
          {logo.ownerAlias && (
            <p className="text-xs uppercase tracking-[0.2em] text-white/40">
              Owned by @{logo.ownerAlias}
            </p>
          )}
        </div>
        <div className="mt-auto flex flex-wrap gap-3 pt-2 text-sm font-semibold">
          <Link
            to="/logos/$logoId"
            params={{ logoId: encodeURIComponent(logo.id) }}
            className="rounded-full border border-white/20 px-4 py-2 text-white transition hover:border-cyan-300 hover:text-cyan-200"
          >
            View details
          </Link>
          {showFavoriteAction && (
            <button
              type="button"
              onClick={() => onFavoriteToggle(logo.id)}
              className="rounded-full border border-cyan-300/40 bg-cyan-300/10 px-4 py-2 text-cyan-100 transition hover:bg-cyan-300 hover:text-slate-900"
            >
              {isFavorite ? 'Remove favorite' : 'Add to favorites'}
            </button>
          )}
        </div>
      </div>
    </article>
  )
}
