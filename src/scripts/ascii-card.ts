// The /blog hero: the landing page's business card, redrawn in ASCII and spun
// in software. Every frame ray-casts each character cell onto a rotated card
// plane (orthographic) and picks a glyph by what it hits — edge, lettering or
// fill — shaded by how squarely the card faces a fixed light.
//
// Drag to spin it, click (or Enter/Space) to flick it; left alone it drifts.

const COLS = 92;
const ROWS = 40;
const CELL_H = 1.85; // a monospace cell is ~1.85× taller than it is wide
const CARD_W = 72; // in cell widths
const CARD_H = 41;
const GLYPH_ADVANCE = 0.6; // JetBrains Mono advance width, in em

// 5×7 bitmap glyphs, just the letters the card needs.
const FONT: Record<string, string[]> = {
  B: ['11110', '10001', '10001', '11110', '10001', '10001', '11110'],
  I: ['01110', '00100', '00100', '00100', '00100', '00100', '01110'],
  L: ['10000', '10000', '10000', '10000', '10000', '10000', '11111'],
  W: ['10001', '10001', '10001', '10101', '10101', '10101', '01010'],
  A: ['01110', '10001', '10001', '11111', '10001', '10001', '10001'],
  N: ['10001', '11001', '10101', '10011', '10001', '10001', '10001'],
  G: ['01110', '10001', '10000', '10111', '10001', '10001', '01111'],
  O: ['01110', '10001', '10001', '10001', '10001', '10001', '01110'],
};

const FRONT = ['BILL', 'WANG'];
const BACK = ['BLOG'];

/** Is card-space point (u, v) on a lit pixel of `lines`, centred, at `px` units per pixel? */
function lettering(u: number, v: number, lines: string[], px: number): boolean {
  const total = (lines.length * 7 + (lines.length - 1) * 2) * px;
  const row = Math.floor((v + total / 2) / px);
  if (row < 0) return false;
  const line = Math.floor(row / 9);
  const y = row % 9;
  if (line >= lines.length || y >= 7) return false;
  const word = lines[line];
  const col = Math.floor((u + ((word.length * 6 - 1) * px) / 2) / px);
  if (col < 0) return false;
  const ch = Math.floor(col / 6);
  const x = col % 6;
  if (ch >= word.length || x >= 5) return false;
  return FONT[word[ch]][y][x] === '1';
}

function frame(yaw: number, pitch: number): string {
  const cy = Math.cos(yaw), sy = Math.sin(yaw);
  const cp = Math.cos(pitch), sp = Math.sin(pitch);
  // Card normal after rotating by Ry(yaw)·Rx(pitch).
  const nx = sy * cp, ny = -sp, nz = cy * cp;
  const blank = '\n'.repeat(ROWS - 1);
  if (Math.abs(nz) < 0.06) return blank; // edge-on: nothing to draw

  const light = Math.abs(nx * -0.35 + ny * -0.45 + nz * 0.82);
  const tone = Math.min(3, Math.floor(light * 3.2));
  const fill = ',:;-'[tone];
  const ink = '*#%@'[tone];
  const edge = '=#%@'[Math.min(3, Math.floor(light * 3.6))];
  const front = nz > 0;

  const rows: string[] = [];
  for (let r = 0; r < ROWS; r++) {
    let out = '';
    const y = (r - ROWS / 2 + 0.5) * CELL_H;
    for (let c = 0; c < COLS; c++) {
      const x = c - COLS / 2 + 0.5;
      const z = -(nx * x + ny * y) / nz; // where this cell's ray meets the plane
      const u = cy * x - sy * z; // …in card-local coordinates
      const v = sy * sp * x + cp * y + cy * sp * z;
      if (Math.abs(u) > CARD_W / 2 || Math.abs(v) > CARD_H / 2) out += ' ';
      else if (Math.abs(u) > CARD_W / 2 - 1.4 || Math.abs(v) > CARD_H / 2 - 2.2) out += edge;
      else if (front ? lettering(u, v, FRONT, 1.75) : lettering(-u, v, BACK, 2.3)) out += ink;
      else out += fill;
    }
    rows.push(out.trimEnd());
  }
  return rows.join('\n');
}

export function mountAsciiCard(button: HTMLElement, pre: HTMLElement) {
  const still = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  let yaw = 0.5;
  let pitch = -0.15;
  let vYaw = still ? 0 : 0.012;
  let vPitch = 0;
  const drift = still ? 0 : 0.012;
  const restPitch = -0.15;

  let dragging = false;
  let moved = 0;
  let lastX = 0;
  let lastY = 0;
  let visible = true;
  let raf: number | null = null;
  let last = 0;

  const draw = () => {
    pre.textContent = frame(yaw, pitch);
  };

  // Fit the grid to the container: size the font so COLS cells fill its width.
  const fit = () => {
    const size = Math.min(11, Math.max(4, button.clientWidth / (COLS * GLYPH_ADVANCE)));
    pre.style.fontSize = `${size}px`;
  };

  const tick = (t: number) => {
    raf = null;
    // ~30fps is plenty for ASCII and halves the work.
    if (t - last >= 32) {
      last = t;
      if (!dragging) {
        vYaw += (drift - vYaw) * 0.03;
        vPitch *= 0.9;
        yaw += vYaw;
        pitch += vPitch + (restPitch - pitch) * 0.03;
      }
      draw();
    }
    schedule();
  };

  const settled = () =>
    !dragging && Math.abs(vYaw - drift) < 0.0005 && Math.abs(vPitch) < 0.0005 && Math.abs(pitch - restPitch) < 0.002;

  function schedule() {
    if (raf !== null || !visible || document.hidden) return;
    // With reduced motion there is no idle drift, so stop once a flick dies down.
    if (still && settled()) return;
    raf = requestAnimationFrame(tick);
  }

  button.addEventListener('pointerdown', (e) => {
    dragging = true;
    moved = 0;
    lastX = e.clientX;
    lastY = e.clientY;
    button.setPointerCapture(e.pointerId);
  });
  button.addEventListener('pointermove', (e) => {
    if (!dragging) return;
    const dx = e.clientX - lastX;
    const dy = e.clientY - lastY;
    lastX = e.clientX;
    lastY = e.clientY;
    moved += Math.abs(dx) + Math.abs(dy);
    vYaw = dx * 0.012;
    vPitch = -dy * 0.008;
    yaw += vYaw;
    pitch = Math.max(-1.2, Math.min(1.2, pitch + vPitch));
    schedule();
  });
  const release = () => {
    dragging = false;
    schedule();
  };
  button.addEventListener('pointerup', release);
  button.addEventListener('pointercancel', release);

  // A click that wasn't a drag (or Enter/Space) flicks the card round.
  button.addEventListener('click', () => {
    const wasDrag = moved > 4;
    moved = 0; // so a later keyboard press still flicks
    if (wasDrag) return;
    vYaw = 0.32;
    schedule();
  });

  // Don't spin what nobody can see.
  new IntersectionObserver(([entry]) => {
    visible = entry.isIntersecting;
    schedule();
  }).observe(button);
  document.addEventListener('visibilitychange', schedule);

  new ResizeObserver(fit).observe(button);
  fit();
  draw();
  schedule();
}
