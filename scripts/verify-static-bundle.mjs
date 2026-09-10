import { readdir, readFile } from 'node:fs/promises'
import path from 'node:path'
import { verifyResources } from './lib/static-package.mjs'
import { fileURLToPath } from 'node:url'

const scriptsDirectory = path.dirname(fileURLToPath(import.meta.url))
const projectRoot = path.resolve(scriptsDirectory, '..')
const live = process.argv.includes('--api')
const distDirectory = path.join(projectRoot, live ? 'dist-api' : 'dist')
const assetsDirectory = path.join(distDirectory, 'assets')

const indexHtml = await readFile(path.join(distDirectory, 'index.html'), 'utf8')
const assetFiles = await readdir(assetsDirectory)
const javascriptFiles = assetFiles.filter((file) => file.endsWith('.js'))
const stylesheetFiles = assetFiles.filter((file) => file.endsWith('.css'))
const fontFiles = assetFiles.filter((file) => /\.(?:woff2?|ttf|otf)$/i.test(file))

const failures = []
if (live) {
  const { validateSiteConfig } = await import('../src/services/siteClient.mjs')
  const config = validateSiteConfig(JSON.parse(await readFile(path.join(distDirectory, 'site-config.json'), 'utf8')))
  const manifest = JSON.parse(await readFile(path.join(distDirectory, 'package-manifest.json'), 'utf8'))
  if (manifest.mode !== 'api' || manifest.apiVersion !== 1 || manifest.capabilities.bundledData !== false) failures.push('invalid API package manifest')
  if ((await readdir(distDirectory)).includes('static-data')) failures.push('API package contains snapshot data')
  for (const origin of [new URL(config.apiBaseUrl).origin, config.mediaOrigin]) if (!indexHtml.includes(origin)) failures.push(`CSP missing ${origin}`)
} else {
  const manifest = JSON.parse(await readFile(path.join(distDirectory, 'static-data/manifest.json'), 'utf8'))
  await verifyResources(path.join(distDirectory, 'static-data'), manifest)
}

if (!indexHtml.includes("connect-src 'self'")) failures.push('static package must restrict external connections')

if (javascriptFiles.length !== 1) {
  failures.push(`expected one JavaScript bundle, found ${javascriptFiles.length}`)
}

if (stylesheetFiles.length !== 1) {
  failures.push(`expected one stylesheet bundle, found ${stylesheetFiles.length}`)
}

if (fontFiles.length !== 0) {
  failures.push(`expected fonts to be inlined, found ${fontFiles.length} font files`)
}

const absoluteAssetReferences = [
  ...indexHtml.matchAll(/(?:src|href)=["']([^"']+)["']/g)
]
  .map((match) => match[1])
  .filter((reference) => reference.startsWith('/') || /^https?:\/\//i.test(reference))

if (absoluteAssetReferences.length > 0) {
  failures.push(`index.html contains non-portable asset paths: ${absoluteAssetReferences.join(', ')}`)
}

if (failures.length > 0) {
  throw new Error(`Static bundle portability check failed:\n- ${failures.join('\n- ')}`)
}

console.log(`Portable static bundle verified: ${javascriptFiles[0]}, ${stylesheetFiles[0]}`)
