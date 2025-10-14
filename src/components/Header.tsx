import { Link, useRouterState } from '@tanstack/react-router'
import { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'

import { useAuth } from '../state/AuthContext'
import { SignInPrompt } from './AuthPrompts'
import { useContest } from '../state/ContestContext'

type NavPath =
  | '/'
  | '/vote'
  | '/scores'
  | '/my-logos'
  | '/contests'
  | '/gallery'
  | '/guidelines'
  | '/favorites'
  | '/admin/contests'

interface NavItem {
  label: string
  to: NavPath
  disabled?: boolean
}

export default function Header() {
  const routerState = useRouterState()
  const activePath = routerState.location.pathname
  const { isAuthenticated, isAllowed, user, isAdmin, loading, logout } = useAuth()
  const { hasLiveContest } = useContest()
  const [showAuthPanel, setShowAuthPanel] = useState(false)
  const [showUserMenu, setShowUserMenu] = useState(false)
  const [showMobileNav, setShowMobileNav] = useState(false)
  const menuCloseTimeout = useRef<number | null>(null)

  const openUserMenu = () => {
    if (menuCloseTimeout.current) {
      window.clearTimeout(menuCloseTimeout.current)
      menuCloseTimeout.current = null
    }
    setShowUserMenu(true)
  }

  const scheduleCloseUserMenu = () => {
    if (menuCloseTimeout.current) {
      window.clearTimeout(menuCloseTimeout.current)
    }
    menuCloseTimeout.current = window.setTimeout(() => {
      setShowUserMenu(false)
      menuCloseTimeout.current = null
    }, 150)
  }

  useEffect(() => {
    return () => {
      if (menuCloseTimeout.current) {
        window.clearTimeout(menuCloseTimeout.current)
      }
    }
  }, [])

  useEffect(() => {
    setShowMobileNav(false)
  }, [activePath])

  useEffect(() => {
    if (typeof document === 'undefined') return
    const className = 'mobile-nav-open'
    const target = document.documentElement
    if (showMobileNav) {
      target.classList.add(className)
    } else {
      target.classList.remove(className)
    }
    return () => {
      target.classList.remove(className)
    }
  }, [showMobileNav])

  const navItems = useMemo<NavItem[]>(() => {
    const base: NavItem[] = [
      { label: 'Home', to: '/' },
      { label: 'Contests', to: '/contests' },
      { label: 'Gallery', to: '/gallery' },
      { label: 'Guidelines', to: '/guidelines' },
    ]

    if (isAllowed) {
      base.splice(1, 0, { label: 'Vote', to: '/vote' }, { label: 'Scores', to: '/scores' })
      base.push({ label: 'Favorites', to: '/favorites' })
      base.push({ label: 'My logos', to: '/my-logos' })
    }

    if (isAdmin) {
      base.push({ label: 'Admin', to: '/admin/contests' })
    }

    if (!hasLiveContest) {
      const gated: Set<NavPath> = new Set(['/vote', '/scores', '/gallery', '/favorites', '/my-logos'])
      return base.map((item) =>
        gated.has(item.to) ? { ...item, disabled: true } : item,
      )
    }

    return base
  }, [hasLiveContest, isAdmin, isAllowed])

  let mobileNavPortal: React.ReactNode = null
  if (showMobileNav && typeof document !== 'undefined') {
    mobileNavPortal = createPortal(
      <div className="md:hidden">
        <div
          className="fixed inset-0 z-[90] bg-black/60 backdrop-blur-sm"
          aria-hidden
          onClick={() => setShowMobileNav(false)}
        />
        <aside
          className="fixed inset-y-0 right-0 z-[95] w-80 max-w-[88vw] overflow-y-auto border-l border-white/10 bg-[#040d1a]/98 p-6 text-white shadow-[0_0_40px_rgba(8,19,40,0.6)]"
          role="dialog"
          aria-modal="true"
        >
          <div className="mb-6 flex items-center justify-between">
            <div className="flex items-center gap-3 text-left">
              <img
                src="/icons/logo-ces3-logo.png"
                alt="CES3 Badge Arena"
                className="h-10 w-auto"
                loading="lazy"
                decoding="async"
              />
              <div className="space-y-1 text-xs uppercase tracking-[0.35em] text-white/60">
                <p className="text-white/80">CES3 Badge Arena</p>
                <p className="text-white/40">Vote · Battle · Choose</p>
              </div>
            </div>
            <button
              type="button"
              className="rounded-full border border-white/20 px-3 py-1 text-xs uppercase tracking-[0.3em] text-white/60 transition hover:border-cyan-300 hover:text-cyan-200"
              onClick={() => setShowMobileNav(false)}
            >
              Close
            </button>
          </div>
          <nav className="space-y-2 text-sm font-semibold text-white/80">
            {navItems.map((item) => {
              const isActive =
                item.to === '/' ? activePath === item.to : activePath.startsWith(item.to)
              if (item.disabled) {
                return (
                  <span
                    key={item.to}
                    className="flex items-center justify-between rounded-2xl border border-white/5 px-4 py-3 text-white/30"
                    title="Available when a contest is live"
                  >
                    {item.label}
                  </span>
                )
              }
              return (
                <Link
                  key={item.to}
                  to={item.to}
                  onClick={() => setShowMobileNav(false)}
                  className={`flex items-center justify-between rounded-2xl border border-white/5 px-4 py-3 transition hover:border-cyan-200/40 hover:bg-cyan-300/10 hover:text-white ${
                    isActive ? 'border-cyan-300/60 bg-cyan-300/15 text-white' : ''
                  }`}
                >
                  {item.label}
                </Link>
              )
            })}
          </nav>
          <div className="mt-8 space-y-3 border-t border-white/10 pt-6 text-sm">
            {isAuthenticated && user ? (
              <>
                <div className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-white/80">
                  <p className="text-sm font-semibold text-white">{user.name}</p>
                  <p className="text-[11px] uppercase tracking-[0.3em] text-white/40">{user.alias}</p>
                  {isAdmin && (
                    <span className="mt-2 inline-flex rounded-full bg-cyan-300/20 px-2 text-[10px] font-semibold uppercase tracking-[0.3em] text-cyan-100">
                      Admin
                    </span>
                  )}
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setShowMobileNav(false)
                    logout()
                  }}
                  className="flex w-full items-center justify-center rounded-full border border-rose-300/30 bg-rose-400/10 px-4 py-2 font-semibold text-rose-100 transition hover:border-rose-200/60 hover:bg-rose-400/20"
                >
                  Sign out
                </button>
              </>
            ) : (
              <SignInPrompt
                variant="inline"
                heading="Team member sign-in"
                description="Use your alias to access voting, scores, and submissions."
                onSuccess={() => {
                  setShowMobileNav(false)
                  setShowAuthPanel(false)
                }}
              />
            )}
          </div>
        </aside>
      </div>,
      document.body,
    )
  }

  return (
    <>
      <header className="sticky top-0 z-20 border-b border-white/10 bg-[#050b15]/90 backdrop-blur">
        <div className="mx-auto flex w-full max-w-6xl items-center justify-between px-6 py-4">
          <Link to="/" className="flex items-center gap-4 text-white">
            <img
              src="/icons/logo-ces3-logo.png"
              alt="CES3 Badge Arena"
              className="h-12 w-auto"
              loading="lazy"
              decoding="async"
            />
            <div className="hidden flex-col leading-none md:flex">
              <span className="text-sm font-semibold uppercase tracking-[0.25em] text-white/80">
                CES3 Badge Arena
              </span>
              <span className="text-[11px] uppercase tracking-[0.2em] text-cyan-200/70">
                Choose the badge
              </span>
            </div>
          </Link>
          <nav className="hidden items-center gap-1 rounded-full border border-white/10 bg-white/5 p-1 text-sm font-semibold text-white md:flex">
            {navItems.map((item) => {
              const isActive =
                item.to === '/' ? activePath === item.to : activePath.startsWith(item.to)
              if (item.disabled) {
                return (
                  <span
                    key={item.to}
                    className="rounded-full px-4 py-2 text-white/30"
                    title="Available when a contest is live"
                  >
                    {item.label}
                  </span>
                )
              }
              return (
                <Link
                  key={item.to}
                  to={item.to}
                  className={`rounded-full px-4 py-2 transition ${
                    isActive
                      ? 'bg-cyan-300 text-slate-900 shadow-lg'
                      : 'text-white/70 hover:bg-white/10 hover:text-white'
                  }`}
                >
                  {item.label}
                </Link>
              )
            })}
          </nav>
          <div className="flex items-center gap-3 md:hidden">
            <button
              type="button"
              className="flex h-10 w-10 items-center justify-center rounded-full border border-white/20 bg-white/10 text-white transition hover:border-cyan-300 hover:text-cyan-200"
              aria-label="Toggle navigation menu"
              aria-expanded={showMobileNav}
              onClick={() => {
                setShowMobileNav((prev) => !prev)
                setShowAuthPanel(false)
              }}
            >
              <span className="flex flex-col items-center justify-center gap-1">
                <span className="block h-0.5 w-5 rounded-full bg-current" />
                <span className="block h-0.5 w-5 rounded-full bg-current" />
                <span className="block h-0.5 w-5 rounded-full bg-current" />
              </span>
            </button>
          </div>
          <div className="relative hidden items-center gap-3 text-sm text-white/70 md:flex">
            {isAuthenticated && user ? (
              <div
                className="relative"
                onMouseEnter={openUserMenu}
                onMouseLeave={scheduleCloseUserMenu}
              >
                <button
                  type="button"
                  onClick={() => {
                    if (menuCloseTimeout.current) {
                      window.clearTimeout(menuCloseTimeout.current)
                      menuCloseTimeout.current = null
                    }
                    setShowUserMenu((prev) => !prev)
                  }}
                  className="flex h-10 w-10 items-center justify-center rounded-full border border-white/20 bg-white/10 text-sm font-semibold uppercase tracking-[0.3em] text-white transition hover:border-cyan-300 hover:text-cyan-100"
                  aria-label="Account menu"
                  aria-expanded={showUserMenu}
                >
                  {(user.alias?.[0] ?? 'C').toUpperCase()}
                </button>
                {showUserMenu && (
                  <div
                    className="absolute right-0 top-[calc(100%+12px)] w-56 rounded-3xl border border-white/10 bg-[#040d1a]/95 p-3 shadow-2xl backdrop-blur"
                    onMouseEnter={openUserMenu}
                    onMouseLeave={scheduleCloseUserMenu}
                  >
                    <div className="flex items-center justify-between gap-2 rounded-2xl border border-white/10 bg-white/5 px-3 py-2">
                      <div>
                        <p className="text-sm font-semibold text-white">{user.name}</p>
                        <p className="text-[10px] uppercase tracking-[0.3em] text-white/40">
                          {user.alias}
                        </p>
                      </div>
                      {isAdmin && (
                        <span className="rounded-full bg-cyan-300/20 px-2 text-[10px] font-semibold uppercase tracking-[0.3em] text-cyan-100">
                          Admin
                        </span>
                      )}
                    </div>
                    <nav className="mt-3 space-y-1 text-sm font-semibold text-white/80">
                      <Link
                        to="/account"
                        onClick={() => setShowUserMenu(false)}
                        className="flex items-center justify-between rounded-2xl px-3 py-2 transition hover:bg-white/10 hover:text-white"
                      >
                        Account
                      </Link>
                      <Link
                        to="/my-logos"
                        onClick={() => setShowUserMenu(false)}
                        className="flex items-center justify-between rounded-2xl px-3 py-2 transition hover:bg-white/10 hover:text-white"
                      >
                        My logos
                      </Link>
                      {isAdmin && (
                        <Link
                          to="/admin/contests"
                          onClick={() => setShowUserMenu(false)}
                          className="flex items-center justify-between rounded-2xl px-3 py-2 transition hover:bg-white/10 hover:text-white"
                        >
                          Contest admin
                        </Link>
                      )}
                      <button
                        type="button"
                        onClick={() => {
                          setShowUserMenu(false)
                          setShowAuthPanel(false)
                          logout()
                        }}
                        className="flex w-full items-center justify-between rounded-2xl px-3 py-2 text-left transition hover:bg-rose-400/10 hover:text-rose-100"
                      >
                        Sign out
                      </button>
                    </nav>
                  </div>
                )}
              </div>
            ) : (
              <>
                <button
                  type="button"
                  onClick={() => setShowAuthPanel((prev) => !prev)}
                  disabled={loading}
                  className="rounded-full border border-white/20 px-4 py-2 font-semibold text-white transition hover:border-cyan-300 hover:text-cyan-200 disabled:cursor-not-allowed disabled:text-white/40"
                >
                  {loading ? 'Loading…' : 'Sign in'}
                </button>
                {showAuthPanel && (
                  <div className="absolute right-0 top-[calc(100%+12px)] w-80 max-w-sm">
                    <div className="relative rounded-3xl border border-white/10 bg-[#040d1a]/95 p-4 shadow-2xl backdrop-blur">
                      <button
                        type="button"
                        onClick={() => setShowAuthPanel(false)}
                        className="absolute right-3 top-3 text-xs uppercase tracking-[0.3em] text-white/40 hover:text-white/70"
                      >
                        Close
                      </button>
                      <SignInPrompt
                        variant="inline"
                        heading="Team member sign-in"
                        description="Use your alias to access the studio. Passwords are only needed if you added one on your account."
                        onSuccess={() => setShowAuthPanel(false)}
                      />
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      </header>
      {mobileNavPortal}
    </>
  )
}
