import { createFileRoute } from '@tanstack/react-router'
import { Home } from '@sheet/shell/home'

export const Route = createFileRoute('/app/new')({ component: NewTabPage })

/** The old New tab page: Home, with the search open to pick or start a file. */
function NewTabPage() {
  return <Home openSearch />
}
