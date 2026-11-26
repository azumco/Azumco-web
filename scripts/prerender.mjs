// After `vite build` (client) and `vite build --ssr src/prerender.tsx`:
// writes dist/services/index.html and dist/services/<slug>/index.html, each
// with its own title, description, canonical, Open Graph / Twitter tags,
// JSON-LD and the page's HTML already in #root (crawlable without JS). The
// browser then renders the same page over it. Also adds the routes to
// dist/sitemap.xml. Fails the build on any missing marker.

import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const root = process.cwd();
const dist = path.join(root, 'dist');
const ssrDir = path.join(root, 'dist-ssr');
const { render, SERVICE_PATHS, ORIGIN } = await import(pathToFileURL(path.join(ssrDir, 'prerender.js')).href);

const template = readFileSync(path.join(dist, 'index.html'), 'utf8');
const esc = (s) => s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

function swap(html, re, value, what) {
  if (!re.test(html)) throw new Error(`prerender: marker not found in index.html: ${what}`);
  return html.replace(re, value);
}

for (const p of SERVICE_PATHS) {
  const { html, head } = render(p);
  const url = `${ORIGIN}${head.path}`;
  let out = template;
  out = swap(out, /<title>[\s\S]*?<\/title>/, `<title>${esc(head.title)}</title>`, 'title');
  out = swap(out, /<meta name="description" content="[^"]*" \/>/, `<meta name="description" content="${esc(head.description)}" />`, 'description');
  out = swap(out, /<link rel="canonical" href="[^"]*" \/>/, `<link rel="canonical" href="${url}" />`, 'canonical');
  out = swap(out, /<meta property="og:url" content="[^"]*" \/>/, `<meta property="og:url" content="${url}" />`, 'og:url');
  out = swap(out, /<meta property="og:title" content="[^"]*" \/>/, `<meta property="og:title" content="${esc(head.title)}" />`, 'og:title');
  out = swap(out, /<meta property="og:description" content="[^"]*" \/>/, `<meta property="og:description" content="${esc(head.description)}" />`, 'og:description');
  out = swap(out, /<meta name="twitter:title" content="[^"]*" \/>/, `<meta name="twitter:title" content="${esc(head.title)}" />`, 'twitter:title');
  out = swap(out, /<meta name="twitter:description" content="[^"]*" \/>/, `<meta name="twitter:description" content="${esc(head.description)}" />`, 'twitter:description');
  const ld = head.jsonLd.map((j) => `<script type="application/ld+json">${JSON.stringify(j).replace(/</g, '\\u003c')}</script>`).join('\n    ');
  out = swap(out, /<\/head>/, `    ${ld}\n  </head>`, '</head>');
  out = swap(out, /<div id="root"><\/div>/, `<div id="root">${html}</div>`, '#root');

  const dir = path.join(dist, ...head.path.split('/').filter(Boolean));
  mkdirSync(dir, { recursive: true });
  writeFileSync(path.join(dir, 'index.html'), out);
  console.log(`prerender: ${head.path} (${Math.round(out.length / 1024)} KB)`);
}

// Sitemap: the existing entries plus every services page.
const sitemapPath = path.join(dist, 'sitemap.xml');
let sitemap = readFileSync(sitemapPath, 'utf8');
const entries = SERVICE_PATHS.filter((p) => !sitemap.includes(`<loc>${ORIGIN}${p}</loc>`))
  .map((p) => `  <url>\n    <loc>${ORIGIN}${p}</loc>\n    <changefreq>monthly</changefreq>\n    <priority>${p === '/services' ? '0.9' : '0.8'}</priority>\n  </url>`)
  .join('\n');
sitemap = swap(sitemap, /<\/urlset>/, `${entries}\n</urlset>`, 'sitemap </urlset>');
writeFileSync(sitemapPath, sitemap);
console.log(`prerender: sitemap has ${(sitemap.match(/<loc>/g) || []).length} URLs`);

rmSync(ssrDir, { recursive: true, force: true });
