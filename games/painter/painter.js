/* ============================================================================
   Painter — Arline Arcade
   Finger painting, nothing else: one canvas, three brush sizes, ten colors,
   an eraser, Undo (20 steps), Clear with a soft confirm, and Save-as-PNG.
   Vanilla JS, Pointer Events, devicePixelRatio-crisp.
   ============================================================================ */

const PAPER = '#fffdf6';                       // matches #paper background in painter.css
const SIZES = { small: 5, medium: 13, large: 28 };   // brush width in CSS px
const ERASER_SCALE = 2.2;                      // eraser is chunkier than the brush
const UNDO_MAX = 20;

const canvas = document.getElementById('paper');
const ctx = canvas.getContext('2d');
const undoBtn = document.getElementById('undo');
const clearBtn = document.getElementById('clear');
const saveBtn = document.getElementById('save');
const eraserBtn = document.getElementById('eraser');
const swatches = [...document.querySelectorAll('.swatch')];
const sizeBtns = [...document.querySelectorAll('.pill.size')];

let color = '#111111';
let size = 'medium';
let eraser = false;
let dpr = 1;

/* ---- crisp canvas that survives rotation ---------------------------------- */
function fitCanvas() {
  dpr = Math.max(1, Math.min(3, window.devicePixelRatio || 1));
  const r = canvas.getBoundingClientRect();
  const w = Math.max(1, Math.round(r.width * dpr));
  const h = Math.max(1, Math.round(r.height * dpr));
  if (canvas.width === w && canvas.height === h) return;

  // keep the picture when the tablet is rotated: copy, resize, paint it back
  let keep = null;
  if (canvas.width > 1 && canvas.height > 1) {
    keep = document.createElement('canvas');
    keep.width = canvas.width; keep.height = canvas.height;
    keep.getContext('2d').drawImage(canvas, 0, 0);
  }
  canvas.width = w; canvas.height = h;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.fillStyle = PAPER;
  ctx.fillRect(0, 0, w / dpr, h / dpr);
  if (keep) ctx.drawImage(keep, 0, 0, keep.width, keep.height, 0, 0, w / dpr, h / dpr);
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
}

let resizeTimer = 0;
const scheduleFit = () => { clearTimeout(resizeTimer); resizeTimer = setTimeout(fitCanvas, 120); };
window.addEventListener('resize', scheduleFit);
new ResizeObserver(scheduleFit).observe(canvas);   // catches any reflow, not just rotation

/* ---- undo: a small stack of snapshots -------------------------------------- */
const undoStack = [];
function snapshot() {
  const c = document.createElement('canvas');
  c.width = canvas.width; c.height = canvas.height;
  c.getContext('2d').drawImage(canvas, 0, 0);
  undoStack.push(c);
  if (undoStack.length > UNDO_MAX) undoStack.shift();
  undoBtn.disabled = false;
}
function undo() {
  const c = undoStack.pop();
  if (c) {
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.drawImage(c, 0, 0, c.width, c.height, 0, 0, canvas.width, canvas.height);
    ctx.restore();
  }
  undoBtn.disabled = undoStack.length === 0;
}
undoBtn.addEventListener('click', undo);

/* ---- painting -------------------------------------------------------------- */
let painting = false, activeId = null, last = null;

const point = (e) => {
  const r = canvas.getBoundingClientRect();
  return { x: e.clientX - r.left, y: e.clientY - r.top };
};
function strokeSetup() {
  ctx.strokeStyle = eraser ? PAPER : color;
  ctx.lineWidth = SIZES[size] * (eraser ? ERASER_SCALE : 1);
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
}
function segment(a, b) {
  ctx.beginPath();
  ctx.moveTo(a.x, a.y);
  ctx.lineTo(b.x, b.y);
  ctx.stroke();
}

canvas.addEventListener('pointerdown', (e) => {
  if (painting) return;                        // first finger paints; ignore the rest
  painting = true; activeId = e.pointerId;
  canvas.setPointerCapture(e.pointerId);
  snapshot();
  strokeSetup();
  last = point(e);
  segment(last, last);                         // a tap leaves a dot
  e.preventDefault();
});
canvas.addEventListener('pointermove', (e) => {
  if (!painting || e.pointerId !== activeId) return;
  const events = e.getCoalescedEvents ? e.getCoalescedEvents() : [e];
  for (const ev of events.length ? events : [e]) {
    const p = point(ev);
    segment(last, p);
    last = p;
  }
});
const endStroke = (e) => { if (e.pointerId === activeId) { painting = false; activeId = null; } };
canvas.addEventListener('pointerup', endStroke);
canvas.addEventListener('pointercancel', endStroke);

/* ---- colors ----------------------------------------------------------------- */
swatches.forEach((b) => b.addEventListener('click', () => {
  color = b.dataset.color;
  swatches.forEach((s) => s.setAttribute('aria-pressed', String(s === b)));
  setEraser(false);                            // picking a color goes back to painting
}));

/* ---- sizes ------------------------------------------------------------------ */
sizeBtns.forEach((b) => b.addEventListener('click', () => {
  size = b.dataset.size;
  sizeBtns.forEach((s) => s.setAttribute('aria-pressed', String(s === b)));
}));

/* ---- eraser ------------------------------------------------------------------ */
function setEraser(on) {
  eraser = on;
  eraserBtn.setAttribute('aria-pressed', String(on));
}
eraserBtn.addEventListener('click', () => setEraser(!eraser));

/* ---- clear, with a soft confirm ("Really clear?" for 3 seconds) -------------- */
let clearTimer = 0;
function disarmClear() {
  clearTimeout(clearTimer);
  clearBtn.textContent = 'Clear';
  clearBtn.classList.remove('armed');
}
clearBtn.addEventListener('click', () => {
  if (!clearBtn.classList.contains('armed')) {
    clearBtn.textContent = 'Really clear?';
    clearBtn.classList.add('armed');
    clearTimeout(clearTimer);
    clearTimer = setTimeout(disarmClear, 3000);
    return;
  }
  disarmClear();
  snapshot();                                  // Undo can bring the picture back
  ctx.fillStyle = PAPER;
  ctx.fillRect(0, 0, canvas.width / dpr, canvas.height / dpr);
});

/* ---- save as PNG --------------------------------------------------------------- */
let savedTimer = 0;
saveBtn.addEventListener('click', () => {
  canvas.toBlob((blob) => {
    if (!blob) return;
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'painting-' + new Date().toISOString().slice(0, 10) + '.png';
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 5000);
    saveBtn.textContent = 'Saved!';
    clearTimeout(savedTimer);
    savedTimer = setTimeout(() => { saveBtn.textContent = 'Save picture'; }, 2000);
  }, 'image/png');
});

/* ---- go ------------------------------------------------------------------------ */
fitCanvas();
