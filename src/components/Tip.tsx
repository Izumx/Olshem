'use client';

import { useState, type CSSProperties, type ReactNode } from 'react';

/** Cursor-following tooltip for a chart mark. */
export function Tip({ text, children, className, style }: { text: string; children?: ReactNode; className?: string; style?: CSSProperties }) {
  const [pos, setPos] = useState<{ x: number; y: number } | null>(null);
  return (
    <span
      className={className}
      style={style}
      title={undefined}
      onMouseMove={(e) => setPos({ x: e.clientX, y: e.clientY })}
      onMouseLeave={() => setPos(null)}
    >
      {children}
      {pos && (
        <span className="tip" style={{ left: Math.min(pos.x + 14, window.innerWidth - 296), top: pos.y + 16 }}>
          {text}
        </span>
      )}
    </span>
  );
}
