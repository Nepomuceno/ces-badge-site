import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/guidelines')({
  component: GuidelinesPage,
})

function GuidelinesPage() {
  const doList = [
    'Keep the composition readable on a 3×4 inch badge—preview it at roughly 1.5 inches wide before submitting.',
    'Feature “CES3” as the hero text or emblem so the studio identity is unmistakable.',
    'Use high-contrast shapes inspired by the CES3 palette (deep navy, cyan glow, warm orange accent).',
    'Export both SVG and high-resolution PNG files and include 0.25 inch bleed to protect the artwork during trimming.',
  ]

  const dontList = [
    'Do not include Microsoft logos, customer marks, or any third-party company references.',
    'Avoid dense micro-detail, hairline strokes, or ultra-thin typography that disappears in print.',
    'Skip photographic or busy textures that would dominate the small badge footprint.',
    'Steer clear of trademarked icons, emojis, or gradients you cannot legally redistribute.',
  ]

  const designTips = [
    'Test light and dark variants. Our badges ship in both deep navy and off-white editions.',
    'Balance the logo with negative space so the lanyard slot or punch does not clip key elements.',
    'Compact layouts (square or stacked) tend to survive lanyard swing better than panoramic lockups.',
    'Metallic foils and neon accents can elevate the badge—ground them with simple geometry so print stays crisp.',
  ]

  const promptExamples = [
    {
      title: 'Futuristic glyph',
      prompt:
        'Create a futuristic badge logo for the CES3 Studio. Emphasize the letters CES3 in bold geometric forms with a cyan glow and warm orange accent. Fit inside a rounded square badge, clean vector lines, no other company branding, printable on a 3x4 inch badge.',
    },
    {
      title: 'Minimal gradient mark',
      prompt:
        'Design a minimal CES3 badge logo featuring the letters CES3 arranged vertically inside a circle. Use deep navy, teal, and soft white gradients, high contrast, and thick strokes. Leave generous negative space for a lanyard punch. No Microsoft or customer references.',
    },
    {
      title: 'Retro-tech emblem',
      prompt:
        'Generate a retro-technology inspired emblem for CES3 with angular outlines, subtle circuit motifs, and the text CES3 centered. Restrict the palette to navy, cyan, and orange. Ensure the design remains legible when scaled to a 3x4 inch badge and exportable as SVG.',
    },
  ]

  return (
    <article className="space-y-12 pb-16">
      <header className="space-y-4">
        <p className="text-sm uppercase tracking-[0.3em] text-cyan-200/70">
          CES3 badge program
        </p>
        <h1 className="text-4xl font-semibold text-white">Badge-ready logo guardrails</h1>
        <p className="max-w-3xl text-lg text-white/70">
          These guidelines help anyone—designer or not—create CES3 logos that shine on small-format badges. Follow the
          do/do-not reminders, explore the creative tips, and use the prompt starters to guide AI tools.
        </p>
      </header>

      <section className="grid gap-10 md:grid-cols-2">
        <div className="space-y-4 rounded-3xl border border-cyan-300/30 bg-cyan-300/10 p-8 backdrop-blur">
          <h2 className="text-2xl font-semibold text-cyan-100">Do this</h2>
          <ul className="space-y-3 text-sm text-white/80">
            {doList.map((item) => (
              <li key={item} className="flex items-start gap-3">
                <span className="mt-1 h-1.5 w-1.5 rounded-full bg-cyan-300" />
                <span>{item}</span>
              </li>
            ))}
          </ul>
        </div>
        <div className="space-y-4 rounded-3xl border border-rose-300/40 bg-rose-400/10 p-8 backdrop-blur">
          <h2 className="text-2xl font-semibold text-rose-100">Avoid this</h2>
          <ul className="space-y-3 text-sm text-white/80">
            {dontList.map((item) => (
              <li key={item} className="flex items-start gap-3">
                <span className="mt-1 h-1.5 w-1.5 rounded-full bg-rose-200" />
                <span>{item}</span>
              </li>
            ))}
          </ul>
        </div>
      </section>

      <section className="space-y-4 rounded-3xl border border-white/10 bg-white/5 p-8 backdrop-blur">
        <h2 className="text-2xl font-semibold text-white">Design tips for non-pros</h2>
        <p className="text-sm text-white/70">
          You do not need a full design toolkit to get great results. Use these prompts while iterating in Canva, Figma,
          or your favorite AI art tool.
        </p>
        <ul className="space-y-3 text-sm text-white/80">
          {designTips.map((item) => (
            <li key={item} className="flex items-start gap-3">
              <span className="mt-1 h-1.5 w-1.5 rounded-full bg-white/50" />
              <span>{item}</span>
            </li>
          ))}
        </ul>
      </section>

      <section className="space-y-6 rounded-3xl border border-cyan-300/30 bg-cyan-300/10 p-8 backdrop-blur">
        <h2 className="text-2xl font-semibold text-cyan-100">Prompt starters for AI tools</h2>
        <p className="text-sm text-white/70">
          Paste these into your generator of choice (DALL·E, Midjourney, Copilot, etc.) and tweak the color language or
          mood words to taste. Always double-check that the results respect the do/do-not list above.
        </p>
        <div className="grid gap-6 md:grid-cols-2">
          {promptExamples.map((example) => (
            <div
              key={example.title}
              className="space-y-3 rounded-2xl border border-white/20 bg-[#050e1c]/80 p-6 text-sm text-white/80"
            >
              <p className="text-xs uppercase tracking-[0.3em] text-cyan-200/70">{example.title}</p>
              <pre className="whitespace-pre-wrap rounded-xl bg-black/30 p-4 text-[13px] leading-relaxed text-white/90">{example.prompt}</pre>
            </div>
          ))}
        </div>
      </section>
    </article>
  )
}
