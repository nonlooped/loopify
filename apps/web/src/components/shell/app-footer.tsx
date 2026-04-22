/**
 * Quiet meta strip. Intentionally light on ornament — the sidebar already
 * carries the brand, so the footer just signs the page off.
 */
export function AppFooter() {
  const year = new Date().getFullYear()

  return (
    <footer className="relative mt-20 lg:mt-28">
      <div className="page-grid">
        <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-2 border-t border-border/70 py-6 font-mono text-[0.7rem] uppercase tracking-[0.08em] text-muted-foreground">
          <span>{`\u00A9 ${year} Loopify`}</span>
          <span className="hidden sm:inline">Music, together.</span>
          <span className="tabular-nums">v0.1</span>
        </div>
      </div>
    </footer>
  )
}
