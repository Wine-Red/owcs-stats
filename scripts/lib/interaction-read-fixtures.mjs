// Data-only suites isolate interaction reads. The interaction suite verifies
// real cross-origin POST and streams without writing votes to production.
export const isInteractionUrl = (url, config) => [config?.pollApiBaseUrl, config?.assistantApiBaseUrl].filter(Boolean).some(base => url.startsWith(base + '/'));
export async function fulfillInteractionRead(route, config) {
  const url = route.request().url();
  if (!isInteractionUrl(url, config)) return false;
  if (route.request().method() !== 'GET') throw new Error('Data-only suite must not write interactions');
  let json;
  if (url.startsWith(config.pollApiBaseUrl + '/upcoming')) {
    const response = await fetch(config.apiBaseUrl + '/matches/upcoming');
    if (!response.ok) throw new Error('Upcoming fixture read failed');
    json = await response.json();
  } else json = url.startsWith(config.assistantApiBaseUrl + '/') ? { configured: false, showInVisualize: false } : { sources: {}, matches: {} };
  await route.fulfill({ status: 200, headers: { 'Access-Control-Allow-Origin': '*', 'Cache-Control': 'no-store' }, json });
  return true;
}
