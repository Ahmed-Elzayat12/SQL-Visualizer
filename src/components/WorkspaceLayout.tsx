import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { PanelLeftClose, PanelLeftOpen, PanelRightClose, PanelRightOpen, Maximize2, RotateCcw } from 'lucide-react';

interface WorkspaceLayoutProps {
  editor: ReactNode;
  graph: ReactNode;
  inspector: ReactNode;
}

export function WorkspaceLayout({ editor, graph, inspector }: WorkspaceLayoutProps) {
  const [showEditor, setShowEditor] = useState(true);
  const [showInspector, setShowInspector] = useState(true);
  const [widths, setWidths] = useState({ left: 300, right: 340 });
  const [dragging, setDragging] = useState(false);
  const container = useRef<HTMLDivElement>(null);
  const drag = useRef<{ side: 'left' | 'right'; x: number; width: number } | null>(null);

  useEffect(() => {
    if (!container.current) return;
    const observer = new ResizeObserver(([entry]) => {
      if (!window.matchMedia('(min-width: 1200px)').matches) return;
      const budget = entry.contentRect.width - 360 - (showEditor ? 8 : 0) - (showInspector ? 8 : 0);
      setWidths(previous => {
        const total = (showEditor ? previous.left : 0) + (showInspector ? previous.right : 0);
        if (total <= budget) return previous;
        if (!showEditor) return { ...previous, right: Math.max(260, budget) };
        if (!showInspector) return { ...previous, left: Math.max(260, budget) };
        const left = Math.max(260, Math.min(Math.floor(previous.left * budget / total), budget - 260));
        return { left, right: budget - left };
      });
    });
    observer.observe(container.current);
    return () => observer.disconnect();
  }, [showEditor, showInspector]);

  function resize(side: 'left' | 'right', requested: number) {
    const otherWidth = side === 'left' ? (showInspector ? widths.right + 8 : 0) : (showEditor ? widths.left + 8 : 0);
    const maximum = Math.max(260, (container.current?.clientWidth ?? 1200) - otherWidth - 368);
    setWidths(previous => ({ ...previous, [side]: Math.round(Math.max(260, Math.min(requested, maximum))) }));
  }

  function separator(side: 'left' | 'right', visible: boolean) {
    return <div
      hidden={!visible}
      className={`workspace-resizer workspace-resizer-${side}`}
      role="separator"
      aria-label={`Resize ${side === 'left' ? 'editor' : 'details'} panel`}
      aria-orientation="vertical"
      aria-controls={side === 'left' ? 'workspace-editor' : 'workspace-inspector'}
      aria-valuemin={260}
      aria-valuenow={widths[side]}
      tabIndex={0}
      onDoubleClick={() => setWidths(previous => ({ ...previous, [side]: side === 'left' ? 300 : 340 }))}
      onPointerDown={event => {
        if (event.button !== 0) return;
        event.preventDefault();
        drag.current = { side, x: event.clientX, width: widths[side] };
        event.currentTarget.setPointerCapture(event.pointerId);
        setDragging(true);
      }}
      onPointerMove={event => {
        if (drag.current?.side !== side) return;
        const delta = (event.clientX - drag.current.x) * (side === 'left' ? 1 : -1);
        resize(side, drag.current.width + delta);
      }}
      onPointerUp={event => {
        drag.current = null;
        setDragging(false);
        if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
      }}
      onLostPointerCapture={() => { drag.current = null; setDragging(false); }}
      onPointerCancel={() => { drag.current = null; setDragging(false); }}
      onKeyDown={event => {
        if (!['ArrowLeft', 'ArrowRight', 'Home'].includes(event.key)) return;
        event.preventDefault();
        const delta = (event.key === 'ArrowRight' ? 20 : -20) * (side === 'left' ? 1 : -1);
        resize(side, event.key === 'Home' ? 260 : widths[side] + delta);
      }}
      title="Drag to resize · Arrow keys to adjust · Double-click to reset"
    ><span /></div>;
  }

  const style = {
    '--editor-width': showEditor ? `${widths.left}px` : '0px',
    '--inspector-width': showInspector ? `${widths.right}px` : '0px',
    '--left-handle': showEditor ? '8px' : '0px',
    '--right-handle': showInspector ? '8px' : '0px',
  } as CSSProperties;

  return <>
    <div className="workspace-toolbar flex shrink-0 flex-wrap items-center gap-2 border-b border-slate-800 bg-slate-900 px-3 py-2 text-xs">
      <button aria-expanded={showEditor} aria-controls="workspace-editor" onClick={() => setShowEditor(value => !value)}>
        {showEditor ? <PanelLeftClose size={15} /> : <PanelLeftOpen size={15} />}
        {showEditor ? 'Hide editor' : 'Show editor'}
      </button>
      <button aria-expanded={showInspector} aria-controls="workspace-inspector" onClick={() => setShowInspector(value => !value)}>
        {showInspector ? <PanelRightClose size={15} /> : <PanelRightOpen size={15} />}
        {showInspector ? 'Hide details' : 'Show details'}
      </button>
      <button onClick={() => {
        const show = !showEditor && !showInspector;
        setShowEditor(show); setShowInspector(show);
      }}><Maximize2 size={15} />{!showEditor && !showInspector ? 'Restore panels' : 'Focus graph'}</button>
      <button onClick={() => { setWidths({ left: 300, right: 340 }); setShowEditor(true); setShowInspector(true); }}>
        <RotateCcw size={14} />Reset layout
      </button>
      <span className="workspace-resize-hint ml-auto text-slate-500">Drag panel borders to resize</span>
    </div>
    <div ref={container} style={style} className={`workspace-panels${dragging ? ' is-resizing' : ''}${showEditor ? '' : ' editor-hidden'}${showInspector ? '' : ' inspector-hidden'}`}>
      <div id="workspace-editor" hidden={!showEditor} className="workspace-editor min-w-0 min-h-0 overflow-hidden">{editor}</div>
      {separator('left', showEditor)}
      <div className="workspace-graph min-w-0 min-h-0 relative overflow-hidden">{graph}</div>
      {separator('right', showInspector)}
      <div id="workspace-inspector" hidden={!showInspector} className="workspace-inspector min-w-0 min-h-0 overflow-hidden">{inspector}</div>
    </div>
  </>;
}
