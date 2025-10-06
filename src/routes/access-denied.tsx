import { createFileRoute, Link } from '@tanstack/react-router'

import { AccessDeniedMessage, SignInPrompt } from '../components/AuthPrompts'
import { useAuth } from '../state/AuthContext'

export const Route = createFileRoute('/access-denied')({
  component: AccessDeniedPage,
})

function AccessDeniedPage() {
  const { isAuthenticated } = useAuth()

  return (
    <div className="space-y-10 pb-16">
      <AccessDeniedMessage
        description="Your alias isn’t in the CES3 roster yet. Double-check the spelling or get in touch with the brand council to be added."
      />
      {!isAuthenticated && (
        <SignInPrompt
          heading="Try signing in again"
          description="Enter your name and alias exactly as listed in the roster. If you still can’t get in, reach out to the brand team."
        />
      )}
      <div className="flex flex-wrap items-center justify-center gap-4 text-sm text-white/70">
        <Link
          to="/"
          className="rounded-full border border-white/20 px-5 py-3 font-semibold text-white transition hover:border-cyan-300 hover:text-cyan-200"
        >
          Return home
        </Link>
      </div>
    </div>
  )
}
