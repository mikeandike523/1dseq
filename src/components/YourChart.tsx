import Plot from 'react-plotly.js';
import type { PlotlyHTMLElement } from 'plotly.js-dist-min';
import { useRef, useEffect, useCallback } from 'react';
import type { SequenceData } from '../utils/parseDataText';

function scaleRange([r0, r1]: [number, number], factor: number): [number, number] {
  const c = (r0 + r1) / 2;
  const half = ((r1 - r0) / 2) * factor;
  return [c - half, c + half];
}

export default function YourChart({ data, rightPaneWidth, rightPaneHeight }: {
  data: SequenceData<number|Date>,
  rightPaneWidth: number,
  rightPaneHeight: number
}) {
  const gdRef = useRef<PlotlyHTMLElement | null>(null);

  const attachWheel = useCallback((gd: PlotlyHTMLElement | null) => {
    if (!gd) return;
    // Clean up any previous listener
    if ((gd as any).__wheelHandler) {
      gd.removeEventListener('wheel', (gd as any).__wheelHandler, { capture: true } as any);
    }

    const handler = (e: WheelEvent) => {
      // Only trap when a modifier is held; otherwise let Plotly handle wheel zoom (or disable default)
      const xOnly = e.shiftKey;
      const yOnly = e.ctrlKey || e.metaKey || e.altKey;

      if (!xOnly && !yOnly) return; // no modifier → do nothing special

      e.preventDefault();

      const full = (gd as any)._fullLayout;
      const xa = full.xaxis;
      const ya = full.yaxis;

      // Current ranges are numbers for both numeric and date axes (dates = ms since epoch)
      const xr: [number, number] = [xa.range[0], xa.range[1]];
      const yr: [number, number] = [ya.range[0], ya.range[1]];

      // Zoom in on wheel-up, out on wheel-down
      const factor = e.deltaY < 0 ? 0.9 : 1.1;

      const relayout: Record<string, number> = {};
      if (xOnly) {
        const [nx0, nx1] = scaleRange(xr, factor);
        relayout['xaxis.autorange'] =  false as any;
        relayout['xaxis.range[0]'] = nx0;
        relayout['xaxis.range[1]'] = nx1;
      } else if (yOnly) {
        const [ny0, ny1] = scaleRange(yr, factor);
        relayout['yaxis.autorange'] = false as any;
        relayout['yaxis.range[0]'] = ny0;
        relayout['yaxis.range[1]'] = ny1;
      }

      (window as any).Plotly.relayout(gd, relayout);
    };

    // Capture phase helps ensure we intercept before Plotly’s own wheel logic
    gd.addEventListener('wheel', handler, { passive: false, capture: true });
    (gd as any).__wheelHandler = handler;
  }, []);

  useEffect(() => {
    if (gdRef.current) attachWheel(gdRef.current);
    return () => {
      const gd = gdRef.current as any;
      if (gd && gd.__wheelHandler) {
        gd.removeEventListener('wheel', gd.__wheelHandler, { capture: true } as any);
        gd.__wheelHandler = null;
      }
    };
  }, [attachWheel, rightPaneWidth, rightPaneHeight]);

  return (
    <Plot
      data={[
        {
          x: data.dataPoints.map(([x]):number|Date => x),
          y: data.dataPoints.map(([, y]):number => y),
          type: 'scatter',
          mode: 'lines',
          hovertemplate: `%{x}<br>${data.valueAxisName}: %{y}<extra></extra>`,
        },
      ]}
      layout={{
        width: rightPaneWidth,
        height: rightPaneHeight,
        margin: { l: 56, r: 20, t: 30, b: 40 },
        showlegend: false,
        dragmode: 'pan', // drag = pan
        xaxis: {
          type: data.dataPoints[0]?.[0] instanceof Date ? 'date' : 'linear',
          title: { text: data.timeAxisName },
          hoverformat: '%Y-%m-%d %H:%M:%S',
        },
        yaxis: { title: { text: data.valueAxisName }, zeroline: false },
        uirevision: 'keep',
      }}
      config={{
        responsive: true,
        displaylogo: false,
        // Let us decide when wheel zoom happens via modifiers:
        scrollZoom: false,
        // If you prefer default wheel-zoom when no modifiers are held, set this to true
        // and remove the "return" early in the handler above.
      }}
      style={{ width: rightPaneWidth, height: rightPaneHeight }}
      onInitialized={(_, graphDiv) => {
        gdRef.current = graphDiv as PlotlyHTMLElement;
        attachWheel(gdRef.current);
      }}
      onUpdate={(_, graphDiv) => {
        gdRef.current = graphDiv as PlotlyHTMLElement;
        attachWheel(gdRef.current);
      }}
    />
  );
}
