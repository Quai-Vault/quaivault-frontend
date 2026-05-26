import { useEffect, useState } from 'react';

interface Props {
  sidebarCollapsed: boolean;
}

/**
 * Temporary diagnostic overlay. Pinned just below the navbar (top:60px) so
 * the wallet's bottom chrome doesn't occlude it. Tap to copy text to clipboard.
 * Remove after the mobile-sidebar issue is resolved.
 */
export function MobileSidebarDebug({ sidebarCollapsed }: Props) {
  const [info, setInfo] = useState<string>('measuring…');
  const [hidden, setHidden] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    const tick = () => {
      try {
        const asides = Array.from(document.querySelectorAll('aside'));
        const asideLines: string[] = [];
        asides.forEach((a, i) => {
          const r = a.getBoundingClientRect();
          const s = getComputedStyle(a);
          asideLines.push(
            `[${i}] cls=${a.className.slice(0, 40)}`,
            `    box: x=${Math.round(r.left)} y=${Math.round(r.top)} w=${Math.round(r.width)} h=${Math.round(r.height)}`,
            `    css: disp=${s.display} vis=${s.visibility} op=${s.opacity} z=${s.zIndex} pos=${s.position}`,
            `    tf=${s.transform}`,
          );
        });
        const noAsides = asides.length === 0 ? '!! NO <aside> ELEMENTS IN DOM !!' : `${asides.length} aside(s) in DOM`;
        const vp = `vp: ${window.innerWidth}x${window.innerHeight} dvh=${window.visualViewport?.height ?? '?'} dpr=${window.devicePixelRatio}`;
        const lock = `body.overflow=${document.body.style.overflow || '(empty)'}`;
        const state = `state: sidebarCollapsed=${sidebarCollapsed}`;
        setInfo([state, noAsides, vp, lock, '---', ...asideLines].join('\n'));
      } catch (e) {
        setInfo(`ERROR in tick: ${e instanceof Error ? e.message : String(e)}`);
      }
    };
    tick();
    const interval = setInterval(tick, 500);
    return () => clearInterval(interval);
  }, [sidebarCollapsed]);

  const onCopy = async () => {
    try {
      await navigator.clipboard.writeText(info);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // ignore
    }
  };

  if (hidden) {
    return (
      <button
        onClick={() => setHidden(false)}
        style={{
          position: 'fixed',
          top: 60,
          right: 4,
          zIndex: 2147483647,
          background: 'rgba(0,200,0,0.9)',
          color: 'black',
          padding: '4px 8px',
          fontSize: 11,
          fontFamily: 'monospace',
          border: '1px solid #fff',
          borderRadius: 4,
        }}
      >
        debug
      </button>
    );
  }

  const noAsides = info.includes('NO <aside>');

  return (
    <div
      style={{
        position: 'fixed',
        top: 60,
        left: 4,
        right: 4,
        zIndex: 2147483647,
        background: noAsides ? 'rgba(255,0,0,0.95)' : 'rgba(0,0,0,0.92)',
        color: noAsides ? '#fff' : '#0f0',
        padding: 8,
        fontSize: 10,
        lineHeight: 1.4,
        fontFamily: 'monospace',
        whiteSpace: 'pre-wrap',
        wordBreak: 'break-all',
        border: '2px solid #0f0',
        borderRadius: 4,
        boxShadow: '0 4px 12px rgba(0,0,0,0.8)',
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6, gap: 8 }}>
        <button
          onClick={onCopy}
          style={{
            background: '#0a0',
            color: 'white',
            border: '1px solid #fff',
            padding: '4px 10px',
            fontSize: 11,
            fontFamily: 'monospace',
            borderRadius: 4,
            fontWeight: 'bold',
          }}
        >
          {copied ? '✓ copied' : 'tap to copy'}
        </button>
        <button
          onClick={() => setHidden(true)}
          style={{
            background: '#666',
            color: 'white',
            border: '1px solid #fff',
            padding: '4px 10px',
            fontSize: 11,
            fontFamily: 'monospace',
            borderRadius: 4,
          }}
        >
          hide
        </button>
      </div>
      <div>{info}</div>
    </div>
  );
}
