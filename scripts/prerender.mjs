// After `vite build` (client) and `vite build --ssr src/prerender.tsx`:
//  - dist/shell.html   the untouched app shell (the team portal uses it);
//  - dist/index.html and dist/<path>/index.html for every public page, each
//    with its own title, description, canonical, Open Graph / Twitter tags,
//    JSON-LD and the page's HTML already inside #root (readable without JS);
//  - dist/404.html     the not-found page (noindex), served with status 404;
//  - dist/sitemap.xml  every indexable public page, with lastmod.
// Fails the build if any expected marker is missing from index.html.

import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const root = process.cwd();
const dist = path.join(root, 'dist');
const ssrDir = path.join(root, 'dist-ssr');
const { render, renderNotFound, unpublishedMarkets, PUBLIC_PATHS, ORIGIN } = await import(pathToFileURL(path.join(ssrDir, 'prerender.js')).href);

const template = readFileSync(path.join(dist, 'index.html'), 'utf8');
writeFileSync(path.join(dist, 'shell.html'), template);

const esc = (s) => s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
function swap(html, re, value, what) {
  if (!re.test(html)) throw new Error(`prerender: marker not found in index.html: ${what}`);
  return html.replace(re, value);
}

function page({ html, head }) {
  const url = `${ORIGIN}${head.path === '/' ? '/' : head.path}`;
  let out = template;
  out = swap(out, /<html lang="en">/, '<html lang="en" data-prerendered>', '<html>');
  out = swap(out, /<title>[\s\S]*?<\/title>/, `<title>${esc(head.title)}</title>`, 'title');
  out = swap(out, /<meta name="description" content="[^"]*" \/>/, `<meta name="description" content="${esc(head.description)}" />`, 'description');
  if (head.noindex) out = swap(out, /<meta name="robots" content="[^"]*" \/>/, '<meta name="robots" content="noindex, follow" />', 'robots');
  out = swap(out, /<link rel="canonical" href="[^"]*" \/>/, head.noindex ? '' : `<link rel="canonical" href="${url}" />`, 'canonical');
  out = swap(out, /<meta property="og:url" content="[^"]*" \/>/, `<meta property="og:url" content="${url}" />`, 'og:url');
  out = swap(out, /<meta property="og:title" content="[^"]*" \/>/, `<meta property="og:title" content="${esc(head.title)}" />`, 'og:title');
  out = swap(out, /<meta property="og:description" content="[^"]*" \/>/, `<meta property="og:description" content="${esc(head.description)}" />`, 'og:description');
  out = swap(out, /<meta name="twitter:title" content="[^"]*" \/>/, `<meta name="twitter:title" content="${esc(head.title)}" />`, 'twitter:title');
  out = swap(out, /<meta name="twitter:description" content="[^"]*" \/>/, `<meta name="twitter:description" content="${esc(head.description)}" />`, 'twitter:description');
  const ld = head.jsonLd.map((j) => `<script type="application/ld+json">${JSON.stringify(j).replace(/</g, '\\u003c')}</script>`).join('\n    ');
  out = swap(out, /<\/head>/, `    ${ld}\n  </head>`, '</head>');
  out = swap(out, /<div id="root"><\/div>/, `<div id="root">${html}</div>`, '#root');
  return out;
}

for (const p of PUBLIC_PATHS) {
  const r = render(p);
  const out = page(r);
  const dir = path.join(dist, ...p.split('/').filter(Boolean));
  mkdirSync(dir, { recursive: true });
  writeFileSync(path.join(dir, 'index.html'), out);
  console.log(`prerender: ${p} (${Math.round(out.length / 1024)} KB)`);
}
writeFileSync(path.join(dist, '404.html'), page(renderNotFound()));
console.log('prerender: 404.html');

// Sitemap: only indexable public pages (never /team, the API or the 404).
const lastmod = new Date().toISOString().slice(0, 10);
const prio = (p) => (p === '/' ? '1.0' : p === '/services' ? '0.9' : p.startsWith('/services/') || p === '/work' ? '0.8' : ['/terms', '/privacy', '/refund-policy'].includes(p) ? '0.3' : '0.7');
const urls = PUBLIC_PATHS.map((p) => `  <url>\n    <loc>${ORIGIN}${p}</loc>\n    <lastmod>${lastmod}</lastmod>\n    <priority>${prio(p)}</priority>\n  </url>`).join('\n');
writeFileSync(path.join(dist, 'sitemap.xml'), `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>\n`);
console.log(`prerender: sitemap.xml with ${PUBLIC_PATHS.length} URLs`);

for (const m of unpublishedMarkets()) console.log(`prerender: market ${m.path} NOT published — missing: ${m.missing.join('; ')}`);

rmSync(ssrDir, { recursive: true, force: true });
