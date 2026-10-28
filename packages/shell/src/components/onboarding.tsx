import { useCallback, useEffect, useState, type ReactNode } from 'react'
import { AnimatePresence, motion, useReducedMotion } from 'motion/react'
import { BrandMark } from '@sheet/ui/brand-mark'
import { Button } from '@sheet/ui/button'
import { GridPaper } from '@sheet/ui/grid-paper'
import { Sound } from '@sheet/ui/sound'
import { cn } from '@sheet/ui/utils'
import { fadeUp, uiTransition } from '../lib/motion'
import { AgentSetup } from './agent-setup'
import { AppearanceSettings, SoundSettings } from './appearance-settings'

const STORAGE_KEY = 'sheet:onboarded'

function hasOnboarded() {
  try {
    return globalThis.localStorage?.getItem(STORAGE_KEY) === '1'
  } catch {
    // Without storage there is nowhere to remember it; showing it is the safe side.
    return false
  }
}

function markOnboarded() {
  try {
    globalThis.localStorage?.setItem(STORAGE_KEY, '1')
  } catch {
    // It stays dismissed for this session.
  }
}

type Step = {
  id: 'welcome' | 'look' | 'sound' | 'agents'
  label: string
  title: ReactNode
  body: string
  content: ReactNode
}

const STEPS: readonly Step[] = [
  {
    id: 'welcome',
    label: 'Welcome',
    title: (
      <>
        sheet<span className="text-cx-accent">.</span>
      </>
    ),
    body: 'An infinite canvas of real, structured UI. Bring your own agent over MCP and it edits the same document you do.',
    content: null,
  },
  {
    id: 'look',
    label: 'Look',
    title: 'Make it yours',
    body: 'Both apply instantly. You can change them later in Settings.',
    content: <AppearanceSettings showScale={false} flat />,
  },
  {
    id: 'sound',
    label: 'Sound',
    title: 'Hear it',
    body: 'Short cues for taps, menus and finished work.',
    content: <SoundSettings flat />,
  },
  {
    id: 'agents',
    label: 'Agents',
    title: 'Connect your agent',
    body: 'Pick the agents you use. Sheet adds its MCP server to each and installs the design skill. You can do this later in Settings.',
    content: <AgentSetup />,
  },
]

/**
 * First-run welcome: a full-window sheet of four quiet steps (hello, look,
 * sound, agents) over the same grid paper as the rest of the app. Shown once
 * and not skippable, though every choice in it can be passed with Continue.
 * The choices are the ones Settings already owns, so nothing is stored twice.
 */
export function Onboarding() {
  const reduceMotion = useReducedMotion()
  const [open, setOpen] = useState(() => !hasOnboarded())
  const [index, setIndex] = useState(0)

  const step = STEPS[index]
  const last = index === STEPS.length - 1

  const finish = useCallback(() => {
    markOnboarded()
    Sound.success()
    setOpen(false)
  }, [])

  const next = useCallback(() => {
    if (last) return finish()
    Sound.navigate()
    setIndex((current) => current + 1)
  }, [finish, last])

  const back = useCallback(() => {
    Sound.navigate()
    setIndex((current) => Math.max(0, current - 1))
  }, [])

  useEffect(() => {
    if (open) Sound.open()
  }, [open])

  useEffect(() => {
    if (!open) return
    const onKeyDown = (event: KeyboardEvent) => {
      // A focused control owns Enter; only a bare Enter advances.
      if (event.key === 'Enter' && event.target === document.body) next()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [open, next])

  if (!step) return null

  const enter = fadeUp(reduceMotion)
  const transition = uiTransition(reduceMotion)

  return (
    <AnimatePresence>
      {open ? (
        <motion.div
          role="dialog"
          aria-modal="true"
          aria-label="Welcome to Sheet"
          className="fixed inset-0 z-50 grid place-items-center bg-cx-canvas p-6"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={transition}
        >
          <GridPaper className="pointer-events-none absolute inset-0" />

          <div className="relative flex max-h-[calc(100dvh-3rem)] w-full max-w-md flex-col gap-7 overflow-y-auto rounded-2xl bg-background p-6 shadow-panel-lg sm:p-7">
            <div className="flex items-center justify-between">
              <BrandMark />
              {/* The step in use is a longer pill; the ones behind it stay lit. */}
              <ol className="flex items-center gap-1" aria-label="Progress">
                {STEPS.map((item, position) => (
                  <li
                    key={item.id}
                    aria-current={position === index ? 'step' : undefined}
                    className={cn(
                      'h-1 rounded-full transition-[width,background-color] duration-300 ease-[cubic-bezier(0.23,1,0.32,1)]',
                      position === index ? 'w-5' : 'w-1.5',
                      position <= index ? 'bg-cx-accent' : 'bg-cx-ink/15',
                    )}
                  >
                    <span className="sr-only">{item.label}</span>
                  </li>
                ))}
              </ol>
            </div>

            <AnimatePresence mode="wait" initial={false}>
              <motion.div
                key={step.id}
                className="flex flex-col gap-7"
                initial={enter.initial}
                animate={enter.animate}
                exit={enter.exit}
                transition={transition}
              >
                <div className="flex flex-col gap-2">
                  <h1 className="text-2xl font-semibold tracking-tight text-balance">{step.title}</h1>
                  <p className="text-sm leading-relaxed text-pretty text-muted-foreground">{step.body}</p>
                </div>
                {step.content}
              </motion.div>
            </AnimatePresence>

            <div className="flex items-center justify-between">
              {index === 0 ? (
                <span aria-hidden="true" />
              ) : (
                <Button type="button" size="lg" variant="ghost" onClick={back}>
                  Back
                </Button>
              )}
              <Button type="button" size="lg" onClick={next}>
                {last ? 'Start designing' : 'Continue'}
              </Button>
            </div>
          </div>
        </motion.div>
      ) : null}
    </AnimatePresence>
  )
}
