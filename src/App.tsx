import React, { useRef, useState, useCallback, useEffect } from 'react';
import parseDataText, { type SequenceData } from './utils/parseDataText';

export default function App() {
  // ⬇️ Hooks must be unconditional, at the top
  const fileInputRef = useRef<HTMLInputElement>(null);
  const dropRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const [data, setData] = useState<SequenceData<number | Date> | null>(null);
  const [scrollTop, setScrollTop] = useState(0);

  const handleFile = useCallback((file: File) => {
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const text = reader.result as string;
        const seq = parseDataText(text);
        setData(seq);
      } catch (err: any) {
        console.error(err);
        alert(err?.message || 'Error parsing data');
      }
    };
    reader.readAsText(file);
  }, []);

  const onClick = useCallback(() => {
    fileInputRef.current?.click();
  }, []);

  // Stabilize these so the effect doesn’t re-register every render
  const onDrop = useCallback((e: DragEvent) => {
    e.preventDefault();
    if (e.dataTransfer?.files && e.dataTransfer.files.length > 0) {
      handleFile(e.dataTransfer.files[0]);
      e.dataTransfer.clearData();
    }
  }, [handleFile]);

  const onDragOver = useCallback((e: DragEvent) => {
    e.preventDefault();
  }, []);

  useEffect(() => {
    const div = dropRef.current;
    if (!div) return;
    div.addEventListener('dragover', onDragOver as any);
    div.addEventListener('drop', onDrop as any);
    return () => {
      div.removeEventListener('dragover', onDragOver as any);
      div.removeEventListener('drop', onDrop as any);
    };
  }, [onDragOver, onDrop]);

  const rowHeight = 30;

  const onScroll = useCallback((e: React.UIEvent<HTMLDivElement>) => {
    setScrollTop(e.currentTarget.scrollTop);
  }, []);

  // If no data yet, render the drop zone / file picker
  if (!data) {
    return (
      <div
        ref={dropRef}
        onClick={onClick}
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
          cursor: 'pointer',
        }}
      >
        <input
          ref={fileInputRef}
          type="file"
          accept=".csv,.tsv,text/csv,text/tab-separated-values"
          style={{ display: 'none' }}
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) handleFile(f);
          }}
        />
        <p>Please drag and drop a csv or tsv file, or click here to open file picker.</p>
      </div>
    );
  }

  // Virtualization math
  const totalRows = data.dataPoints.length;
  const totalHeight = totalRows * rowHeight;
  const viewportHeight = listRef.current?.clientHeight ?? window.innerHeight;
  const startIndex = Math.max(0, Math.floor(scrollTop / rowHeight) - 5);
  const endIndex = Math.min(
    totalRows,
    Math.ceil((scrollTop + viewportHeight) / rowHeight) + 5
  );

  return (
    <div style={{ display: 'flex', height: '100vh' }}>
      <div
        ref={listRef}
        style={{
          width: '50%',
          height: '100%',
          overflow: 'auto',
          borderRight: '1px solid #ccc',
        }}
        onScroll={onScroll}
      >
        <div style={{ position: 'relative', height: totalHeight, width: '100%' }}>
          <div
            style={{
              display: 'flex',
              position: 'sticky',
              top: 0,
              background: '#f0f0f0',
              fontWeight: 'bold',
              zIndex: 1,
            }}
          >
            <div style={{ flex: 1, padding: '4px' }}>{data.timeAxisName}</div>
            <div style={{ flex: 1, padding: '4px' }}>{data.valueAxisName}</div>
          </div>
          {data.dataPoints.slice(startIndex, endIndex).map(([x, y], idx) => {
            const rowIndex = startIndex + idx;
            return (
              <div
                key={rowIndex}
                style={{
                  display: 'flex',
                  position: 'absolute',
                  top: rowIndex * rowHeight,
                  height: rowHeight,
                  width: '100%',
                }}
              >
                <div style={{ flex: 1, padding: '4px' }}>
                  {x instanceof Date ? x.toISOString() : x}
                </div>
                <div style={{ flex: 1, padding: '4px' }}>{y}</div>
              </div>
            );
          })}
        </div>
      </div>
      <div style={{ flex: 1 }}>{/* TODO: add right side content */}</div>
    </div>
  );
}
