import { useMemo, useState } from 'react'
import type { WebDocument, WebTransaction } from '@sheet/canvas/web-model'
import { ChevronDownIcon, ChevronRightIcon, PlusIcon, Trash2Icon } from '@sheet/ui/icons'
import { cn } from '@sheet/ui/utils'
import {
  declareTokenOperations,
  deleteDeclaredTokenOperations,
  editDeclaredTokenOperations,
  extractWebTokens,
  freshTokenName,
  NEW_TOKEN_DEFAULTS,
  promoteUsedValueOperations,
  replaceUsedValueOperations,
  TOKEN_GROUP_ORDER,
  validTokenName,
  type TokenGroup,
  type WebToken,
} from '../lib/web-tokens'

type Transact = (label: string, operations: WebTransaction['operations']) => void

const tokenKey = (token: WebToken) => `${token.source}:${token.name}`

/** `<input type="color">` only accepts #rrggbb. */
function colorInputValue(value: string) {
  if (/^#[0-9a-f]{6}$/i.test(value)) return value.toLowerCase()
  const short = /^#([0-9a-f])([0-9a-f])([0-9a-f])$/i.exec(value)
  if (short) return `#${short[1]}${short[1]}${short[2]}${short[2]}${short[3]}${short[3]}`.toLowerCase()
  return '#000000'
}

const fieldClass =
  'h-7 min-w-0 flex-1 rounded-md border border-line bg-well px-2 text-xs text-foreground outline-none focus:border-cx-accent/60'

function TokenEditor({
  token,
  tokens,
  document,
  transact,
  onSelect,
}: {
  token: WebToken
  tokens: WebToken[]
  document: WebDocument
  transact: Transact
  onSelect: (key: string | null) => void
}) {
  const [name, setName] = useState(token.name)
  const [value, setValue] = useState(token.value)
  const [error, setError] = useState<string | null>(null)

  const commit = () => {
    const nextValue = value.trim()
    const nextName = name.trim()
    if (nextValue === '') {
      setError('Value can’t be empty.')
      return
    }
    if (token.source === 'declared') {
      if (nextName === token.name && nextValue === token.value) return
      if (!validTokenName(nextName)) {
        setError('Use letters, numbers, dashes and underscores only.')
        return
      }
      if (nextName !== token.name && tokens.some((other) => other.source === 'declared' && other.name === nextName)) {
        setError(`"${nextName}" already exists. Pick another name.`)
        return
      }
      setError(null)
      transact('Edit token', editDeclaredTokenOperations(token, { name: nextName, value: nextValue }))
      onSelect(`declared:${nextName}`)
      return
    }
    if (nextName !== token.name) {
      if (!validTokenName(nextName)) {
        setError('Use letters, numbers, dashes and underscores only.')
        return
      }
      if (tokens.some((other) => other.source === 'declared' && other.name === nextName)) {
        setError(`"${nextName}" already exists. Pick another name.`)
        return
      }
      setError(null)
      transact('Name design value', promoteUsedValueOperations(document, token, { name: nextName, value: nextValue }))
      onSelect(`declared:${nextName}`)
      return
    }
    if (nextValue === token.value) return
    setError(null)
    transact('Update design value', replaceUsedValueOperations(document, token, nextValue))
    onSelect(`used:${token.group === 'Color' ? nextValue.toLowerCase() : nextValue}`)
  }

  return (
    <div className="app-page-enter mx-2 mb-1 flex flex-col gap-2 rounded-xl bg-well/60 p-2.5 shadow-sunken">
      {token.group === 'Color' ? (
        <input
          type="color"
          aria-label="Pick color"
          value={colorInputValue(value)}
          onChange={(event) => setValue(event.target.value)}
          onBlur={commit}
          className="h-16 w-full cursor-pointer rounded-md border border-line bg-transparent p-0"
        />
      ) : null}
      <label className="flex items-center gap-2 text-xs text-muted-foreground">
        <span className="w-10 shrink-0">Name</span>
        <input
          value={name}
          onChange={(event) => setName(event.target.value)}
          onBlur={commit}
          onKeyDown={(event) => event.key === 'Enter' && event.currentTarget.blur()}
          className={fieldClass}
        />
      </label>
      <label className="flex items-center gap-2 text-xs text-muted-foreground">
        <span className="w-10 shrink-0">Value</span>
        <input
          value={value}
          onChange={(event) => setValue(event.target.value)}
          onBlur={commit}
          onKeyDown={(event) => event.key === 'Enter' && event.currentTarget.blur()}
          className={cn(fieldClass, 'font-mono')}
        />
      </label>
      {token.source === 'used' ? (
        <p className="text-[11px] leading-relaxed text-muted-foreground">
          Used {token.count} {token.count === 1 ? 'time' : 'times'}. Rename it to make it a named token, or change the value to update every use.
        </p>
      ) : null}
      {error ? <p role="alert" className="text-[11px] leading-relaxed text-destructive-foreground">{error}</p> : null}
      {token.source === 'declared' ? (
        <button
          type="button"
          onClick={() => {
            transact('Delete token', deleteDeclaredTokenOperations(token))
            onSelect(null)
          }}
          className="inline-flex h-7 w-fit items-center gap-1.5 rounded-md px-2 text-xs text-muted-foreground transition-colors hover:bg-secondary hover:text-destructive-foreground"
        >
          <Trash2Icon className="size-3.5" />
          Delete token
        </button>
      ) : null}
    </div>
  )
}

export function ThemePanel({ document, transact }: { document: WebDocument; transact: Transact }) {
  const tokens = useMemo(() => extractWebTokens(document), [document])
  const [collapsed, setCollapsed] = useState<ReadonlySet<TokenGroup>>(new Set())
  const [selected, setSelected] = useState<string | null>(null)

  const toggle = (group: TokenGroup) =>
    setCollapsed((current) => {
      const next = new Set(current)
      if (next.has(group)) next.delete(group)
      else next.add(group)
      return next
    })

  const addToken = (group: TokenGroup) => {
    const defaults = NEW_TOKEN_DEFAULTS[group]
    const name = freshTokenName(tokens, defaults.prefix)
    transact('Add token', declareTokenOperations(document, name, defaults.value))
    setCollapsed((current) => {
      const next = new Set(current)
      next.delete(group)
      return next
    })
    setSelected(`declared:${name}`)
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-y-auto">
      <div className="flex h-9 shrink-0 items-center justify-between border-b border-line px-3 text-xs text-muted-foreground">
        <span>{tokens.length === 0 ? 'No tokens' : `${tokens.length} ${tokens.length === 1 ? 'token' : 'tokens'}`}</span>
        <button
          type="button"
          title="Add color token"
          aria-label="Add color token"
          className="rounded p-0.5 text-muted-foreground hover:text-foreground"
          onClick={() => addToken('Color')}
        >
          <PlusIcon className="size-3.5" />
        </button>
      </div>

      {tokens.length === 0 ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-3 p-6 text-center">
          <p className="max-w-[12.5rem] text-xs leading-relaxed text-muted-foreground">
            Nothing to pull from this design yet. Add a token, or start from the basics.
          </p>
          <div className="flex flex-wrap justify-center gap-1.5">
            {(['Color', 'Radius', 'Spacing', 'Font'] as const).map((group) => (
              <button
                key={group}
                type="button"
                onClick={() => addToken(group)}
                className="rounded-lg bg-surface px-2.5 py-1 text-xs text-foreground shadow-raised outline-none transition-[box-shadow,scale] duration-150 ease-smooth hover:shadow-raised-hover active:scale-[0.96] active:shadow-pressed focus-visible:ring-2 focus-visible:ring-ring"
              >
                + {group}
              </button>
            ))}
          </div>
        </div>
      ) : (
        <div className="flex flex-col gap-1 p-2">
          {TOKEN_GROUP_ORDER.map((group) => {
            const items = tokens.filter((token) => token.group === group)
            if (items.length === 0) return null
            const open = !collapsed.has(group)
            const Chevron = open ? ChevronDownIcon : ChevronRightIcon
            return (
              <section key={group} className="flex flex-col">
                <div className="group/header flex items-center">
                  <button
                    type="button"
                    aria-expanded={open}
                    onClick={() => toggle(group)}
                    className="flex min-w-0 flex-1 items-center gap-1.5 rounded-md px-2 py-1.5 text-sm font-medium text-foreground hover:bg-secondary/60"
                  >
                    <Chevron className="size-3.5 text-muted-foreground" />
                    {group}
                  </button>
                  <button
                    type="button"
                    title={`Add ${group.toLowerCase()} token`}
                    aria-label={`Add ${group.toLowerCase()} token`}
                    onClick={() => addToken(group)}
                    className="rounded p-1 text-muted-foreground opacity-0 transition-opacity hover:text-foreground focus-visible:opacity-100 group-hover/header:opacity-100"
                  >
                    <PlusIcon className="size-3.5" />
                  </button>
                </div>
                {open
                  ? items.map((token) => {
                      const key = tokenKey(token)
                      const active = selected === key
                      return (
                        <div key={key} className="flex flex-col">
                          <button
                            type="button"
                            aria-pressed={active}
                            onClick={() => setSelected(active ? null : key)}
                            className={cn(
                              'flex min-w-0 items-center gap-3 rounded-md px-2 py-1.5 text-start hover:bg-secondary/60',
                              active && 'bg-secondary/80',
                            )}
                          >
                            {group === 'Color' ? (
                              <span
                                className="size-5 shrink-0 rounded-md border border-line"
                                style={{ background: token.value }}
                                aria-hidden="true"
                              />
                            ) : null}
                            <span
                              className="min-w-0 flex-1 truncate text-sm text-foreground"
                              title={token.source === 'declared' ? `--${token.name}` : token.value}
                            >
                              {token.name}
                            </span>
                            {token.source === 'used' ? (
                              <span className="shrink-0 font-mono text-xs text-muted-foreground" title={`Used ${token.count} times`}>
                                {token.count}
                              </span>
                            ) : group === 'Color' ? null : (
                              <span className="max-w-[40%] shrink-0 truncate font-mono text-xs text-muted-foreground" title={token.value}>
                                {token.value}
                              </span>
                            )}
                          </button>
                          {active ? (
                            <TokenEditor
                              key={key}
                              token={token}
                              tokens={tokens}
                              document={document}
                              transact={transact}
                              onSelect={setSelected}
                            />
                          ) : null}
                        </div>
                      )
                    })
                  : null}
              </section>
            )
          })}
        </div>
      )}
    </div>
  )
}
