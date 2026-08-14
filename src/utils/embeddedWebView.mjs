const TRUE_VALUES = new Set(['1', 'true', 'yes'])

const hasEmbeddedFlag = (locationLike) => {
  if (!locationLike) return false

  const search = new URLSearchParams(locationLike.search || '')
  if (TRUE_VALUES.has(String(search.get('embedded') || '').toLowerCase())) return true

  const hashQuery = String(locationLike.hash || '').split('?')[1] || ''
  const hashSearch = new URLSearchParams(hashQuery)
  return TRUE_VALUES.has(String(hashSearch.get('embedded') || '').toLowerCase())
}

export const isEmbeddedWebView = ({
  userAgent = globalThis.navigator?.userAgent || '',
  location = globalThis.location,
  safeAreaInsetTop = 0
} = {}) => {
  if (hasEmbeddedFlag(location)) return true

  const ua = String(userAgent)
  const isAndroid = /\bAndroid\b/i.test(ua)
  const isAndroidWebView = /;\s*wv\)/i.test(ua)
    || (isAndroid && /\bVersion\/\d/i.test(ua) && /\bChrome\/\d/i.test(ua))
    // Some Android shells intentionally expose a normal Chrome UA. A non-zero
    // CSS safe-area inset in that environment means the host already owns the
    // system-bar spacing, so the page must use embedded layout semantics.
    || (isAndroid && Number(safeAreaInsetTop) > 0)
  const isIosWebView = /\b(?:iPhone|iPad|iPod)\b/i.test(ua)
    && /\bAppleWebKit\b/i.test(ua)
    && !/\bSafari\b/i.test(ua)

  return isAndroidWebView || isIosWebView
}

export const readSafeAreaInsetTop = (documentLike = globalThis.document) => {
  if (!documentLike?.documentElement || !documentLike?.createElement || !globalThis.getComputedStyle) return 0

  const probe = documentLike.createElement('div')
  probe.setAttribute('aria-hidden', 'true')
  probe.style.cssText = [
    'position:fixed',
    'inset:0 auto auto 0',
    'visibility:hidden',
    'pointer-events:none',
    'padding-top:env(safe-area-inset-top)'
  ].join(';')
  documentLike.documentElement.appendChild(probe)
  const inset = Number.parseFloat(globalThis.getComputedStyle(probe).paddingTop) || 0
  probe.remove()
  return inset
}
