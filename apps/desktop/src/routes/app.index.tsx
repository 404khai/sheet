import { createFileRoute } from '@tanstack/react-router'
import { Home } from '@sheet/shell/home'

export const Route = createFileRoute('/app/')({ component: HomePage })

function HomePage() {
  return <Home />
}
