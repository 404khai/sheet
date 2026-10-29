import {
  GithubStars,
  GithubStarsIcon,
  GithubStarsLogo,
  GithubStarsNumber,
  GithubStarsParticles,
} from '@animate-ui/react/primitives/github-stars'
import type { SVGProps } from 'react'
import { REPO } from './download'

const [, username = '', repo = ''] = new URL(REPO).pathname.split('/')

function Star(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" strokeWidth={2} strokeLinejoin="round" {...props}>
      <path d="M12 2.5l2.9 6.1 6.6.9-4.8 4.6 1.2 6.6L12 17.5l-5.9 3.2 1.2-6.6L2.5 9.5l6.6-.9z" />
    </svg>
  )
}

export function NavGithubStars() {
  return (
    <a className="gh-stars-link" href={REPO} aria-label="Sheet on GitHub" data-cuelume-navigate>
      <GithubStars username={username} repo={repo} className="gh-stars">
        <GithubStarsLogo className="gh-stars-logo" />
        <span className="gh-stars-count">
          <GithubStarsNumber className="gh-stars-number" />
          <GithubStarsParticles className="gh-stars-particles">
            <GithubStarsIcon icon={Star} className="gh-stars-star" color="currentColor" />
          </GithubStarsParticles>
        </span>
      </GithubStars>
    </a>
  )
}
