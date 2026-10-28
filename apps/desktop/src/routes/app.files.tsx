import { createFileRoute } from '@tanstack/react-router'
import { Home } from '@sheet/shell/home'

export const Route = createFileRoute('/app/files')({ component: AppFilesPage })

/** The old Files page: Home, scrolled to the full list. */
function AppFilesPage() {
  return <Home initialSection="files" />
}
