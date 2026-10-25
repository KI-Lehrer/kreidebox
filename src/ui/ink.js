// Shared drawing engine for the Draw widget and the annotation layer.
// Strokes are stored in normalised coordinates (0..1) so they survive resizing.
// stroke: { tool: 'pen'|'marker'|'eraser'|'line'|'rect'|'ellipse', color, size, pts: [[x,y], ...] }  size = fraction of the shorter side

export const INK_COLORS = ['#191B22', '#B42323', '#1D4A86', '#1D7346', '#E0A100', '#FFFFFF'];
export const INK_SIZES = [0.004, 0.008, 0.016];

export function drawStrokes(ctx, strokes, w, h) {
  ctx.clearRect(0, 0, w, h);
  const m = Math.min(w, h);
  for (const s of strokes) {
    if (!s.pts || !s.pts.length) continue;
    ctx.save();
    ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    ctx.strokeStyle = s.color; ctx.fillStyle = s.color;
    ctx.lineWidth = Math.max(1, s.size * m * (s.tool === 'marker' ? 3 : s.tool === 'eraser' ? 4 : 1));
    if (s.tool === 'marker') ctx.globalAlpha = 0.35;
    if (s.tool === 'eraser') ctx.globalCompositeOperation = 'destination-out';
    const P = s.pts.map(([x, y]) => [x * w, y * h]);
    ctx.beginPath();
    if (s.tool === 'line' || s.tool === 'rect' || s.tool === 'ellipse') {
      const [a, b] = [P[0], P[P.length - 1]];
      if (s.tool === 'line') { ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]); }
      else if (s.tool === 'rect') ctx.rect(a[0], a[1], b[0] - a[0], b[1] - a[1]);
      else ctx.ellipse((a[0] + b[0]) / 2, (a[1] + b[1]) / 2, Math.abs(b[0] - a[0]) / 2, Math.abs(b[1] - a[1]) / 2, 0, 0, Math.PI * 2);
      ctx.stroke();
    } else if (P.length === 1) {
      ctx.arc(P[0][0], P[0][1], ctx.lineWidth / 2, 0, Math.PI * 2); ctx.fill();
    } else {
      ctx.moveTo(P[0][0], P[0][1]);
      for (let i = 1; i < P.length - 1; i++) { const mx = (P[i][0] + P[i + 1][0]) / 2; const my = (P[i][1] + P[i + 1][1]) / 2; ctx.quadraticCurveTo(P[i][0], P[i][1], mx, my); }
      ctx.lineTo(P[P.length - 1][0], P[P.length - 1][1]);
      ctx.stroke();
    }
    ctx.restore();
  }
}

// Attaches drawing to a canvas. opts: { getStrokes(), getTool() -> {tool,color,size}, onCommit(strokes), enabled() }
export function attachInk(canvas, opts) {
  const ctx = canvas.getContext('2d');
  let current = null;
  function size() {
    const r = canvas.getBoundingClientRect();
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const W = Math.max(1, Math.round(canvas.clientWidth * dpr)); const H = Math.max(1, Math.round(canvas.clientHeight * dpr));
    if (canvas.width !== W || canvas.height !== H) { canvas.width = W; canvas.height = H; }
    return r;
  }
  function render() { size(); drawStrokes(ctx, current ? [...opts.getStrokes(), current] : opts.getStrokes(), canvas.width, canvas.height); }
  const pos = (e) => { const r = canvas.getBoundingClientRect(); return [Math.min(1, Math.max(0, (e.clientX - r.left) / r.width)), Math.min(1, Math.max(0, (e.clientY - r.top) / r.height))]; };
  canvas.addEventListener('pointerdown', (e) => {
    if (opts.enabled && !opts.enabled()) return;
    if (e.button !== 0 && e.pointerType === 'mouse') return;
    e.preventDefault(); e.stopPropagation();
    canvas.setPointerCapture(e.pointerId);
    const t = opts.getTool();
    current = { tool: t.tool, color: t.color, size: t.size, pts: [pos(e)] };
    render();
  });
  canvas.addEventListener('pointermove', (e) => {
    if (!current) return;
    const p = pos(e);
    if (['line', 'rect', 'ellipse'].includes(current.tool)) current.pts = [current.pts[0], p];
    else { const last = current.pts[current.pts.length - 1]; if (Math.hypot(p[0] - last[0], p[1] - last[1]) > 0.002) current.pts.push(p); }
    render();
  });
  const end = () => {
    if (!current) return;
    const s = current; current = null;
    s.pts = s.pts.map(([x, y]) => [Math.round(x * 10000) / 10000, Math.round(y * 10000) / 10000]);
    opts.onCommit([...opts.getStrokes(), s]);
    render();
  };
  canvas.addEventListener('pointerup', end); canvas.addEventListener('pointercancel', end);
  const ro = new ResizeObserver(render); ro.observe(canvas);
  return { render, destroy: () => ro.disconnect() };
}
