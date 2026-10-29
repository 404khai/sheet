import { useEffect, useState, type CSSProperties } from 'react'
import { play } from 'cuelume'
import type { Platform } from './diagrams'
import { prefersReducedMotion } from './hooks'
import { WindowControls } from './window-controls'

/** A layer the agent puts on the canvas. */
type Layer = 'frame' | 'nav' | 'header' | 'toggle' | 'plans' | 'starter' | 'pro' | 'team'

/** What a tool call does to the design: inserts a layer, or changes one already there. */
type Effect = Exclude<Layer, 'plans'> | 'popular' | 'yearly' | 'motion'

type Line =
  | { kind: 'prompt'; text: string }
  | { kind: 'call'; tool: string; detail: string; effect?: Effect }
  | { kind: 'note'; text: string }

/** One line in the agent's terminal, shown `gap` ms after the line before it has finished. */
type Step = { gap: number; line: Line }

const steps: readonly Step[] = [
  { gap: 500, line: { kind: 'prompt', text: 'design a pricing page for northwind' } },
  { gap: 500, line: { kind: 'note', text: 'Reading the canvas first.' } },
  { gap: 600, line: { kind: 'call', tool: 'viewCanvas', detail: 'Page 1 · empty' } },
  { gap: 700, line: { kind: 'call', tool: 'setTokens', detail: 'ink, paper, brand #4f46e5, radius 16' } },
  {
    gap: 700,
    line: { kind: 'call', tool: 'createFrame', detail: 'Pricing — Desktop · 1280 × 860', effect: 'frame' },
  },
  { gap: 800, line: { kind: 'call', tool: 'insertNodes', detail: 'Nav · logo, 3 links, sign in', effect: 'nav' } },
  {
    gap: 800,
    line: { kind: 'call', tool: 'insertNodes', detail: 'Header · “Pricing that grows with you”', effect: 'header' },
  },
  {
    gap: 800,
    line: { kind: 'call', tool: 'insertNodes', detail: 'Billing toggle · Monthly / Yearly', effect: 'toggle' },
  },
  { gap: 800, line: { kind: 'call', tool: 'insertNodes', detail: 'Plan card · Starter · $0', effect: 'starter' } },
  { gap: 700, line: { kind: 'call', tool: 'insertNodes', detail: 'Plan card · Pro · $24', effect: 'pro' } },
  { gap: 700, line: { kind: 'call', tool: 'insertNodes', detail: 'Plan card · Team · $64', effect: 'team' } },
  {
    gap: 900,
    line: { kind: 'call', tool: 'patchNodes', detail: 'Pro · brand border, “Most popular”', effect: 'popular' },
  },
  { gap: 900, line: { kind: 'note', text: 'Pricing page is on the canvas: 3 plans, Pro highlighted.' } },
  { gap: 1600, line: { kind: 'prompt', text: 'make yearly the default, animate the cards' } },
  {
    gap: 600,
    line: { kind: 'call', tool: 'patchNodes', detail: 'Billing toggle → Yearly · prices −20%', effect: 'yearly' },
  },
  {
    gap: 900,
    line: { kind: 'call', tool: 'animateNodes', detail: 'Plans · fade-in-up · stagger 80ms', effect: 'motion' },
  },
  { gap: 1200, line: { kind: 'note', text: 'Done. Yearly is the default; the cards fade in on load.' } },
]

/** How long one character of a prompt takes to type. */
const TYPE_MS = 38

/** When each step appears, and when the run is over. */
const timeline = steps.reduce<{ times: number[]; clock: number }>(
  ({ times, clock }, { gap, line }) => {
    const at = clock + gap
    const typing = line.kind === 'prompt' ? line.text.length * TYPE_MS : 0
    return { times: [...times, at], clock: at + typing }
  },
  { times: [], clock: 0 },
)

const LOOP_AT = timeline.clock + 4500

/** The layer a change selects while the agent makes it. */
const selects: Record<Effect, Layer> = {
  frame: 'frame',
  nav: 'nav',
  header: 'header',
  toggle: 'toggle',
  starter: 'starter',
  pro: 'pro',
  team: 'team',
  popular: 'pro',
  yearly: 'toggle',
  motion: 'plans',
}

const layers: readonly { id: Layer; name: string; depth: number; from: Effect }[] = [
  { id: 'frame', name: 'Pricing — Desktop', depth: 0, from: 'frame' },
  { id: 'nav', name: 'Nav', depth: 1, from: 'nav' },
  { id: 'header', name: 'Header', depth: 1, from: 'header' },
  { id: 'toggle', name: 'Billing toggle', depth: 1, from: 'toggle' },
  { id: 'plans', name: 'Plans', depth: 1, from: 'starter' },
  { id: 'starter', name: 'Starter', depth: 2, from: 'starter' },
  { id: 'pro', name: 'Pro', depth: 2, from: 'pro' },
  { id: 'team', name: 'Team', depth: 2, from: 'team' },
]

/** What the inspector shows for each layer. */
const inspect: Record<Layer, { x: number; y: number; w: number; h: number; layout: string; radius: number; fill: string }> = {
  frame: { x: 0, y: 0, w: 1280, h: 860, layout: 'Column · gap 48', radius: 0, fill: 'FFFFFF' },
  nav: { x: 0, y: 0, w: 1280, h: 72, layout: 'Row · space between', radius: 0, fill: 'FFFFFF' },
  header: { x: 320, y: 120, w: 640, h: 132, layout: 'Column · gap 16', radius: 0, fill: 'None' },
  toggle: { x: 528, y: 284, w: 224, h: 40, layout: 'Row · gap 4', radius: 999, fill: 'F1F1F4' },
  plans: { x: 112, y: 372, w: 1056, h: 428, layout: 'Row · gap 24', radius: 0, fill: 'None' },
  starter: { x: 112, y: 372, w: 336, h: 428, layout: 'Column · gap 20', radius: 16, fill: 'FFFFFF' },
  pro: { x: 472, y: 372, w: 336, h: 428, layout: 'Column · gap 20', radius: 16, fill: 'FFFFFF' },
  team: { x: 832, y: 372, w: 336, h: 428, layout: 'Column · gap 20', radius: 16, fill: 'FFFFFF' },
}

const plans = [
  {
    id: 'starter',
    name: 'Starter',
    monthly: 0,
    yearly: 0,
    blurb: 'For side projects',
    features: ['1 editor', '3 designs', 'Community help'],
    cta: 'Start free',
  },
  {
    id: 'pro',
    name: 'Pro',
    monthly: 24,
    yearly: 19,
    blurb: 'For working designers',
    features: ['Unlimited designs', 'Version history', 'Agent handoff'],
    cta: 'Start trial',
  },
  {
    id: 'team',
    name: 'Team',
    monthly: 64,
    yearly: 51,
    blurb: 'For product teams',
    features: ['Shared tokens', 'Branches & review', 'Priority support'],
    cta: 'Talk to us',
  },
] as const

const icons = {
  pointer: 'M4 2.5l8.5 3.6-3.7 1.3-1.3 3.7z',
  hand: 'M5.5 8V3.8a1 1 0 0 1 2 0V7.5m0-.5V3a1 1 0 0 1 2 0v4.5m0-3a1 1 0 0 1 2 0V9a4.5 4.5 0 0 1-8.3 2.4L2 9.3a1 1 0 0 1 1.6-1.2L5.5 10',
  frame: 'M5 2v12M11 2v12M2 5h12M2 11h12',
  rect: 'M3 3h10v10H3z',
  text: 'M3.5 3.5h9M8 3.5v9',
  pen: 'M3 13l1.2-3.8L10.5 3 13 5.5l-6.2 6.3zM9.2 4.3l2.5 2.5',
  image: 'M2.5 3.5h11v9h-11zM2.5 10.5l3-3 3 3 2-2 3 3',
  grid: 'M2.5 2.5h4.5v4.5H2.5zM9 2.5h4.5v4.5H9zM2.5 9h4.5v4.5H2.5zM9 9h4.5v4.5H9z',
  file: 'M4 1.5h5.5L12.5 4.5v10H4zM9.5 1.5v3h3',
  panel: 'M2.5 3h11v10h-11zM6 3v10',
  check: 'M3.5 8.5l3 3 6-7',
} as const

function Icon({ name }: { name: keyof typeof icons }) {
  return (
    <svg className="demo-icon" viewBox="0 0 16 16" aria-hidden="true">
      <path d={icons[name]} />
    </svg>
  )
}

/** The agent's selection: an outline, four handles and its name. */
function Selection() {
  return (
    <span className="demo-sel" aria-hidden="true">
      <i />
      <i />
      <i />
      <i />
      <b>claude</b>
    </span>
  )
}

function Typed({ text }: { text: string }) {
  return (
    <span className="t-typed" style={{ '--n': text.length, '--ms': `${text.length * TYPE_MS}ms` } as CSSProperties}>
      {text}
    </span>
  )
}

function TerminalLine({ line, live }: { line: Line; live: boolean }) {
  if (line.kind === 'prompt') {
    return (
      <li className="t-prompt">
        <span className="t-chevron">❯</span>
        <Typed text={line.text} />
        {live && <span className="caret" />}
      </li>
    )
  }
  if (line.kind === 'note') {
    return (
      <li className="t-note">
        <span className="t-dot" />
        {line.text}
      </li>
    )
  }
  return (
    <li className="t-call" data-live={live}>
      <span className="t-dot" />
      sheet – <b>{line.tool}</b> <span className="t-dim">(MCP)</span>
      <span className="t-out">└ {line.detail}</span>
    </li>
  )
}

/** The pricing page the agent builds, showing only what `has` says exists. */
function PricingDesign({ has, selected }: { has: (effect: Effect) => boolean; selected: Layer | null }) {
  const yearly = has('yearly')
  return (
    <div className="demo-frame" data-on={has('frame')}>
      <span className="demo-frame-label">Pricing — Desktop</span>
      {selected === 'frame' && <Selection />}
      <div className="nw-nav" data-on={has('nav')}>
        <span className="nw-logo">
          <i />
          Northwind
        </span>
        <span className="nw-links">
          <span>Product</span>
          <span>Customers</span>
          <span>Pricing</span>
        </span>
        <span className="nw-signin">Sign in</span>
        {selected === 'nav' && <Selection />}
      </div>
      <div className="nw-head" data-on={has('header')}>
        <span className="nw-eyebrow">Pricing</span>
        <strong>Pricing that grows with you</strong>
        <span className="nw-sub">Start free. Upgrade when your team does.</span>
        {selected === 'header' && <Selection />}
      </div>
      <div className="nw-toggle" data-on={has('toggle')} data-yearly={yearly}>
        <span>Monthly</span>
        <span>
          Yearly <em>−20%</em>
        </span>
        {selected === 'toggle' && <Selection />}
      </div>
      <div className="nw-plans" data-on={has('starter')} data-motion={has('motion')}>
        {plans.map((plan, index) => (
          <div
            key={plan.id}
            className="nw-plan"
            data-on={has(plan.id)}
            data-popular={plan.id === 'pro' && has('popular')}
            style={{ '--i': index } as CSSProperties}
          >
            {plan.id === 'pro' && <span className="nw-badge">Most popular</span>}
            <span className="nw-plan-name">{plan.name}</span>
            <span className="nw-price">
              <strong key={String(yearly)}>${yearly ? plan.yearly : plan.monthly}</strong>
              <span>/ mo</span>
            </span>
            <span className="nw-blurb">{plan.blurb}</span>
            <ul>
              {plan.features.map((feature) => (
                <li key={feature}>
                  <Icon name="check" />
                  {feature}
                </li>
              ))}
            </ul>
            <span className="nw-cta">{plan.cta}</span>
            {selected === plan.id && <Selection />}
          </div>
        ))}
        {selected === 'plans' && <Selection />}
      </div>
    </div>
  )
}

function LayerProps({ layer, animated }: { layer: Layer; animated: boolean }) {
  const info = inspect[layer]
  return (
    <div className="demo-props">
      <p className="demo-heading">{layers.find(({ id }) => id === layer)?.name}</p>
      <p className="demo-label">Layout</p>
      <div className="demo-fields">
        <span>
          <i>X</i>
          {info.x}
        </span>
        <span>
          <i>Y</i>
          {info.y}
        </span>
        <span>
          <i>W</i>
          {info.w}
        </span>
        <span>
          <i>H</i>
          {info.h}
        </span>
      </div>
      <p className="demo-label">Auto layout</p>
      <span className="demo-field">{info.layout}</span>
      <p className="demo-label">Radius</p>
      <span className="demo-field">{info.radius}</span>
      <p className="demo-label">Fill</p>
      <span className="demo-field">
        {info.fill !== 'None' && <i className="demo-swatch" style={{ background: `#${info.fill}` }} />}
        {info.fill}
      </span>
      <p className="demo-label">Animation</p>
      <span className="demo-field">{layer === 'plans' && animated ? 'fade-in-up · load' : 'None'}</span>
    </div>
  )
}

function Inspector({ selected, agent, animated }: { selected: Layer | null; agent: boolean; animated: boolean }) {
  return (
    <aside className="demo-inspector">
      <div className="demo-people">
        <span className="demo-avatar">You</span>
        {agent && (
          <span className="demo-avatar" data-agent="true">
            C
          </span>
        )}
        <span className="demo-zoom">71%</span>
      </div>
      <span className="demo-export">Export</span>
      {selected ? (
        <LayerProps key={selected} layer={selected} animated={animated} />
      ) : (
        <div className="demo-props">
          <p className="demo-heading">Page 1</p>
          <p className="demo-label">Stage</p>
          <span className="demo-field">
            <i className="demo-swatch" style={{ background: 'var(--cx-canvas)' }} />
            Canvas
          </span>
          <p className="demo-label">Export</p>
          <span className="demo-field">PNG · 2×</span>
        </div>
      )}
    </aside>
  )
}

/** Sheet's editor with Claude designing a pricing page in it, its tool calls streaming in a terminal. */
export function HeroDemo({ platform }: { platform: Platform }) {
  const [shown, setShown] = useState(0)
  const [run, setRun] = useState(0)

  useEffect(() => {
    if (prefersReducedMotion()) {
      setShown(steps.length)
      return
    }
    setShown(0)
    const timers = timeline.times.map((at, index) => setTimeout(() => setShown(index + 1), at))
    timers.push(setTimeout(() => play('success', { emphasis: 'subtle' }), timeline.clock))
    timers.push(setTimeout(() => setRun((value) => value + 1), LOOP_AT))
    return () => timers.forEach(clearTimeout)
  }, [run])

  const visible = steps.slice(0, shown)
  const done = new Set(visible.flatMap(({ line }) => (line.kind === 'call' && line.effect ? [line.effect] : [])))
  const has = (effect: Effect) => done.has(effect)
  /** The layer of the latest change; a note means the agent let go. */
  const selected = visible.reduce<Layer | null>((current, { line }) => {
    if (line.kind === 'call' && line.effect) return selects[line.effect]
    if (line.kind === 'note') return null
    return current
  }, null)
  const agent = visible.some(({ line }) => line.kind === 'call')
  const working = visible.at(-1)?.line.kind === 'call'

  return (
    <figure className="demo" aria-label="Claude designs a pricing page in Sheet while its MCP tool calls stream in a terminal">
      <div className="demo-window window" data-os={platform} aria-hidden="true">
        <div className="demo-bar">
          <WindowControls platform={platform} />
          <span className="demo-tab">
            <Icon name="grid" />
            Home
          </span>
          <span className="demo-tab" data-active="true">
            <Icon name="file" />
            Northwind — Pricing
            <i>×</i>
          </span>
          <span className="demo-tab">
            <Icon name="file" />
            Brand
          </span>
          <span className="demo-tab">
            <Icon name="file" />
            Onboarding
          </span>
        </div>
        <div className="demo-body">
          <aside className="demo-sidebar">
            <p className="demo-file">
              <span className="ticks">
                <i />
                <i />
                <i />
                <i />
                <i />
              </span>
              Northwind
              <Icon name="panel" />
            </p>
            <p className="demo-label">Pages</p>
            <ul className="demo-pages">
              <li data-active="true">
                <Icon name="file" />
                Page 1
              </li>
              <li>
                <Icon name="file" />
                Mobile
              </li>
            </ul>
            <p className="demo-label">Layers</p>
            <ul className="demo-layers">
              {layers.map((layer) => (
                <li
                  key={layer.id}
                  data-on={has(layer.from)}
                  data-active={selected === layer.id}
                  style={{ '--depth': layer.depth } as CSSProperties}
                >
                  <Icon name={layer.depth === 0 ? 'frame' : 'rect'} />
                  {layer.name}
                </li>
              ))}
            </ul>
          </aside>
          <div className="demo-rail">
            <span data-active="true">
              <Icon name="pointer" />
            </span>
            <span>
              <Icon name="hand" />
            </span>
            <span>
              <Icon name="frame" />
            </span>
            <span>
              <Icon name="rect" />
            </span>
            <span>
              <Icon name="text" />
            </span>
            <span>
              <Icon name="pen" />
            </span>
            <span>
              <Icon name="image" />
            </span>
          </div>
          <div className="demo-canvas" data-working={working}>
            <PricingDesign has={has} selected={selected} />
          </div>
          <Inspector selected={selected} agent={agent} animated={has('motion')} />
        </div>
      </div>
      <div className="demo-term">
        <div className="demo-term-bar">
          <span className="lights" aria-hidden="true">
            <i />
            <i />
            <i />
          </span>
          ~/code/northwind — claude
          <button type="button" className="demo-replay" data-cuelume-tap onClick={() => setRun((value) => value + 1)}>
            Replay
          </button>
        </div>
        <ol className="demo-log">
          {visible.map((step, index) => (
            <TerminalLine key={index} line={step.line} live={index === shown - 1} />
          ))}
        </ol>
      </div>
    </figure>
  )
}
