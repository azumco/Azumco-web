import { useEffect, useState } from 'react';
import { motion, useMotionValue, useSpring } from 'motion/react';

/*
  Custom dot cursor (mouse/trackpad only — touch devices keep native behaviour).
  - Default: small orange dot.
  - Over links/buttons: grows into a soft ring.
  - Over any element with data-cursor="Label": becomes a large orange circle with that label.
*/
type Mode = 'default' | 'hover' | 'label' | 'text';

export default function Cursor() {
  const [enabled, setEnabled] = useState(false);
  const [mode, setMode] = useState<Mode>('default');
  const [label, setLabel] = useState('');
  const [visible, setVisible] = useState(false);
  const [down, setDown] = useState(false);

  const x = useMotionValue(-100);
  const y = useMotionValue(-100);
  const sx = useSpring(x, { stiffness: 900, damping: 50, mass: 0.4 });
  const sy = useSpring(y, { stiffness: 900, damping: 50, mass: 0.4 });

  useEffect(() => {
    const mq = window.matchMedia('(pointer: fine)');
    const update = () => setEnabled(mq.matches);
    update();
    mq.addEventListener('change', update);
    return () => mq.removeEventListener('change', update);
  }, []);

  useEffect(() => {
    if (!enabled) return;
    document.documentElement.classList.add('custom-cursor');

    const onMove = (e: MouseEvent) => {
      x.set(e.clientX);
      y.set(e.clientY);
      setVisible(true);
    };
    const onOver = (e: MouseEvent) => {
      const t = e.target as HTMLElement | null;
      if (!t?.closest) return;
      const labelled = t.closest<HTMLElement>('[data-cursor]');
      if (labelled) {
        setLabel(labelled.dataset.cursor || '');
        setMode('label');
      } else if (t.closest('input, textarea, select')) {
        setMode('text');
      } else if (t.closest('a, button, [role="button"], label')) {
        setMode('hover');
      } else {
        setMode('default');
      }
    };
    const onLeave = () => setVisible(false);
    const onDown = () => setDown(true);
    const onUp = () => setDown(false);

    window.addEventListener('mousemove', onMove);
    document.addEventListener('mouseover', onOver);
    document.documentElement.addEventListener('mouseleave', onLeave);
    window.addEventListener('mousedown', onDown);
    window.addEventListener('mouseup', onUp);
    return () => {
      document.documentElement.classList.remove('custom-cursor');
      window.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseover', onOver);
      document.documentElement.removeEventListener('mouseleave', onLeave);
      window.removeEventListener('mousedown', onDown);
      window.removeEventListener('mouseup', onUp);
    };
  }, [enabled, x, y]);

  if (!enabled) return null;

  const size = mode === 'label' ? 88 : mode === 'hover' ? 44 : mode === 'text' ? 4 : 10;
  const isRing = mode === 'hover';

  return (
    <motion.div
      aria-hidden="true"
      className="pointer-events-none fixed left-0 top-0 z-[100] flex items-center justify-center rounded-full text-sm font-medium text-white"
      style={{ x: sx, y: sy, translateX: '-50%', translateY: '-50%' }}
      animate={{
        width: size,
        height: size,
        opacity: visible ? 1 : 0,
        scale: down ? 0.85 : 1,
        backgroundColor: isRing ? 'rgba(255,106,0,0.12)' : 'rgba(255,106,0,1)',
        borderColor: isRing ? 'rgba(255,106,0,0.9)' : 'rgba(255,106,0,0)',
      }}
      transition={{ type: 'spring', stiffness: 400, damping: 30 }}
    >
      <span className="absolute inset-0 rounded-full border" style={{ borderColor: 'inherit' }} />
      {mode === 'label' && (
        <motion.span initial={{ opacity: 0, scale: 0.6 }} animate={{ opacity: 1, scale: 1 }} className="relative">
          {label}
        </motion.span>
      )}
    </motion.div>
  );
}
