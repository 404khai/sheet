import { createContext, useContext, useEffect, type ReactNode } from 'react'

/**
 * Something the command palette can run. The shell owns the palette and its
 * global commands; a screen adds its own (the editor's Fit to view, panel
 * switches, export) for as long as it is mounted, so the palette always lists
 * what can be done right here and nothing that can't.
 */
export interface AppCommand {
  id: string
  label: string
  /** Extra words that should find it, e.g. "zoom" for Fit to view. */
  keywords?: string
  /** A shortcut label, already formatted for this OS (`formatChord`). */
  shortcut?: string
  icon?: ReactNode
  run: () => void
}

export interface CommandRegistry {
  /** Adds `commands` under `source`, replacing what that source added before. */
  register: (source: string, commands: readonly AppCommand[]) => void
  unregister: (source: string) => void
  /** Opens the palette. */
  open: () => void
}

export const CommandRegistryContext = createContext<CommandRegistry | null>(null)

/** The palette, when there is a shell around this screen; `null` in tests and embeds. */
export const useCommandRegistry = () => useContext(CommandRegistryContext)

/**
 * Lists `commands` in the palette while the calling component is mounted.
 * Pass a stable array (memoised); a new array re-registers.
 */
export function useRegisterCommands(source: string, commands: readonly AppCommand[]) {
  const registry = useCommandRegistry()
  useEffect(() => {
    if (!registry) return
    registry.register(source, commands)
    return () => registry.unregister(source)
  }, [registry, source, commands])
}
