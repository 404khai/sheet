import { useEffect, useState } from 'react'
import { Button } from '@sheet/ui/button'
import { Spinner } from '@sheet/ui/spinner'
import { toastManager } from '@sheet/ui/toast'
import { cn } from '@sheet/ui/utils'
import {
  checkForUpdate,
  getAppVersion,
  getAutoUpdate,
  installWithToasts,
  setAutoUpdate,
  type UpdateCheck,
} from '../lib/updates'
import { Section, SwitchRow } from './appearance-settings'

type Phase = { name: 'idle' } | { name: 'checking' } | { name: 'done'; result: UpdateCheck }

function statusLine(phase: Phase) {
  if (phase.name === 'checking') return 'Checking…'
  if (phase.name === 'idle') return 'Not checked yet this session.'
  const { result } = phase
  if (result.status === 'upToDate') return `You are on the latest version, ${result.version}.`
  if (result.status === 'available') return `Sheet ${result.version} is available.`
  return result.message
}

/**
 * The version, a button that looks for a newer one, and whether Sheet looks on
 * its own. A found update is installed from here or from the toast the main
 * window shows; either way Sheet restarts into it.
 */
export function UpdatesSettings({ className }: { className?: string }) {
  const [version, setVersion] = useState<string | null>(null)
  const [auto, setAuto] = useState(true)
  const [phase, setPhase] = useState<Phase>({ name: 'idle' })

  useEffect(() => {
    setAuto(getAutoUpdate())
    void getAppVersion().then(setVersion)
  }, [])

  const check = async () => {
    setPhase({ name: 'checking' })
    const result = await checkForUpdate()
    setPhase({ name: 'done', result })
    if (result.status === 'upToDate') {
      toastManager.add({ type: 'success', title: 'Sheet is up to date', description: `Version ${result.version}.` })
    } else if (result.status === 'error') {
      toastManager.add({ type: 'error', title: 'Could not check for updates', description: result.message })
    }
  }

  const available = phase.name === 'done' && phase.result.status === 'available' ? phase.result : null

  return (
    <div className={cn('flex flex-col gap-6', className)}>
      <Section label="Version" hint="Updates are signed and checked against a key built into Sheet before they install.">
        <div className="flex items-center gap-3">
          <span className="font-mono text-xs font-semibold px-2.5 py-1 rounded-lg bg-surface shadow-[0_1px_2px_rgba(0,0,0,0.06),inset_0_1px_0_rgba(255,255,255,0.8)] dark:shadow-[0_1px_2px_rgba(0,0,0,0.3),inset_0_1px_0_rgba(255,255,255,0.08)] border border-line/70 text-foreground tabular-nums">
            v{version ?? '—'}
          </span>
          <p
            role="status"
            className={cn(
              'text-xs',
              phase.name === 'done' && phase.result.status === 'error' ? 'text-destructive-foreground' : 'text-muted-foreground',
            )}
          >
            {statusLine(phase)}
          </p>
        </div>
        {available?.notes ? (
          <p className="max-h-40 overflow-y-auto whitespace-pre-wrap text-xs leading-relaxed text-muted-foreground rounded-xl border border-line/70 bg-surface-2/40 p-3 shadow-inner">
            {available.notes}
          </p>
        ) : null}
        <div className="flex gap-2 pt-1">
          {available ? (
            <Button type="button" onClick={() => void installWithToasts(available.version)}>
              Install and restart
            </Button>
          ) : (
            <Button type="button" variant="outline" disabled={phase.name === 'checking'} onClick={() => void check()}>
              {phase.name === 'checking' ? <Spinner /> : null}
              Check for updates
            </Button>
          )}
        </div>
      </Section>

      <Section label="Automatic updates" hint="Look for a new version when Sheet opens and every few hours. You choose when to install.">
        <SwitchRow
          label="Check for updates automatically"
          checked={auto}
          onChange={(next) => {
            setAuto(next)
            setAutoUpdate(next)
          }}
        />
      </Section>
    </div>
  )
}
