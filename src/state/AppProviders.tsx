import { FavoritesProvider } from './FavoritesContext'
import { EloProvider } from './EloContext'
import { LogoLibraryProvider } from './LogoLibraryContext'
import { AuthProvider, useAuth } from './AuthContext'
import { ContestProvider, useContest } from './ContestContext'

export function AppProviders({ children }: { children: React.ReactNode }) {
  return (
    <AuthProvider>
      <ContestProvider>
        <LogoLibraryProvider>
          <EloProvider>
            <FavoritesWithIdentity>{children}</FavoritesWithIdentity>
          </EloProvider>
        </LogoLibraryProvider>
      </ContestProvider>
    </AuthProvider>
  )
}

function FavoritesWithIdentity({ children }: { children: React.ReactNode }) {
  const { user, isAllowed } = useAuth()
  const { selectedContestId } = useContest()
  const contestKey = selectedContestId ? `${selectedContestId}::` : ''
  const identityKey = `${contestKey}${isAllowed && user?.email ? user.email : 'anonymous'}`
  return (
    <FavoritesProvider identityKey={identityKey}>
      {children}
    </FavoritesProvider>
  )
}
