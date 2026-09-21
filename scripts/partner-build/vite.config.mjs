// The application in public/app.html is already built. Vite copies it verbatim.
// Only the small redirect entry is parsed, including when a host ignores this config.
export default { base: './', build: { outDir: 'dist' } };
