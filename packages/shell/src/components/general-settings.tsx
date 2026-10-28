import { useEffect, useState } from 'react'
import { cn } from '@sheet/ui/utils'
import { DEFAULT_STARTUP_VIEW, getStartupView, setStartupView, type StartupView } from '../lib/startup'
import { Section, Segmented } from './appearance-settings'

const STARTUP_LABELS: Record<StartupView, string> = {
  home: 'Home',
  'last-file': 'Last file',
}

/** How Sheet behaves around your work, as opposed to how it looks. */
export function GeneralSettings({ className }: { className?: string }) {
  const [startup, setStartup] = useState<StartupView>(DEFAULT_STARTUP_VIEW)

  useEffect(() => {
    setStartup(getStartupView())
  }, [])

  return (
    <div className={cn('flex flex-col gap-4 sm:gap-5', className)}>
      <Section
        label="On launch"
        hint="Open on Home with every file, or straight back into the file you had open last. If that file was closed, Sheet opens on Home."
        value={STARTUP_LABELS[startup]}
      >
        <Segmented
          label="On launch"
          value={startup}
          options={(['home', 'last-file'] as const).map((option) => ({
            value: option,
            content: <span className="text-xs">{STARTUP_LABELS[option]}</span>,
          }))}
          onChange={(next) => {
            setStartup(next)
            setStartupView(next)
          }}
        />
      </Section>
    </div>
  )
}
