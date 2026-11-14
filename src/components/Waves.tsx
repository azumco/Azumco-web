import { useEffect, useRef } from 'react';
import { Noise } from '../lib/noise';

/*
  Wavy-lines canvas, ported from the a-waves custom element.
  - Perlin noise drives a slow organic flow.
  - The cursor pushes lines with spring physics.
  - Lines are faint; an orange glow follows the cursor.
  Pauses when off-screen and renders one static frame for reduced motion.
*/

type Point = {
  x: number;
  y: number;
  wx: number;
  wy: number;
  cx: number;
  cy: number;
  cvx: number;
  cvy: number;
};

export default function Waves({ className = '' }: { className?: string }) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const wrap = wrapRef.current;
    const canvas = canvasRef.current;
    if (!wrap || !canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const noise = new Noise(Math.random());
    const mouse = { x: -10, y: 0, lx: 0, ly: 0, sx: 0, sy: 0, v: 0, vs: 0, a: 0, set: false };
    let lines: Point[][] = [];
    let width = 0;
    let height = 0;
    let raf = 0;
    let visible = true;

    const styles = getComputedStyle(document.documentElement);
    const brand = styles.getPropertyValue('--brand').trim() || '#ff6a00';

    const setSize = () => {
      const rect = wrap.getBoundingClientRect();
      width = rect.width;
      height = rect.height;
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = width * dpr;
      canvas.height = height * dpr;
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };

    const setLines = () => {
      lines = [];
      const xGap = width < 640 ? 14 : 12;
      const yGap = 32;
      const oWidth = width + 200;
      const oHeight = height + 30;
      const totalLines = Math.ceil(oWidth / xGap);
      const totalPoints = Math.ceil(oHeight / yGap);
      const xStart = (width - xGap * totalLines) / 2;
      const yStart = (height - yGap * totalPoints) / 2;
      for (let i = 0; i <= totalLines; i++) {
        const pts: Point[] = [];
        for (let j = 0; j <= totalPoints; j++) {
          pts.push({ x: xStart + xGap * i, y: yStart + yGap * j, wx: 0, wy: 0, cx: 0, cy: 0, cvx: 0, cvy: 0 });
        }
        lines.push(pts);
      }
    };

    const movePoints = (time: number) => {
      for (const pts of lines) {
        for (const p of pts) {
          const move = noise.perlin2((p.x + time * 0.0125) * 0.002, (p.y + time * 0.005) * 0.0015) * 12;
          p.wx = Math.cos(move) * 32;
          p.wy = Math.sin(move) * 16;

          const dx = p.x - mouse.sx;
          const dy = p.y - mouse.sy;
          const d = Math.hypot(dx, dy);
          const l = Math.max(175, mouse.vs);
          if (d < l) {
            const s = 1 - d / l;
            const f = Math.cos(d * 0.001) * s;
            p.cvx += Math.cos(mouse.a) * f * l * mouse.vs * 0.00065;
            p.cvy += Math.sin(mouse.a) * f * l * mouse.vs * 0.00065;
          }
          p.cvx += -p.cx * 0.005;
          p.cvy += -p.cy * 0.005;
          p.cvx *= 0.925;
          p.cvy *= 0.925;
          p.cx = Math.min(100, Math.max(-100, p.cx + p.cvx * 2));
          p.cy = Math.min(100, Math.max(-100, p.cy + p.cvy * 2));
        }
      }
    };

    const tracePath = () => {
      ctx.beginPath();
      for (const pts of lines) {
        const last = pts.length - 1;
        ctx.moveTo(pts[0].x + pts[0].wx, pts[0].y + pts[0].wy);
        for (let j = 0; j <= last; j++) {
          const p = pts[j];
          const withCursor = j !== last;
          ctx.lineTo(p.x + p.wx + (withCursor ? p.cx : 0), p.y + p.wy + (withCursor ? p.cy : 0));
        }
      }
    };

    const draw = () => {
      ctx.clearRect(0, 0, width, height);
      tracePath();
      ctx.lineWidth = 1;
      ctx.strokeStyle = 'rgba(255,255,255,0.075)';
      ctx.stroke();

      if (mouse.set) {
        const g = ctx.createRadialGradient(mouse.sx, mouse.sy, 0, mouse.sx, mouse.sy, 280);
        g.addColorStop(0, brand);
        g.addColorStop(1, 'rgba(255,106,0,0)');
        ctx.globalAlpha = 0.85;
        ctx.strokeStyle = g;
        ctx.stroke();
        ctx.globalAlpha = 1;
      }
    };

    const tick = (time: number) => {
      mouse.sx += (mouse.x - mouse.sx) * 0.1;
      mouse.sy += (mouse.y - mouse.sy) * 0.1;
      const dx = mouse.x - mouse.lx;
      const dy = mouse.y - mouse.ly;
      const d = Math.hypot(dx, dy);
      mouse.v = d;
      mouse.vs = Math.min(100, mouse.vs + (d - mouse.vs) * 0.1);
      mouse.lx = mouse.x;
      mouse.ly = mouse.y;
      mouse.a = Math.atan2(dy, dx);

      movePoints(time);
      draw();
      if (visible) raf = requestAnimationFrame(tick);
    };

    const updateMouse = (clientX: number, clientY: number) => {
      const rect = canvas.getBoundingClientRect();
      mouse.x = clientX - rect.left;
      mouse.y = clientY - rect.top;
      if (!mouse.set) {
        mouse.sx = mouse.lx = mouse.x;
        mouse.sy = mouse.ly = mouse.y;
        mouse.set = true;
      }
    };
    const onMouseMove = (e: MouseEvent) => updateMouse(e.clientX, e.clientY);
    const onTouchMove = (e: TouchEvent) => {
      const t = e.touches[0];
      if (t) updateMouse(t.clientX, t.clientY);
    };
    const onResize = () => {
      setSize();
      setLines();
      if (reduced) {
        movePoints(0);
        draw();
      }
    };

    setSize();
    setLines();

    if (reduced) {
      movePoints(0);
      draw();
      window.addEventListener('resize', onResize);
      return () => window.removeEventListener('resize', onResize);
    }

    const io = new IntersectionObserver(([entry]) => {
      const wasVisible = visible;
      visible = entry.isIntersecting;
      if (visible && !wasVisible) raf = requestAnimationFrame(tick);
      if (!visible) cancelAnimationFrame(raf);
    });
    io.observe(wrap);

    window.addEventListener('resize', onResize);
    window.addEventListener('mousemove', onMouseMove);
    wrap.addEventListener('touchmove', onTouchMove, { passive: true });
    raf = requestAnimationFrame(tick);

    return () => {
      cancelAnimationFrame(raf);
      io.disconnect();
      window.removeEventListener('resize', onResize);
      window.removeEventListener('mousemove', onMouseMove);
      wrap.removeEventListener('touchmove', onTouchMove);
    };
  }, []);

  return (
    <div ref={wrapRef} className={`absolute inset-0 overflow-hidden ${className}`} aria-hidden="true">
      <canvas ref={canvasRef} className="block" />
    </div>
  );
}
