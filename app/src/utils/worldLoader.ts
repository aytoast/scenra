import worlds from 'virtual:worlds'
import { type World, type WorldEntry } from '../types/world'
import { assetUrl, bundledUrls } from './assetUrl'

export function loadWorlds(): WorldEntry[] {
  return bundledUrls(worlds) as WorldEntry[]
}

export async function fetchWorlds(): Promise<WorldEntry[]> {
  if (!import.meta.env.DEV) return loadWorlds()

  const response = await fetch('/__worlds', { cache: 'no-store' })
  if (!response.ok) throw new Error(await response.text())
  return response.json() as Promise<WorldEntry[]>
}

export function localWorldAssetUrl(url: string | undefined): string {
  return url?.startsWith(assetUrl('/worlds/')) ? url : ''
}

export function getSplatUrl(world: World, vr = false): string {
  const urls = world.assets.splats.spz_urls
  if (vr) return localWorldAssetUrl(urls['100k']) || localWorldAssetUrl(urls['500k']) || localWorldAssetUrl(urls.full_res)
  return localWorldAssetUrl(urls.full_res)
}
