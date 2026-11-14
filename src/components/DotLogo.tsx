import { useEffect, useRef } from 'react';
import logoUrl from '../logo-mark.png';

/*
  Dotted 3D version of the Azumco logo, rendered on a 2D canvas (no 3D library needed).
  - Points are sampled from the logo image: orange pixels → orange dots, dark cube → grey dots.
  - Each point gets depth so the shape reads as 3D when it rotates.
  - Dots assemble from a sphere on load, sway slowly, tilt toward the mouse and scatter near the cursor.
  To use a different model (e.g. a brain), replace `samplePoints` with points from a .glb/.obj file.
*/

type P = { x: number; y: number; z: number; sx: number; sy: number; sz: number; orange: boolean; ox: number; oy: number; vx: number; vy: number };

async function samplePoints(maxPoints = 6000): Promise<P[]> {
  const img = new Image();
  img.src = logoUrl;
  await img.decode();

  const W = 180;
  const H = Math.round((img.height / img.width) * W);
  const c = document.createElement('canvas');
  c.width = W;
  c.height = H;
  const ctx = c.getContext('2d', { willReadFrequently: true })!;
  ctx.drawImage(img, 0, 0, W, H);
  const data = ctx.getImageData(0, 0, W, H).data;

  const found: { x: number; y: number; orange: boolean }[] = [];
  for (let py = 0; py < H; py++) {
    for (let px = 0; px < W; px++) {
      const i = (py * W + px) * 4;
      const r = data[i], g = data[i + 1], b = data[i + 2], a = data[i + 3];
      if (a < 160) continue;
      const max = Math.max(r, g, b), min = Math.min(r, g, b);
      const sat = max === 0 ? 0 : (max - min) / max;
      const isOrange = r > 170 && g > 70 && g < 180 && b < 90;
      const isGrey = sat < 0.2;
      if (!isOrange && !isGrey) continue; // skips the red speckle texture
      found.push({ x: px, y: py, orange: isOrange });
    }
  }

  const keep = Math.min(1, maxPoints / found.length);
  const scale = 2 / Math.max(W, H);
  const pts: P[] = [];
  for (const f of found) {
    if (Math.random() > keep) continue;
    const x = (f.x - W / 2) * scale + (Math.random() - 0.5) * scale;
    const y = (f.y - H / 2) * scale + (Math.random() - 0.5) * scale;
    const z = (Math.random() - 0.5) * (f.orange ? 0.22 : 0.34);
    // start position on a sphere for the assemble animation
    const u = Math.random() * Math.PI * 2;
    const v = Math.acos(2 * Math.random() - 1);
    const R = 1.6;
    pts.push({
      x, y, z,
      sx: R * Math.sin(v) * Math.cos(u),
      sy: R * Math.sin(v) * Math.sin(u),
      sz: R * Math.cos(v),
      orange: f.orange,
      ox: 0, oy: 0, vx: 0, vy: 0,
    });
  }
  return pts;
}

export default function DotLogo({ className = '' }: { className?: string }) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const wrap = wrapRef.current;
    const canvas = canvasRef.current;
    if (!wrap || !canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    let pts: P[] = [];
    let width = 0, height = 0, raf = 0, start = 0;
    let visible = true;
    let cancelled = false;
    const mouse = { x: 0, y: 0, nx: 0, ny: 0, tx: 0, ty: 0, inside: false };

    const setSize = () => {
      const r = wrap.getBoundingClientRect();
      width = r.width;
      height = r.height;
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = width * dpr;
      canvas.height = height * dpr;
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };

    const ease = (t: number) => 1 - Math.pow(1 - t, 4);

    const render = (time: number) => {
      if (!start) start = time;
      const t = time - start;
      const k = reduced ? 1 : ease(Math.min(1, t / 2200));

      // smooth mouse tilt
      mouse.nx += (mouse.tx - mouse.nx) * 0.05;
      mouse.ny += (mouse.ty - mouse.ny) * 0.05;
      const ry = (reduced ? -0.35 : Math.sin(t * 0.00035) * 0.55) + mouse.nx * 0.5 + (1 - k) * 2.5;
      const rx = mouse.ny * 0.3 + 0.08;
      const cy = Math.cos(ry), sy = Math.sin(ry), cx = Math.cos(rx), sx = Math.sin(rx);

      const scale = Math.min(width, height) * 0.42;
      const ccx = width / 2, ccy = height / 2;
      const cam = 3;

      ctx.clearRect(0, 0, width, height);
      for (const p of pts) {
        // interpolate from sphere → logo
        let x = p.sx + (p.x - p.sx) * k;
        let y = p.sy + (p.y - p.sy) * k;
        let z = p.sz + (p.z - p.sz) * k;
        // gentle breathing
        if (!reduced) z += Math.sin(t * 0.0012 + p.x * 4 + p.y * 3) * 0.015;

        // rotate Y then X
        const x1 = x * cy - z * sy;
        const z1 = x * sy + z * cy;
        const y1 = y * cx - z1 * sx;
        const z2 = y * sx + z1 * cx;

        const f = cam / (cam + z2);
        let px = ccx + x1 * scale * f;
        let py = ccy + y1 * scale * f;

        // scatter near cursor (spring back)
        if (!reduced && mouse.inside) {
          const dx = px + p.ox - mouse.x;
          const dy = py + p.oy - mouse.y;
          const d2 = dx * dx + dy * dy;
          const R = 70;
          if (d2 < R * R) {
            const d = Math.sqrt(d2) || 1;
            const force = (1 - d / R) * 2.4;
            p.vx += (dx / d) * force;
            p.vy += (dy / d) * force;
          }
        }
        p.vx += -p.ox * 0.06;
        p.vy += -p.oy * 0.06;
        p.vx *= 0.82;
        p.vy *= 0.82;
        p.ox += p.vx;
        p.oy += p.vy;
        px += p.ox;
        py += p.oy;

        const depth = Math.max(0, Math.min(1, (1.2 - z2) / 2)); // nearer = brighter
        const size = (p.orange ? 1.7 : 1.5) * f;
        ctx.globalAlpha = (0.25 + depth * 0.75) * (0.4 + 0.6 * k);
        ctx.fillStyle = p.orange ? '#ff6a00' : '#9a968f';
        ctx.fillRect(px - size / 2, py - size / 2, size, size);
      }
      ctx.globalAlpha = 1;

      if (!reduced && visible && !cancelled) raf = requestAnimationFrame(render);
    };

    const onMove = (e: MouseEvent) => {
      const r = canvas.getBoundingClientRect();
      mouse.x = e.clientX - r.left;
      mouse.y = e.clientY - r.top;
      mouse.inside = mouse.x > -50 && mouse.y > -50 && mouse.x < width + 50 && mouse.y < height + 50;
      mouse.tx = Math.max(-1, Math.min(1, (e.clientX / window.innerWidth) * 2 - 1));
      mouse.ty = Math.max(-1, Math.min(1, (e.clientY / window.innerHeight) * 2 - 1));
    };
    const onResize = () => {
      setSize();
      if (reduced) render(performance.now());
    };

    setSize();
    const io = new IntersectionObserver(([entry]) => {
      const was = visible;
      visible = entry.isIntersecting;
      if (visible && !was && !reduced && pts.length) raf = requestAnimationFrame(render);
      if (!visible) cancelAnimationFrame(raf);
    });

    samplePoints().then((p) => {
      if (cancelled) return;
      pts = p;
      io.observe(wrap);
      raf = requestAnimationFrame(render);
    });

    window.addEventListener('resize', onResize);
    window.addEventListener('mousemove', onMove);
    return () => {
      cancelled = true;
      cancelAnimationFrame(raf);
      io.disconnect();
      window.removeEventListener('resize', onResize);
      window.removeEventListener('mousemove', onMove);
    };
  }, []);

  return (
    <div ref={wrapRef} className={`relative ${className}`} aria-hidden="true">
      <canvas ref={canvasRef} className="block" />
    </div>
  );
}
