// Hero illustrations for the service pages: small inline SVGs (no images, no
// 3D), drawn with the site's colour tokens. One per service.

import type { ReactNode } from 'react';
import type { ServiceArt as ArtKey } from '../../serviceTypes';

const BG = 'var(--bg-2)';
const PANEL = 'var(--bg-3)';
const LINE = 'var(--line-2)';
const SOFT = 'rgba(255,255,255,0.08)';
const FG = 'rgba(245,242,236,0.92)';
const BRAND = 'var(--brand)';
const BRAND2 = 'var(--brand-2)';

const LABEL: Record<ArtKey, string> = {
  web: 'A website on a laptop and a phone',
  phone: 'A mobile app on a phone screen',
  software: 'A dashboard with charts and a table',
  automation: 'Connected steps of an automated workflow',
  pin: 'A map pin above a search result',
  social: 'A grid of social media posts',
  ads: 'An ad card with a rising results chart',
  brand: 'A logo mark with colour swatches and type',
  video: 'A video timeline with a play button',
  care: 'A shield over a website with uptime checks',
};

function Frame({ id, children, label }: { id: string; children: ReactNode; label: string }) {
  return (
    <svg viewBox="0 0 520 420" role="img" aria-label={label} className="h-auto w-full" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <radialGradient id={`${id}-glow`} cx="0.78" cy="0.2" r="0.75">
          <stop offset="0" stopColor="#ff6a00" stopOpacity="0.32" />
          <stop offset="1" stopColor="#ff6a00" stopOpacity="0" />
        </radialGradient>
      </defs>
      <rect x="0.5" y="0.5" width="519" height="419" rx="28" fill={BG} stroke={LINE} />
      <rect x="0.5" y="0.5" width="519" height="419" rx="28" fill={`url(#${id}-glow)`} />
      {children}
    </svg>
  );
}

const Bar = ({ x, y, w, h = 10, fill = SOFT, r }: { x: number; y: number; w: number; h?: number; fill?: string; r?: number }) => (
  <rect x={x} y={y} width={w} height={h} rx={r ?? h / 2} fill={fill} />
);

const ARTS: Record<ArtKey, () => ReactNode> = {
  web: () => (
    <>
      <rect x="60" y="60" width="400" height="300" rx="18" fill={PANEL} stroke={LINE} />
      <rect x="60" y="60" width="400" height="38" rx="18" fill="rgba(255,255,255,0.03)" />
      {[79, 97, 115].map((x) => <circle key={x} cx={x + 5} cy="79" r="5" fill={LINE} />)}
      <Bar x={150} y={71} w={220} h={16} fill="rgba(255,255,255,0.06)" />
      <Bar x={88} y={124} w={190} h={16} fill={FG} r={4} />
      <Bar x={88} y={148} w={150} h={16} fill={BRAND} r={4} />
      <Bar x={88} y={178} w={170} h={8} />
      <Bar x={88} y={194} w={140} h={8} />
      <rect x="88" y="222" width="96" height="30" rx="15" fill={BRAND} />
      <rect x="194" y="222" width="80" height="30" rx="15" fill="none" stroke={LINE} />
      <rect x="300" y="118" width="134" height="140" rx="12" fill="rgba(255,255,255,0.04)" />
      <circle cx="367" cy="188" r="36" fill={BRAND} />
      {[88, 206, 324].map((x, i) => <rect key={x} x={x} y="284" width={i === 2 ? 110 : 104} height="52" rx="10" fill="rgba(255,255,255,0.04)" />)}
      <rect x="370" y="260" width="96" height="150" rx="14" fill={PANEL} stroke={LINE} />
      <Bar x={382} y={276} w={76} h={10} fill={FG} r={3} />
      <Bar x={382} y={292} w={56} h={8} fill={BRAND} r={3} />
      <rect x="382" y="314" width="76" height="40" rx="8" fill="rgba(255,255,255,0.05)" />
    </>
  ),
  phone: () => (
    <>
      <rect x="180" y="40" width="160" height="340" rx="30" fill={PANEL} stroke={LINE} />
      <rect x="236" y="54" width="48" height="8" rx="4" fill={LINE} />
      <Bar x={200} y={84} w={90} h={12} fill={FG} r={4} />
      <Bar x={200} y={104} w={60} h={8} />
      <rect x="200" y="128" width="120" height="96" rx="14" fill={BRAND} />
      <circle cx="260" cy="176" r="22" fill="rgba(255,255,255,0.25)" />
      {[240, 276].map((y) => (
        <g key={y}>
          <rect x="200" y={y} width="120" height="28" rx="10" fill="rgba(255,255,255,0.05)" />
          <circle cx="216" cy={y + 14} r="7" fill={BRAND2} />
          <Bar x={230} y={y + 10} w={70} h={8} />
        </g>
      ))}
      <rect x="200" y="324" width="120" height="34" rx="17" fill={BRAND} />
      <rect x="64" y="120" width="96" height="64" rx="14" fill={PANEL} stroke={LINE} />
      <Bar x={78} y={136} w={56} h={8} fill={FG} r={3} />
      <Bar x={78} y={152} w={40} h={8} fill={BRAND} r={3} />
      <rect x="362" y="232" width="100" height="70" rx="14" fill={PANEL} stroke={LINE} />
      <path d="M380 282l14-16 12 10 20-22 18 14" fill="none" stroke={BRAND} strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" />
    </>
  ),
  software: () => (
    <>
      <rect x="50" y="56" width="420" height="308" rx="18" fill={PANEL} stroke={LINE} />
      <rect x="50" y="56" width="96" height="308" rx="18" fill="rgba(255,255,255,0.03)" />
      {[92, 120, 148, 176].map((y, i) => <Bar key={y} x={70} y={y} w={56} h={10} fill={i === 0 ? BRAND : SOFT} />)}
      {[0, 1, 2].map((i) => (
        <g key={i}>
          <rect x={166 + i * 98} y="80" width="86" height="62" rx="12" fill="rgba(255,255,255,0.04)" />
          <Bar x={180 + i * 98} y={96} w={40} h={8} />
          <Bar x={180 + i * 98} y={114} w={52} h={14} fill={i === 0 ? BRAND : FG} r={4} />
        </g>
      ))}
      <rect x="166" y="160" width="184" height="120" rx="12" fill="rgba(255,255,255,0.04)" />
      {[40, 70, 52, 90, 64, 100].map((h, i) => <rect key={i} x={184 + i * 26} y={262 - h} width="16" height={h} rx="4" fill={i === 5 ? BRAND : 'rgba(255,255,255,0.12)'} />)}
      <rect x="362" y="160" width="86" height="120" rx="12" fill="rgba(255,255,255,0.04)" />
      <circle cx="405" cy="220" r="30" fill="none" stroke="rgba(255,255,255,0.12)" strokeWidth="12" />
      <path d="M405 190a30 30 0 0 1 28 40" fill="none" stroke={BRAND} strokeWidth="12" />
      {[298, 322].map((y) => <Bar key={y} x={166} y={y} w={282} h={14} fill="rgba(255,255,255,0.04)" r={6} />)}
    </>
  ),
  automation: () => (
    <>
      {[[70, 90], [70, 250], [330, 170]].map(([x, y], i) => (
        <g key={i}>
          <rect x={x} y={y} width="130" height="72" rx="14" fill={PANEL} stroke={i === 2 ? BRAND : LINE} />
          <circle cx={x + 24} cy={y + 36} r="12" fill={i === 2 ? BRAND : 'rgba(255,255,255,0.12)'} />
          <Bar x={x + 46} y={y + 26} w={64} h={8} fill={FG} r={3} />
          <Bar x={x + 46} y={y + 42} w={44} h={8} />
        </g>
      ))}
      <path d="M200 126 C 260 126, 270 206, 330 206" fill="none" stroke={BRAND} strokeWidth="3" strokeDasharray="6 6" />
      <path d="M200 286 C 260 286, 270 206, 330 206" fill="none" stroke={BRAND} strokeWidth="3" strokeDasharray="6 6" />
      <circle cx="265" cy="166" r="16" fill={BG} stroke={BRAND} strokeWidth="2" />
      <path d="M259 166l5 5 9-10" fill="none" stroke={BRAND} strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
      <rect x="350" y="290" width="110" height="44" rx="12" fill="rgba(255,255,255,0.04)" />
      <Bar x={366} y={306} w={60} h={8} />
      <circle cx="440" cy="312" r="8" fill={BRAND2} />
    </>
  ),
  pin: () => (
    <>
      <rect x="60" y="70" width="400" height="280" rx="18" fill={PANEL} stroke={LINE} />
      {[110, 170, 230, 290].map((y) => <path key={y} d={`M60 ${y}h400`} stroke="rgba(255,255,255,0.04)" />)}
      {[140, 220, 300, 380].map((x) => <path key={x} d={`M${x} 70v280`} stroke="rgba(255,255,255,0.04)" />)}
      <path d="M60 250 C 160 200, 240 300, 460 210" fill="none" stroke="rgba(255,255,255,0.1)" strokeWidth="10" />
      <path d="M260 98c-30 0-52 22-52 50 0 38 52 92 52 92s52-54 52-92c0-28-22-50-52-50z" fill={BRAND} />
      <circle cx="260" cy="148" r="18" fill={BG} />
      <rect x="120" y="262" width="280" height="64" rx="14" fill={BG} stroke={LINE} />
      <Bar x={138} y={278} w={130} h={10} fill={FG} r={3} />
      {[0, 1, 2, 3, 4].map((i) => <path key={i} d={`M${140 + i * 16} 304l4 8 8 1-6 5 2 8-8-4-8 4 2-8-6-5 8-1z`} fill={BRAND2} />)}
      <rect x="326" y="282" width="56" height="26" rx="13" fill={BRAND} />
    </>
  ),
  social: () => (
    <>
      <rect x="160" y="40" width="200" height="340" rx="30" fill={PANEL} stroke={LINE} />
      {[0, 1, 2].map((r) => [0, 1, 2].map((c) => (
        <rect key={`${r}${c}`} x={178 + c * 56} y={92 + r * 56} width="50" height="50" rx="8" fill={r === 1 && c === 1 ? BRAND : 'rgba(255,255,255,0.06)'} />
      )))}
      <circle cx="260" cy="64" r="12" fill={BRAND2} />
      <Bar x={190} y={270} w={140} h={10} fill={FG} r={3} />
      <Bar x={190} y={290} w={100} h={8} />
      <rect x="190" y="316" width="140" height="40" rx="20" fill={BRAND} />
      <path d="M86 150c0-12 16-18 22-6 6-12 22-6 22 6 0 14-22 26-22 26s-22-12-22-26z" fill={BRAND} />
      <Bar x={84} y={190} w={48} h={8} fill={FG} r={3} />
      <rect x="380" y="250" width="86" height="50" rx="12" fill={PANEL} stroke={LINE} />
      <Bar x={394} y={266} w={44} h={8} fill={FG} r={3} />
      <Bar x={394} y={280} w={58} h={8} fill={BRAND} r={3} />
    </>
  ),
  ads: () => (
    <>
      <rect x="60" y="70" width="230" height="280" rx="18" fill={PANEL} stroke={LINE} />
      <rect x="78" y="90" width="194" height="120" rx="12" fill={BRAND} />
      <circle cx="175" cy="150" r="30" fill="rgba(255,255,255,0.25)" />
      <Bar x={78} y={228} w={150} h={12} fill={FG} r={4} />
      <Bar x={78} y={250} w={110} h={8} />
      <rect x="78" y="290" width="104" height="36" rx="18" fill={BRAND} />
      <rect x="312" y="110" width="150" height="200" rx="16" fill={PANEL} stroke={LINE} />
      <Bar x={330} y={130} w={70} h={8} />
      <Bar x={330} y={146} w={50} h={16} fill={FG} r={4} />
      <path d="M330 280 L370 250 L400 262 L444 196" fill="none" stroke={BRAND} strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx="444" cy="196" r="7" fill={BRAND} />
      <path d="M330 290h114" stroke="rgba(255,255,255,0.1)" />
    </>
  ),
  brand: () => (
    <>
      <rect x="60" y="60" width="200" height="200" rx="20" fill={PANEL} stroke={LINE} />
      <path d="M160 102 L212 206 L108 206 Z" fill={BRAND} />
      <path d="M160 140 L188 196 L132 196 Z" fill={BG} />
      {[BRAND, BRAND2, FG, 'rgba(255,255,255,0.18)'].map((c, i) => (
        <rect key={i} x={290 + (i % 2) * 90} y={60 + Math.floor(i / 2) * 90} width="80" height="80" rx="16" fill={c} />
      ))}
      <rect x="60" y="284" width="400" height="76" rx="18" fill={PANEL} stroke={LINE} />
      <text x="84" y="336" fontFamily="'Instrument Serif', Georgia, serif" fontStyle="italic" fontSize="40" fill={BRAND}>Aa</text>
      <Bar x={150} y={312} w={160} h={10} fill={FG} r={3} />
      <Bar x={150} y={332} w={110} h={8} />
      <rect x="360" y="306" width="78" height="32" rx="16" fill="none" stroke={BRAND} />
    </>
  ),
  video: () => (
    <>
      <rect x="60" y="56" width="400" height="226" rx="18" fill={PANEL} stroke={LINE} />
      <rect x="60" y="56" width="400" height="226" rx="18" fill="url(#video-glow)" opacity="0.6" />
      <circle cx="260" cy="169" r="40" fill={BRAND} />
      <path d="M248 147v44l36-22z" fill={BG} />
      <rect x="60" y="300" width="400" height="64" rx="16" fill={PANEL} stroke={LINE} />
      {[0, 1, 2, 3, 4].map((i) => <rect key={i} x={76 + i * 74} y="316" width="66" height="32" rx="6" fill={i === 2 ? 'rgba(255,106,0,0.45)' : 'rgba(255,255,255,0.06)'} />)}
      <path d="M262 300v64" stroke={BRAND} strokeWidth="3" />
      <circle cx="262" cy="300" r="6" fill={BRAND} />
    </>
  ),
  care: () => (
    <>
      <rect x="60" y="80" width="300" height="240" rx="18" fill={PANEL} stroke={LINE} />
      <rect x="60" y="80" width="300" height="34" rx="18" fill="rgba(255,255,255,0.03)" />
      {[78, 94, 110].map((x) => <circle key={x} cx={x} cy="97" r="4.5" fill={LINE} />)}
      <Bar x={84} y={140} w={160} h={12} fill={FG} r={4} />
      <Bar x={84} y={162} w={120} h={8} />
      {[0, 1, 2].map((i) => (
        <g key={i}>
          <rect x="84" y={190 + i * 38} width="252" height="28" rx="8" fill="rgba(255,255,255,0.04)" />
          <circle cx="100" cy={204 + i * 38} r="6" fill="#3ccf7a" />
          <Bar x={114} y={200 + i * 38} w={110} h={8} />
        </g>
      ))}
      <path d="M396 120l64 24v54c0 44-30 76-64 92-34-16-64-48-64-92v-54z" fill={BRAND} />
      <path d="M372 196l18 18 34-38" fill="none" stroke={BG} strokeWidth="9" strokeLinecap="round" strokeLinejoin="round" />
    </>
  ),
};

export default function ServiceArt({ art }: { art: ArtKey }) {
  return (
    <Frame id={art} label={LABEL[art]}>
      {ARTS[art]()}
    </Frame>
  );
}
