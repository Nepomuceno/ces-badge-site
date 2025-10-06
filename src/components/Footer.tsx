export default function Footer() {
  return (
  <footer className="border-t border-white/10 bg-black/40">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-3 px-6 py-8 text-xs leading-relaxed text-white/70 sm:flex-row sm:items-start sm:justify-between sm:text-sm">
        <div className="sm:max-w-3xl">
          <p className="text-sm font-semibold uppercase tracking-wide text-white/80">
            Terms of Service & Upload Policy
          </p>
          <p>
            By submitting logos or other files you confirm you own (or have secured) all necessary
            rights. CES3 Badge Arena operates this gallery on an "as is" basis and disclaims any
            responsibility or liability for the files uploaded by participants, including any
            copyright, trademark, or policy violations. You remain solely responsible for the
            content you upload, and we may remove items that violate these terms.
          </p>
        </div>
        <div className="text-white/60">
          <p>Need help or want a file removed?</p>
          <p>
            Contact the CES3 admins at{' '}
            <a className="underline hover:text-white" href="mailto:ces3-admins@example.com">
              ganepomu@microsoft.com
            </a>
            .
          </p>
        </div>
      </div>
    </footer>
  )
}
