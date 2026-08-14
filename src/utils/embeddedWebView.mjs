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
  location = globalThis.location
} = {}) => {
  if (hasEmbeddedFlag(location)) return true

  const ua = String(userAgent)
  const isAndroidWebView = /;\s*wv\)/i.test(ua)
    || (/\bAndroid\b/i.test(ua) && /\bVersion\/\d/i.test(ua) && /\bChrome\/\d/i.test(ua))
  const isIosWebView = /\b(?:iPhone|iPad|iPod)\b/i.test(ua)
    && /\bAppleWebKit\b/i.test(ua)
    && !/\bSafari\b/i.test(ua)

  return isAndroidWebView || isIosWebView
}
