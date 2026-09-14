// Main-site paths stay same-origin. Packages read their embedded configuration.
export async function interactionBase(feature) {
  if (import.meta.env?.MODE !== 'api-static') return feature === 'assistant' ? '/assistant/v1' : '/poll-api';
  const { loadSiteConfig } = await import('./siteRuntime.js');
  const config = await loadSiteConfig();
  if (!config.interactions?.[feature]) return null;
  return feature === 'assistant' ? config.assistantApiBaseUrl : config.pollApiBaseUrl;
}
