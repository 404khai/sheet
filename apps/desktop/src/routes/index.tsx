import { createFileRoute, redirect } from '@tanstack/react-router'
import { getLastOpenFile } from '@sheet/editor/lib/open-tabs'
import { getStartupView } from '@sheet/shell/lib/startup'

/**
 * The window has no landing page. It opens on Home, or, when the person chose
 * so in Settings › General, straight back into the file they had open last.
 */
export const Route = createFileRoute('/')({
  beforeLoad: () => {
    const last = getStartupView() === 'last-file' ? getLastOpenFile() : null
    if (last) throw redirect({ to: '/design/$id', params: { id: last }, replace: true })
    throw redirect({ to: '/app', replace: true })
  },
})
