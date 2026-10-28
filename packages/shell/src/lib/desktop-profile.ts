import { useQuery } from '@tanstack/react-query'

export type DesktopProfile = {
  firstName: string
  imageUrl: string | null
}

/** The local account's name and picture, as the desktop host reports them. */
async function loadDesktopProfile(): Promise<DesktopProfile> {
  const response = await fetch('/desktop/profile')
  if (!response.ok) throw new Error('Could not read the local account profile')
  const payload: unknown = await response.json()
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    throw new Error('The local account profile response is invalid')
  }
  const firstName = Reflect.get(payload, 'firstName')
  const imageUrl = Reflect.get(payload, 'imageUrl')
  if (
    typeof firstName !== 'string' ||
    (typeof imageUrl !== 'string' && imageUrl !== null)
  ) {
    throw new Error('The local account profile response is invalid')
  }
  return { firstName, imageUrl }
}

/** The profile, read once per session; `undefined` until it arrives or when the host has none. */
export function useDesktopProfile() {
  return useQuery({
    queryKey: ['desktop-profile'],
    queryFn: loadDesktopProfile,
    staleTime: Infinity,
    retry: false,
  }).data
}
