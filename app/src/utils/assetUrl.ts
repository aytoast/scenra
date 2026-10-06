/** Static deployment keeps bundled assets under Vite's configured base. */
export function assetUrl(url: string): string {
  const base = import.meta.env.BASE_URL
  if (!url.startsWith('/') || url.startsWith(base) && base !== '/') return url
  return `${base}${url.slice(1)}`
}

export function bundledUrls(value: unknown): unknown {
  if (typeof value === 'string' && /^\/(worlds|stageon)\//.test(value)) return assetUrl(value)
  if (Array.isArray(value)) return value.map(bundledUrls)
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([key, entry]) => [key, bundledUrls(entry)]))
  return value
}
