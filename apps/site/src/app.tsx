import { useEffect, useMemo, useState, type MouseEvent, type ReactNode } from 'react'
import { play } from 'cuelume'
import {
  AgentsDiagram,
  ExportArt,
  LocalFirstArt,
  platforms,
  SunMoon,
  type Platform,
} from './diagrams'
import { prefersReducedMotion, trackPointer, useInView } from './hooks'
import { DownloadDialog } from './download-dialog'
import { downloadLabel, downloadTarget, downloadUrl, REPO, type DownloadTarget } from './download'
import { PlatformMark } from './marks'
import { chooseTheme, currentTheme, followSystem } from './theme'

/** One agent step: when it fires, what the log says. */
const script = [
  { at: 700, tool: 'createFrame', detail: 'Pricing · 1280 × 800' },
  { at: 1700, tool: 'insertNodes', detail: 'heading, 3 plan cards' },
  { at: 2800, tool: 'patchNodes', detail: 'accent on Pro' },
  { at: 3800, tool: 'insertNodes', detail: 'button “Get started”' },
  { at: 4800, tool: 'animateNodes', detail: 'fade-in-up · stagger 80ms' },
] as const

const FINISH_AT = 6200
const LOOP_AT = 10000

/** Where the agent cursor sits after each step, in percent of the canvas. */
const cursorAt = [
  { x: 6, y: 10 },
  { x: 14, y: 12 },
  { x: 47, y: 46 },
  { x: 52, y: 74 },
  { x: 78, y: 30 },
  { x: 90, y: 90 },
] as const

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
    </button>
  )
}

function detectPlatform(): Platform {
  const agent = navigator.userAgent
  if (/Windows/.test(agent)) return 'Windows'
  if (/Linux|X11/.test(agent) && !/Android/.test(agent)) return 'Linux'
  return 'macOS'
}

function WindowControls({ platform }: { platform: Platform }) {
  if (platform === 'macOS') {
    return (
      <span className="lights" aria-hidden="true">
        <i />
        <i />
        <i />
      </span>
    )
  }
  if (platform === 'Windows') {
    return (
      <span className="win-controls" aria-hidden="true">
        <svg viewBox="0 0 12 12">
          <path d="M1 6h10" />
        </svg>
        <svg viewBox="0 0 12 12">
          <rect x="1.5" y="1.5" width="9" height="9" />
        </svg>
        <svg viewBox="0 0 12 12">
          <path d="M1 1l10 10M11 1 1 11" />
        </svg>
      </span>
    )
  }
  return (
    <span className="linux-controls" aria-hidden="true">
      <svg viewBox="0 0 12 12">
        <path d="M3 3l6 6M9 3 3 9" />
      </svg>
    </span>
  )
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

/** The agent designing a pricing page, on a loop. */
function LiveDemo({ platform }: { platform: Platform }) {
  const [step, setStep] = useState(0)
  const [run, setRun] = useState(0)

  useEffect(() => {
    if (prefersReducedMotion()) {
      setStep(script.length)
      return
    }
    setStep(0)
    const timers = script.map((entry, index) => setTimeout(() => setStep(index + 1), entry.at))
    timers.push(setTimeout(() => play('success', { emphasis: 'subtle' }), FINISH_AT))
    timers.push(setTimeout(() => setRun((value) => value + 1), LOOP_AT))
    return () => timers.forEach(clearTimeout)
  }, [run])

  const cursor = cursorAt[step] ?? cursorAt[0]

  return (
    <AppWindow platform={platform} title="Sheet — Pricing" columns={3}>
      <aside className="panel panel-left" aria-label="Agent activity">
        <p className="panel-title">Agent</p>
        <p className="prompt">
          Build a pricing page with three plans.<span className="caret" aria-hidden="true" />
        </p>
        <ul className="log">
          {script.map((entry, index) => (
            <li key={entry.tool + index} data-shown={step > index} data-live={step === index + 1}>
              <span>{entry.tool}</span>
              <em>{entry.detail}</em>
            </li>
          ))}
        </ul>
        <button
          type="button"
          className="replay"
          data-cuelume-tap
          onClick={() => setRun((value) => value + 1)}
        >
          Replay
        </button>
      </aside>
      <PricingCanvas step={step} cursor={cursor} />
      <Layers step={step} />
    </AppWindow>
  )
}

/** The finished design in the window of the chosen platform. */
function PlatformWindow({ platform }: { platform: Platform }) {
  return (
    <AppWindow platform={platform} title="Sheet — Pricing" columns={2}>
      <Layers step={script.length} />
      <PricingCanvas step={script.length} cursor={cursorAt[5]} />
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
  /** The platforms section offers whichever tab is open, so the two agree. */
  const shownTarget = downloadTarget(platform)

  /** Plain clicks open the dialog; a modified click (new tab, save link) keeps the real link. */
  const openDownload = (next: DownloadTarget) => (event: MouseEvent<HTMLAnchorElement>) => {
    if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return
    event.preventDefault()
    setDownload(next)
  }

  return (
    <>
      <header className="nav">
        <div className="nav-inner">
          <a className="brand" href="/" data-cuelume-navigate>
            <Ticks />
            Sheet
          </a>
          <nav>
            <a href="#features" data-cuelume-navigate>
              Features
            </a>
            <a href={REPO} data-cuelume-navigate>
              GitHub
            </a>
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
              Sheet is an infinite canvas for real UI. Bring Claude, Codex or Cursor and watch them
              build beside you, live, in the same file.
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
            <p className="note">Open source. No account needed.</p>
          </div>
          <div className="stage">
            <LiveDemo platform={detected} />
          </div>
        </section>

        <section className="section section-tight">
          <Reveal>
            <p className="kicker">Bring your own agent</p>
            <h2>Any agent. One canvas.</h2>
            <p className="sub">
              Pick an agent and follow its tool calls over MCP, straight into the document you have
              open.
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
            <h2>Built for people who work with agents.</h2>
          </Reveal>
          <div className="bento">
            <Card className="card-wide">
              <h3>Agent-native</h3>
              <p>
                Claude, Codex, Cursor and opencode connect over MCP and edit the same document you
                do, through typed transactions.
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
              <h3>Local-first</h3>
              <p>Runs entirely on your machine. No account, no hosted service.</p>
              <LocalFirstArt />
            </Card>
            <Card className="card-full">
              <h3>One-way export</h3>
              <p>
                Download PNG, JPG or HTML, or copy the HTML. Exports never round-trip, so the canvas
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
            <p className="sub">Sheet runs on macOS, Windows and Linux, with the same canvas on each.</p>
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
