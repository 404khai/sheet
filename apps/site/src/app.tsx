import { useEffect, useMemo, useState, type MouseEvent, type ReactNode } from 'react'
import {
  AgentsDiagram,
  ExportArt,
  LocalFirstArt,
  platforms,
  SunMoon,
  type Platform,
} from './diagrams'
import { trackPointer, useInView } from './hooks'
import { DownloadDialog } from './download-dialog'
import { downloadLabel, downloadTarget, downloadUrl, REPO, type DownloadTarget } from './download'
import { NavGithubStars } from './github-stars'
import { HeroDemo } from './hero-demo'
import { PlatformMark } from './marks'
import { chooseTheme, currentTheme, followSystem } from './theme'
import { WindowControls } from './window-controls'

/** The step at which the pricing page is finished. */
const BUILT = 5

function Ticks() {
  return (
    <span className="ticks" aria-hidden="true">
      <i />
      <i />
      <i />
      <i />
      <i />
      <i />
      <i />
      <i />
      <i />
    </span>
  )
}

function Reveal({ children, delay = 0 }: { children: ReactNode; delay?: number }) {
  const [ref, seen] = useInView<HTMLDivElement>()
  return (
    <div ref={ref} className="reveal" data-seen={seen} style={{ transitionDelay: `${delay}ms` }}>
      {children}
    </div>
  )
}

function ThemeToggle() {
  const [dark, setDark] = useState(() => currentTheme() === 'dark')

  useEffect(() => followSystem((theme) => setDark(theme === 'dark')), [])

  return (
    <button
      type="button"
      className="theme-toggle"
      aria-label={dark ? 'Switch to light theme' : 'Switch to dark theme'}
      data-cuelume-toggle
      onClick={() => {
        const next = dark ? 'light' : 'dark'
        chooseTheme(next)
        setDark(next === 'dark')
      }}
    >
      <SunMoon dark={dark} />
      <span className="theme-label">{dark ? 'Light theme' : 'Dark theme'}</span>
    </button>
  )
}

function detectPlatform(): Platform {
  const agent = navigator.userAgent
  if (/Windows/.test(agent)) return 'Windows'
  if (/Linux|X11/.test(agent) && !/Android/.test(agent)) return 'Linux'
  return 'macOS'
}

/** The app window, drawn with the frame of the platform it runs on. */
function AppWindow({
  platform,
  title,
  columns,
  children,
}: {
  platform: Platform
  title: string
  columns: 2 | 3
  children: ReactNode
}) {
  return (
    <div className="window" data-os={platform}>
      <div className="window-bar">
        <WindowControls platform={platform} />
        <span className="window-title">{title}</span>
      </div>
      <div className="window-body" data-columns={columns}>
        {children}
      </div>
    </div>
  )
}

const plans = ['Solo', 'Pro', 'Team']

/** The page the agent builds; `step` says how much of it exists. */
function PricingCanvas({ step, cursor }: { step: number; cursor: { x: number; y: number } }) {
  return (
    <div className="canvas" data-step={step}>
      <div className="frame">
        <span className="frame-label">Pricing</span>
        <div className="frame-head">
          <b />
          <i />
        </div>
        <div className="plans">
          {plans.map((name, index) => (
            <div
              key={name}
              className="plan"
              data-pro={name === 'Pro'}
              style={{ '--i': index } as React.CSSProperties}
            >
              <span>{name}</span>
              <strong />
              <i />
              <i />
            </div>
          ))}
        </div>
        <u className="frame-button" />
      </div>
      <div className="cursor" style={{ left: `${cursor.x}%`, top: `${cursor.y}%` }}>
        <svg width="16" height="16" viewBox="0 0 14 14" aria-hidden="true">
          <path d="M1 1l11 4.5-4.6 1.6L5.8 12z" fill="currentColor" />
        </svg>
        <span>claude</span>
      </div>
    </div>
  )
}

function Layers({ step }: { step: number }) {
  return (
    <aside className="panel panel-right" aria-label="Layers">
      <p className="panel-title">Layers</p>
      <ul className="layers">
        <li data-shown={step >= 1}>Pricing</li>
        <li data-shown={step >= 2} className="nested">
          Heading
        </li>
        <li data-shown={step >= 2} className="nested">
          Plan cards
        </li>
        <li data-shown={step >= 4} className="nested">
          Button
        </li>
      </ul>
    </aside>
  )
}

/** The finished design in the window of the chosen platform. */
function PlatformWindow({ platform }: { platform: Platform }) {
  return (
    <AppWindow platform={platform} title="Sheet — Pricing" columns={2}>
      <Layers step={BUILT} />
      <PricingCanvas step={BUILT} cursor={{ x: 90, y: 90 }} />
    </AppWindow>
  )
}

function Card({ className, children }: { className?: string; children: ReactNode }) {
  return (
    <article className={`card ${className ?? ''}`} onPointerMove={trackPointer}>
      {children}
    </article>
  )
}

export function App() {
  const detected = useMemo(detectPlatform, [])
  const [platform, setPlatform] = useState<Platform>(detected)
  /** The build being downloaded; null while the dialog is closed. */
  const [download, setDownload] = useState<DownloadTarget | null>(null)
  const target = downloadTarget(detected)
  /** The nav links collapse into this menu on small screens. */
  const [menuOpen, setMenuOpen] = useState(false)
  /** The platforms section offers whichever tab is open, so the two agree. */
  const shownTarget = downloadTarget(platform)

  /** Plain clicks open the dialog; a modified click (new tab, save link) keeps the real link. */
  const openDownload = (next: DownloadTarget) => (event: MouseEvent<HTMLAnchorElement>) => {
    if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return
    event.preventDefault()
    setDownload(next)
  }

  useEffect(() => {
    if (!menuOpen) return
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setMenuOpen(false)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [menuOpen])

  return (
    <>
      <header className="nav">
        <div className="nav-inner">
          <a className="brand" href="/" data-cuelume-navigate>
            <Ticks />
            Sheet
          </a>
          <button
            type="button"
            className="nav-menu-button"
            aria-label={menuOpen ? 'Close menu' : 'Open menu'}
            aria-expanded={menuOpen}
            aria-controls="site-nav"
            onClick={() => setMenuOpen((open) => !open)}
          >
            <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true">
              <path className="menu-bar menu-top" d="M2 4.5h12" />
              <path className="menu-bar menu-mid" d="M2 8h12" />
              <path className="menu-bar menu-bottom" d="M2 11.5h12" />
            </svg>
          </button>
          <nav id="site-nav" data-open={menuOpen} onClick={(event) => {
            if (event.target instanceof Element && event.target.closest('a')) setMenuOpen(false)
          }}>
            <a href="#features" data-cuelume-navigate>
              Features
            </a>
            <NavGithubStars />
            <ThemeToggle />
            <a
              className="button button-solid button-small"
              href={downloadUrl(target)}
              onClick={openDownload(target)}
              data-cuelume-tap
            >
              <PlatformMark target={target} />
              Download
            </a>
          </nav>
        </div>
      </header>

      <main>
        <section className="hero">
          <div className="hero-copy">
            <h1>
              <span>Design with your agent.</span>
              <span className="dim">On your machine.</span>
            </h1>
            <p className="lede">
              Sheet is a canvas for real UI. Connect Claude, Codex or Cursor over MCP and watch the
              page take shape as they build it, in the file you have open.
            </p>
            <div className="actions">
              <a
                className="button button-solid button-large"
                href={downloadUrl(target)}
                onClick={openDownload(target)}
                data-cuelume-tap
              >
                <PlatformMark target={target} />
                {downloadLabel(target)}
              </a>
              <a className="button button-large" href={REPO} data-cuelume-navigate>
                View on GitHub
              </a>
            </div>
            <p className="note">Free and open source. No account. No cloud.</p>
          </div>
          <div className="stage">
            <HeroDemo platform={detected} />
          </div>
        </section>

        <section className="section section-tight">
          <Reveal>
            <p className="kicker">Bring your own agent</p>
            <h2>Any agent. One canvas.</h2>
            <p className="sub">
              Pick an agent and watch its MCP tool calls land in the document you have open.
            </p>
          </Reveal>
          <Reveal delay={120}>
            <div className="diagram">
              <AgentsDiagram />
            </div>
          </Reveal>
        </section>

        <section id="features" className="section">
          <Reveal>
            <p className="kicker">Why Sheet</p>
            <h2>A design tool that expects an agent in the room.</h2>
          </Reveal>
          <div className="bento">
            <Card className="card-wide">
              <h3>Your agent works in your file</h3>
              <p>
                Claude, Codex, Cursor and opencode connect over MCP and edit the same document you
                do. Every change is a typed transaction, so you can undo it like your own.
              </p>
              <ul className="calls" aria-label="Example agent tool calls">
                <li>
                  <span>insertNodes</span>
                  <em>Pricing / 3 plans</em>
                </li>
                <li>
                  <span>patchNodes</span>
                  <em>spacing, color tokens</em>
                </li>
                <li>
                  <span>animateNodes</span>
                  <em>fade-in-up, stagger 80ms</em>
                </li>
              </ul>
            </Card>
            <Card>
              <h3>Stays on your machine</h3>
              <p>Your designs live in one file on your disk. No account, no hosted service.</p>
              <LocalFirstArt />
            </Card>
            <Card className="card-full">
              <h3>Export when you are done</h3>
              <p>
                Save PNG, JPG or HTML, or copy the HTML. Exports never flow back in, so the canvas
                stays the source of truth.
              </p>
              <ExportArt />
            </Card>
          </div>
        </section>

        <section id="platforms" className="section">
          <Reveal>
            <p className="kicker">Cross-platform</p>
            <h2>One app. Every desktop.</h2>
            <p className="sub">The same canvas on macOS, Windows and Linux.</p>
          </Reveal>
          <Reveal delay={120}>
            <div className="platforms">
              <div className="platform-tabs" role="tablist" aria-label="Platform">
                {platforms.map((name) => (
                  <button
                    key={name}
                    type="button"
                    role="tab"
                    aria-selected={platform === name}
                    data-cuelume-select
                    onClick={() => setPlatform(name)}
                  >
                    {name}
                  </button>
                ))}
              </div>
              <PlatformWindow platform={platform} />
              <a
                className="button button-solid"
                href={downloadUrl(shownTarget)}
                onClick={openDownload(shownTarget)}
                data-cuelume-tap
              >
                <PlatformMark target={shownTarget} />
                {downloadLabel(shownTarget)}
              </a>
            </div>
          </Reveal>
        </section>

        <section id="download" className="cta">
          <Reveal>
            <h2>Open a canvas. Invite your agent.</h2>
            <a className="button button-solid button-large" href={downloadUrl(target)} onClick={openDownload(target)} data-cuelume-tap>
              <PlatformMark target={target} />
              {downloadLabel(target)}
            </a>
          </Reveal>
        </section>
      </main>

      <footer className="footer">
        <span className="brand">
          <Ticks />
          Sheet
        </span>
        <span className="muted">Open source · AGPL-3.0</span>
        <a href={REPO} data-cuelume-navigate>
          GitHub
        </a>
      </footer>
      <DownloadDialog
        open={download !== null}
        target={download ?? target}
        onClose={() => setDownload(null)}
      />
    </>
  )
}
