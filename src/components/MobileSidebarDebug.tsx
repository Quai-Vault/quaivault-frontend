import { useEffect, useState } from 'react';

interface Props {
  sidebarCollapsed: boolean;
}

/**
 * Temporary diagnostic overlay. Displays live sidebar state + the actual
 * computed geometry of the <aside> element. Remove after the mobile-sidebar
 * issue is resolved.
 */
export function MobileSidebarDebug({ sidebarCollapsed }: Props) {
  const [info, setInfo] = useState<string>('measuring…');
  const [hidden, setHidden] = useState(false);

  useEffect(() => {
    const tick = () => {
      const asides = Array.from(document.querySelectorAll('aside'));
      const lines = asides.map((a, i) => {
        const r = a.getBoundingClientRect();
        const s = getComputedStyle(a);
        const cls = a.className.slice(0, 60);
        return [
          `aside[${i}]: ${cls}`,
          `  rect: x=${Math.round(r.left)} y=${Math.round(r.top)} w=${Math.round(r.width)} h=${Math.round(r.height)}`,
          `  display=${s.display} vis=${s.visibility} opacity=${s.opacity}`,
          `  z=${s.zIndex} pos=${s.position}`,
          `  transform=${s.transform}`,
        ].join('\n');
      });
      const vp = `viewport: w=${window.innerWidth} h=${window.innerHeight} vh=${window.visualViewport?.height ?? '?'} dpr=${window.devicePixelRatio}`;
      const lock = `body.overflow=${document.body.style.overflow || '(empty)'}`;
      const state = `sidebarCollapsed=${sidebarCollapsed}`;
      setInfo([state, vp, lock, '', ...lines].join('\n'));
    };
    tick();
    const interval = setInterval(tick, 500);
    return () => clearInterval(interval);
  }, [sidebarCollapsed]);

  if (hidden) {
    return (
      <button
        onClick={() => setHidden(false)}
        style={{
          position: 'fixed',
          bottom: 4,
          right: 4,
          zIndex: 2147483647,
          background: 'rgba(0,200,0,0.8)',
          color: 'white',
          padding: '4px 8px',
          fontSize: 10,
          fontFamily: 'monospace',
          border: '1px solid #fff',
          borderRadius: 4,
        }}
      >
        debug
      </button>
    );
  }

  return (
    <div
      style={{
        position: 'fixed',
        bottom: 4,
        left: 4,
        right: 4,
        zIndex: 2147483647,
        background: 'rgba(0,0,0,0.85)',
        color: '#0f0',
        padding: 8,
        fontSize: 10,
        lineHeight: 1.3,
        fontFamily: 'monospace',
        whiteSpace: 'pre-wrap',
        maxHeight: '50vh',
        overflow: 'auto',
        border: '2px solid #0f0',
        borderRadius: 4,
      }}
    >
      <button
        onClick={() => setHidden(true)}
        style={{
          float: 'right',
          background: '#333',
          color: 'white',
          border: '1px solid #666',
          padding: '2px 6px',
          fontSize: 10,
          fontFamily: 'monospace',
        }}
      >
        hide
      </button>
      {info}
    </div>
  );
}
