import { MeshGradient } from '@paper-design/shaders-react';
import { motion } from 'framer-motion';
import { useState, useEffect, useRef } from 'react';

const COLORS = [
  '#93C5FD', // blue-300
  '#3B82F6', // blue-500
  '#1D4ED8', // blue-700
  '#1E3A5F', // brand navy
  '#0F172A', // slate-950
];

export function MeshGradientCharacter() {
  const containerRef = useRef<HTMLDivElement>(null);
  const [eyeOffset, setEyeOffset] = useState({ x: 0, y: 0 });

  useEffect(() => {
    function handleMouseMove(e: MouseEvent) {
      const el = containerRef.current?.querySelector('svg');
      if (!el) return;
      const rect = el.getBoundingClientRect();
      const cx = rect.left + rect.width / 2;
      const cy = rect.top + rect.height / 2;
      const MAX = 8;
      setEyeOffset({
        x: Math.max(-MAX, Math.min(MAX, (e.clientX - cx) * 0.08)),
        y: Math.max(-MAX, Math.min(MAX, (e.clientY - cy) * 0.08)),
      });
    }
    window.addEventListener('mousemove', handleMouseMove);
    return () => window.removeEventListener('mousemove', handleMouseMove);
  }, []);

  const eyeProps = (baseCx: number) => ({
    rx: 20 as number,
    fill: 'currentColor',
    animate: {
      cx: baseCx + eyeOffset.x,
      cy: 120 + eyeOffset.y,
      ry: [30, 30, 30, 3, 30] as number[],
    },
    transition: {
      ry: {
        duration: 3,
        repeat: Infinity,
        ease: 'easeInOut' as const,
        times: [0, 0.88, 0.92, 0.95, 1],
      },
      cx: { type: 'spring' as const, stiffness: 150, damping: 15 },
      cy: { type: 'spring' as const, stiffness: 150, damping: 15 },
    },
  });

  return (
    <motion.div
      ref={containerRef}
      className="relative mx-auto w-40"
      animate={{ y: [0, -8, 0], scaleY: [1, 1.06, 1] }}
      transition={{ duration: 2.8, repeat: Infinity, ease: 'easeInOut' }}
      style={{ transformOrigin: 'top center' }}
    >
      <svg
        xmlns="http://www.w3.org/2000/svg"
        viewBox="0 0 231 289"
        className="w-full h-auto text-white"
      >
        <defs>
          <clipPath id="shapeClip">
            <path d="M230.809 115.385V249.411C230.809 269.923 214.985 287.282 194.495 288.411C184.544 288.949 175.364 285.718 168.26 280C159.746 273.154 147.769 273.461 139.178 280.23C132.638 285.384 124.381 288.462 115.379 288.462C106.377 288.462 98.1451 285.384 91.6055 280.23C82.912 273.385 70.9353 273.385 62.2415 280.23C55.7532 285.334 47.598 288.411 38.7246 288.462C17.4132 288.615 0 270.667 0 249.359V115.385C0 51.6667 51.6756 0 115.404 0C179.134 0 230.809 51.6667 230.809 115.385Z" />
          </clipPath>
        </defs>

        <foreignObject width="231" height="289" clipPath="url(#shapeClip)">
          <div className="w-full h-full">
            <MeshGradient colors={COLORS} className="w-full h-full" speed={0.8} />
          </div>
        </foreignObject>

        <motion.ellipse {...eyeProps(80)} />
        <motion.ellipse {...eyeProps(150)} />
      </svg>
    </motion.div>
  );
}
