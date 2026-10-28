import { useState, type ReactNode } from 'react'
import { apiUrl } from '@sheet/platform'
import { CheckIcon, CopyIcon, MoreHorizontalIcon } from '@sheet/ui/icons'
import { Spinner } from '@sheet/ui/spinner'
import { cn } from '@sheet/ui/utils'
import {
  AntigravityLogo,
  ClaudeCodeLogo,
  CodexLogo,
  CursorLogo,
  GithubCopilotLogo,
  OpenCodeLogo,
  VSCodeLogo,
} from './agent-logos'

/** Where the local Sheet server answers MCP over HTTP. */
export const MCP_URL = 'http://127.0.0.1:4100/mcp'

type IconProps = { className?: string }

const OtherGlyph = ({ className }: IconProps) => <MoreHorizontalIcon className={className} />

interface Step {
  title: string
  body?: string
  /** Text to copy, shown in a code block. */
  code?: string
  file?: string
}

interface Agent {
  key: string
  name: string
  icon: (props: IconProps) => ReactNode
  /** The local server writes the MCP entry into this agent's config. Absent: manual setup. */
  restartHint?: string
  manual?: Step[]
  note?: string
}

const jsonRemote = (key: string, extra: Record<string, unknown>) =>
  JSON.stringify({ [key]: { sheet: extra } }, null, 2)

export const AGENTS: Agent[] = [
  { key: 'cursor', name: 'Cursor', icon: CursorLogo, restartHint: 'Restart Cursor or reload MCP servers to pick it up.' },
  { key: 'claude-code', name: 'Claude Code', icon: ClaudeCodeLogo, restartHint: 'Run /mcp in Claude Code to check the connection.' },
  {
    key: 'github-copilot',
    name: 'Copilot',
    icon: GithubCopilotLogo,
    restartHint: 'Start the "sheet" server from the tools icon in Agent mode.',
    note: 'Copilot reads the same MCP config as VS Code.',
  },
  { key: 'vscode', name: 'VS Code', icon: VSCodeLogo, restartHint: 'Start the "sheet" server from the tools icon in Agent mode.' },
  { key: 'opencode', name: 'OpenCode', icon: OpenCodeLogo, restartHint: 'Run `opencode mcp list` to check the connection.' },
  { key: 'codex', name: 'Codex', icon: CodexLogo, restartHint: 'Restart Codex so it picks up the new server.' },
  { key: 'antigravity', name: 'Antigravity', icon: AntigravityLogo, restartHint: 'Reload the agent panel to pick it up.' },
  {
    key: 'other',
    name: 'Other',
    icon: OtherGlyph,
    manual: [
      { title: 'Point your agent at the endpoint', body: 'Any client that speaks Streamable HTTP MCP works. No auth, loopback only.', code: MCP_URL },
      { title: 'Or use a JSON config', file: 'mcp.json', code: jsonRemote('mcpServers', { url: MCP_URL }) },
    ],
    note: 'Config formats differ between harnesses. Check your agent’s docs and adjust the shape.',
  },
]

export type InstallState =
  | { phase: 'idle' }
  | { phase: 'installing' }
  | { phase: 'done'; path: string; already: boolean }
  | { phase: 'failed'; message: string }

type InstallResponse =
  | { ok: true; path: string; status: 'installed' | 'updated' | 'already-installed' }
  | { ok: false; message: string }

export async function requestInstall(agent: string): Promise<InstallState> {
  try {
    const response = await fetch(apiUrl('/api/agent-install'), {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ agent }),
    })
    const body: InstallResponse = await response.json()
    if (body.ok) return { phase: 'done', path: body.path, already: body.status === 'already-installed' }
    return { phase: 'failed', message: body.message }
  } catch {
    return {
      phase: 'failed',
      message: 'Could not reach the local Sheet server. Make sure it is running, then try again. Nothing was changed.',
    }
  }
}

const EXAMPLE_PROMPTS = [
  'Create a hero section with a headline and two buttons in Sheet',
  'Set up 3 color tokens and a swatch row in Sheet',
  'Add a heart icon in coral, 32px, to the header in Sheet',
]

function useCopy() {
  const [copied, setCopied] = useState<string | null>(null)
  const copy = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text)
      setCopied(text)
      window.setTimeout(() => setCopied((current) => (current === text ? null : current)), 1_800)
    } catch {
      setCopied(null)
    }
  }
  return { copied, copy }
}

function CopyButton({ text, label }: { text: string; label: string }) {
  const { copied, copy } = useCopy()
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={() => void copy(text)}
      className="grid size-7 shrink-0 place-items-center rounded-md text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
    >
      {copied === text ? <CheckIcon className="size-3.5 text-success-foreground" /> : <CopyIcon className="size-3.5" />}
    </button>
  )
}

function CodeBlock({ code, file }: { code: string; file?: string }) {
  return (
    <div className="min-w-0 overflow-hidden rounded-lg border border-line bg-well">
      <div className="flex items-center justify-between gap-2 border-b border-line/70 ps-3 pe-1 text-[11px] text-muted-foreground">
        <span className="min-w-0 truncate py-1.5 font-mono">{file ?? 'terminal'}</span>
        <CopyButton text={code} label="Copy" />
      </div>
      <pre className="overflow-x-auto p-3 font-mono text-xs leading-relaxed text-foreground">{code}</pre>
    </div>
  )
}

function InstallButton({ agent }: { agent: Agent }) {
  const [state, setState] = useState<InstallState>({ phase: 'idle' })
  const installing = state.phase === 'installing'
  const done = state.phase === 'done'

  const install = async () => {
    setState({ phase: 'installing' })
    setState(await requestInstall(agent.key))
  }

  return (
    <div className="flex flex-col gap-2">
      <button
        type="button"
        disabled={installing}
        onClick={() => void install()}
        className="inline-flex h-9 w-fit items-center gap-2 rounded-lg border border-line bg-foreground px-4 text-xs font-medium text-background transition-opacity hover:opacity-90 active:scale-[0.98] disabled:opacity-70"
      >
        {installing ? <Spinner className="size-3.5" /> : done ? <CheckIcon className="size-3.5" /> : null}
        {installing ? `Connecting ${agent.name}…` : done ? `Connected to ${agent.name}` : `Connect ${agent.name}`}
      </button>
      {state.phase === 'done' ? (
        <p className="text-xs leading-relaxed text-muted-foreground">
          {state.already ? 'Already set up in' : 'Added to'} <span className="font-mono">{state.path}</span>. {agent.restartHint}
        </p>
      ) : null}
      {state.phase === 'failed' ? (
        <p role="alert" className="text-xs leading-relaxed text-destructive-foreground">{state.message}</p>
      ) : null}
    </div>
  )
}

export type SkillEntry =
  | { label: string; path: string; status: 'installed' | 'updated' }
  | { label: string; path: string; status: 'skipped' | 'failed'; message: string }

export type SkillState =
  | { phase: 'idle' }
  | { phase: 'installing' }
  | { phase: 'done'; entries: SkillEntry[] }
  | { phase: 'failed'; message: string; entries: SkillEntry[] }

export async function requestSkillInstall(): Promise<SkillState> {
  try {
    const response = await fetch(apiUrl('/api/skill-install'), {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: '{}',
    })
    const body: { ok: boolean; entries?: SkillEntry[]; message?: string } = await response.json()
    const entries = body.entries ?? []
    if (body.ok) return { phase: 'done', entries }
    return {
      phase: 'failed',
      message: body.message ?? 'Some folders could not be written. The ones listed as installed are fine.',
      entries,
    }
  } catch {
    return {
      phase: 'failed',
      message: 'Could not reach the local Sheet server. Make sure it is running, then try again. Nothing was changed.',
      entries: [],
    }
  }
}

/** One click copies the Sheet design skill into every agent skills folder on this machine. */
function SkillInstall() {
  const [state, setState] = useState<SkillState>({ phase: 'idle' })
  const installing = state.phase === 'installing'
  const entries = state.phase === 'done' || state.phase === 'failed' ? state.entries : []

  const install = async () => {
    setState({ phase: 'installing' })
    setState(await requestSkillInstall())
  }

  return (
    <div className="flex flex-col gap-2 border-t border-line pt-4">
      <h4 className="text-xs font-medium text-foreground">Install the design skill</h4>
      <p className="text-xs leading-relaxed text-muted-foreground">
        Teaches your agent how to design well in Sheet. Installs into the skills folder of every agent found on this machine.
      </p>
      <button
        type="button"
        disabled={installing}
        onClick={() => void install()}
        className="inline-flex h-9 w-fit items-center gap-2 rounded-lg border border-line bg-foreground px-4 text-xs font-medium text-background transition-opacity hover:opacity-90 active:scale-[0.98] disabled:opacity-70"
      >
        {installing ? <Spinner className="size-3.5" /> : state.phase === 'done' ? <CheckIcon className="size-3.5" /> : null}
        {installing ? 'Installing skill…' : state.phase === 'done' ? 'Skill installed' : 'Install skill'}
      </button>
      {entries.length > 0 ? (
        <ul className="flex flex-col gap-1 text-xs text-muted-foreground">
          {entries.map((entry) => (
            <li key={entry.path} className="flex min-w-0 items-baseline gap-2">
              <span className="w-16 shrink-0 text-foreground">
                {entry.status === 'installed' ? 'Added' : entry.status === 'updated' ? 'Updated' : entry.status === 'skipped' ? 'Skipped' : 'Failed'}
              </span>
              <span className="min-w-0 truncate" title={entry.status === 'failed' ? entry.message : entry.path}>
                {entry.label}
              </span>
            </li>
          ))}
        </ul>
      ) : null}
      {state.phase === 'failed' ? <p role="alert" className="text-xs leading-relaxed text-destructive-foreground">{state.message}</p> : null}
    </div>
  )
}

function ManualSteps({ steps }: { steps: Step[] }) {
  return (
    <ol className="flex flex-col">
      {steps.map((step, index) => (
        <li key={step.title} className="relative flex gap-3 pb-5 last:pb-0">
          {index < steps.length - 1 ? (
            <span className="absolute start-[0.6875rem] top-6 bottom-0 w-px bg-line" aria-hidden="true" />
          ) : null}
          <span className="relative grid size-[1.375rem] shrink-0 place-items-center rounded-full border border-line bg-surface-2 font-mono text-[10px] text-muted-foreground">
            {index + 1}
          </span>
          <div className="flex min-w-0 flex-1 flex-col gap-2">
            <h4 className="text-sm font-medium leading-[1.375rem] text-foreground">{step.title}</h4>
            {step.body ? <p className="text-xs leading-relaxed text-muted-foreground">{step.body}</p> : null}
            {step.code ? <CodeBlock code={step.code} file={step.file} /> : null}
          </div>
        </li>
      ))}
    </ol>
  )
}

export function ConnectAgent({ className }: { className?: string }) {
  const [selected, setSelected] = useState(AGENTS[0]?.key ?? 'cursor')
  const agent = AGENTS.find((entry) => entry.key === selected) ?? AGENTS[0]
  const { copied, copy } = useCopy()
  if (!agent) return null

  return (
    <div className={cn('flex min-w-0 flex-col gap-5', className)}>
      {/* Live endpoint */}
      <div
        className="flex min-w-0 items-center gap-3 rounded-2xl bg-surface px-4 py-3 shadow-lift"
      >
        {/* Live: a steady dot with one soft halo, not a strobing ping. */}
        <span className="cx-live size-2 shrink-0 rounded-full bg-success" aria-hidden="true" />
        <div className="min-w-0 flex-1">
          <div className="text-[11px] text-muted-foreground">Local MCP endpoint</div>
          <div className="mt-0.5 truncate font-mono text-xs font-medium text-foreground">{MCP_URL}</div>
        </div>
        <CopyButton text={MCP_URL} label="Copy endpoint" />
      </div>

      {/* Agent picker */}
      <div role="tablist" aria-label="Agent" className="grid grid-cols-[repeat(auto-fill,minmax(4.75rem,1fr))] gap-2">
        {AGENTS.map((entry) => {
          const Icon = entry.icon
          const active = entry.key === agent.key
          return (
            <button
              key={entry.key}
              type="button"
              role="tab"
              aria-selected={active}
              onClick={() => setSelected(entry.key)}
              // `aria-checked` drives the tile's chosen ring (`cx-tile`); `aria-selected` keeps tab semantics.
              aria-checked={active}
              className={cn(
                'cx-tile flex min-w-0 flex-col items-center gap-1.5 rounded-xl bg-surface px-2 py-3 text-[11px] outline-none focus-visible:ring-2 focus-visible:ring-ring',
                active ? 'font-medium text-foreground' : 'text-muted-foreground hover:text-foreground',
              )}
            >
              <Icon className="size-5" />
              <span className="w-full truncate text-center">{entry.name}</span>
            </button>
          )
        })}
      </div>

      {agent.manual ? <ManualSteps steps={agent.manual} /> : <InstallButton key={agent.key} agent={agent} />}
      {agent.note ? <p className="text-xs leading-relaxed text-muted-foreground">{agent.note}</p> : null}

      <SkillInstall />

      {/* First prompt */}
      <div className="flex flex-col gap-2 border-t border-line/70 pt-4">
        <h4 className="text-xs font-medium text-foreground">Try a first prompt</h4>
        <div className="flex flex-col gap-1.5">
          {EXAMPLE_PROMPTS.map((prompt) => (
            <button
              key={prompt}
              type="button"
              onClick={() => void copy(prompt)}
              className="group flex min-w-0 items-center gap-2.5 rounded-xl bg-surface px-3.5 py-2.5 text-start text-xs text-muted-foreground shadow-raised outline-none transition-[box-shadow,color,scale] duration-150 ease-smooth hover:text-foreground hover:shadow-raised-hover active:scale-[0.985] active:shadow-pressed focus-visible:ring-2 focus-visible:ring-ring"
            >
              <span className="min-w-0 flex-1 truncate">{prompt}</span>
              {copied === prompt ? (
                <span key="copied" className="cx-swap shrink-0 text-[11px] font-medium text-success-foreground">Copied</span>
              ) : (
                <CopyIcon className="size-3.5 shrink-0 opacity-50 transition-opacity group-hover:opacity-100" />
              )}
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}
