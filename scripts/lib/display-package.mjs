import { createHash } from 'node:crypto';
import { gzipSync, gunzipSync } from 'node:zlib';
import { readFile, readdir, writeFile, mkdir, rm, realpath } from 'node:fs/promises';
import path from 'node:path';

export const RESOURCE_ID = 'owcs-package-resources';
const resourceTag = /<script id="owcs-package-resources" type="application\/json">([\s\S]*?)<\/script>/;
const safeJson = value => JSON.stringify(value).replace(/</g, '\\u003c');
export const digest = value => createHash('sha256').update(value).digest('hex');
export const encodeResource = (bytes, type) => ({ type, encoding: type === 'application/json' ? 'gzip' : 'base64',
  bytes: bytes.length, sha256: digest(bytes), data: (type === 'application/json' ? gzipSync(bytes, { level: 9 }) : bytes).toString('base64') });
export const decodeResource = record => {
  const bytes = Buffer.from(record.data, 'base64');
  return record.encoding === 'gzip' ? gunzipSync(bytes) : bytes;
};
export const parseDisplayHtml = html => {
  const match = html.match(resourceTag);
  if (!match) throw new Error('Missing embedded display resources');
  const payload = JSON.parse(match[1]);
  if (payload.schemaVersion !== 1 || !payload.files) throw new Error('Invalid embedded display resources');
  const read = name => {
    if (!payload.files[name]) throw new Error(`Missing embedded file: ${name}`);
    return decodeResource(payload.files[name]);
  };
  return { html, payload, read, json: name => JSON.parse(read(name)) };
};
export const openDisplayPackage = async directory => parseDisplayHtml(await readFile(path.join(directory, 'index.html'), 'utf8'));
// Used by browser fixtures: change only encoded test data, never executable code.
export const replaceDisplayResources = (html, replacements) => {
  const { payload } = parseDisplayHtml(html);
  for (const [name, value] of Object.entries(replacements)) payload.files[name] = encodeResource(Buffer.from(JSON.stringify(value)), 'application/json');
  return html.replace(resourceTag, () => `<script id="${RESOURCE_ID}" type="application/json">${safeJson(payload)}</script>`);
};

const walk = async (directory, prefix = '') => {
  const files = [];
  for (const item of await readdir(directory, { withFileTypes: true })) {
    const name = `${prefix}${item.name}`;
    if (item.isDirectory()) files.push(...await walk(path.join(directory, item.name), `${name}/`));
    else if (item.isFile()) files.push(name);
    else throw new Error(`Unsupported build output: ${name}`);
  }
  return files.sort();
};
const types = { '.json': 'application/json', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
  '.webp': 'image/webp', '.gif': 'image/gif', '.svg': 'image/svg+xml', '.ico': 'image/x-icon' };

export const embedDisplayPackage = async (directory, projectRoot = process.cwd()) => {
  const root = path.resolve(directory);
  // Only generated dist directories may be replaced; reject symlinks/junctions.
  const allowed = ['dist', 'dist-api'].map(name => path.resolve(projectRoot, name));
  if (!allowed.includes(root) || await realpath(root) !== root) throw new Error('Unexpected display output directory');
  let html = await readFile(path.join(root, 'index.html'), 'utf8');
  const script = [...html.matchAll(/<script\b[^>]*\bsrc="\.\/([^"]+)"[^>]*><\/script>/g)];
  const style = [...html.matchAll(/<link\b[^>]*\bhref="\.\/([^"]+\.css)"[^>]*>/g)];
  if (script.length !== 1 || style.length !== 1) throw new Error('Display build must have exactly one JS and CSS bundle');
  const license = await readFile(new URL('../../node_modules/fflate/LICENSE', import.meta.url), 'utf8');
  const code = `/*! fflate\n${license}\n*/\n${await readFile(path.join(root, script[0][1]), 'utf8')}`
    .replace(/\r\n?/g, '\n').replace(/<\/script/gi, '<\\/script');
  const css = await readFile(path.join(root, style[0][1]), 'utf8');
  if (/<\/style/i.test(css)) throw new Error('Unsafe inline stylesheet');
  const files = {}, sidecars = {};
  for (const name of await walk(root)) {
    if (name === 'index.html' || name === script[0][1] || name === style[0][1]) continue;
    const bytes = await readFile(path.join(root, name));
    if (['DEPLOY.txt', 'package-manifest.json', 'site-config.json', 'static-data/manifest.json'].includes(name)) sidecars[name] = bytes;
    if (['DEPLOY.txt', 'package-manifest.json'].includes(name)) continue;
    const type = types[path.extname(name).toLowerCase()];
    if (!type) throw new Error(`Unrecognized display resource: ${name}`);
    files[name] = encodeResource(bytes, type);
  }
  const scriptHash = createHash('sha256').update(code).digest('base64');
  html = html.replace(script[0][0], () => `<script type="module" data-owcs-app>${code}</script>`)
    .replace(style[0][0], () => `<style data-owcs-style>${css}</style>`)
    .replace("script-src 'self'", `script-src 'sha256-${scriptHash}'`)
    .replace(/href="\.\/favicon\.ico(?:\?[^"]*)?"/, () => `href="data:image/x-icon;base64,${files['favicon.ico'].data}"`);
  // Bundled libraries may contain literal </body> strings. Only use the actual
  // document terminator so embedding data never changes the hashed application.
  const bodyEnd = html.lastIndexOf('</body>');
  if (bodyEnd < 0) throw new Error('Missing document body');
  html = `${html.slice(0, bodyEnd)}<script id="${RESOURCE_ID}" type="application/json">${safeJson({ schemaVersion: 1, files })}</script>${html.slice(bodyEnd)}`;
  // Everything necessary to run is now in HTML. Sidecars are audit metadata only.
  await rm(root, { recursive: true });
  await mkdir(root, { recursive: true });
  await writeFile(path.join(root, 'index.html'), html);
  for (const [name, bytes] of Object.entries(sidecars)) {
    await mkdir(path.dirname(path.join(root, name)), { recursive: true });
    await writeFile(path.join(root, name), bytes);
  }
  console.log(`Embedded HTML: ${Object.keys(files).length} resources, ${(Buffer.byteLength(html) / 1024 / 1024).toFixed(1)} MiB; no CDN asset requests`);
};
