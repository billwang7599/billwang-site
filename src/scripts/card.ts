import * as THREE from 'three';

/** Live-tunable parameters for the card. The render loop reads these every
 *  frame, so mutating the returned object updates behavior in real time. */
export interface CardParams {
  dragSens: number;   // rotation per pixel of mouse drag
  keyAccel: number;   // velocity added per frame while a key is held
  maxVel: number;     // hard cap on rotation speed (rad/frame)
  damping: number;    // inertia decay after release (0–1, higher = longer spin)
  idleYaw: number;    // drift speed when untouched
  idleDelay: number;  // ms of inactivity before drift starts
  roughness: number;  // card surface roughness (0 = glossy, 1 = matte)
  camDist: number;    // camera distance (smaller = card appears larger)
  thickness: number;  // card depth (smaller = thinner stock)
  cornerRadius: number; // rounded-corner radius (0 = square corners)
  grain: number;      // paper relief DEPTH (real geometry displacement, world units)
}

export const DEFAULT_PARAMS: CardParams = {
  dragSens: 0.003,
  keyAccel: 0.0002,
  maxVel: 0.03,
  damping: 0.94,
  idleYaw: 0.0005,
  idleDelay: 5000,
  roughness: 1,
  camDist: 6.7,
  thickness: 0.01,
  cornerRadius: 0.07,
  grain: 0.003,
};

/**
 * Renders a blank 3D business card, centered in the viewport.
 * Rotate it with: mouse drag anywhere, WASD, or arrow keys.
 * Released motion carries inertia; when left alone the card drifts slowly.
 *
 * Returns { params } — mutate it to tune behavior live (see /admin).
 */
export function mountCard(canvas: HTMLCanvasElement, params: CardParams = { ...DEFAULT_PARAMS }) {
  // ---- Renderer ----------------------------------------------------------
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(window.innerWidth, window.innerHeight);

  // ---- Scene & camera ----------------------------------------------------
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(35, window.innerWidth / window.innerHeight, 0.1, 100);
  camera.position.set(0, 0, params.camDist);
  camera.lookAt(0, 0, 0);

  // ---- Lighting ----------------------------------------------------------
  // Cool, even gallery light: a clinical near-white key with a faintly blue
  // sky / cool-grey ground hemisphere, so the bone stock reads crisp and
  // composed rather than creamy. Clinical, not warm.
  scene.add(new THREE.HemisphereLight(0xf2f6ff, 0xb4bac2, 0.78));
  const key = new THREE.DirectionalLight(0xeef4ff, 1.15);
  key.position.set(3, 4, 5);
  scene.add(key);
  const rim = new THREE.DirectionalLight(0xdfe7f2, 0.42);
  rim.position.set(-4, -2, -3);
  scene.add(rim);

  // ---- Environment probe -------------------------------------------------
  // A tiny blurred gradient (cool sky over a greyer floor), prefiltered into an
  // environment map. It gives the matte stock a faint, even sheen and — more to
  // the point — gives the gilt edge something real to reflect, so the gold reads
  // as metal under gallery light rather than a flat painted line.
  scene.environment = (() => {
    const c = document.createElement('canvas');
    c.width = 64;
    c.height = 32;
    const cx = c.getContext('2d')!;
    const g = cx.createLinearGradient(0, 0, 0, 32);
    g.addColorStop(0.0, '#f6f9ff');
    g.addColorStop(0.5, '#d7dce3');
    g.addColorStop(1.0, '#aeb4bd');
    cx.fillStyle = g;
    cx.fillRect(0, 0, 64, 32);
    const tex = new THREE.CanvasTexture(c);
    tex.mapping = THREE.EquirectangularReflectionMapping;
    tex.colorSpace = THREE.SRGBColorSpace;
    const pmrem = new THREE.PMREMGenerator(renderer);
    const env = pmrem.fromEquirectangular(tex).texture;
    tex.dispose();
    pmrem.dispose();
    return env;
  })();

  // ---- Card geometry -----------------------------------------------------
  const W = 3.5;          // business-card ratio 3.5 : 2
  const H = 2.0;
  const ASPECT = W / H;

  // The front panel is finely tessellated so the displacement map moves real
  // geometry (genuine 3D relief). The body (edges + back) is a separate flat
  // mesh, so the card's edges stay crisp and flat — the stamped look.
  const SEG_X = 640;
  const SEG_Y = 366;
  const TEX = 512;        // stamp texture resolution

  // Paper "tooth": the analytic height of the stock at UV (u,v). A tight woven
  // crosshatch across the whole face plus a thin inset frame line; fades to a
  // clear center. Shared by the back panel's grain maps AND the front panel's
  // combined relief, so the front's letterpress deboss sits on the same stock.
  const grainHeightAt = (u: number, v: number): number => {
    const X = u * W;
    const Y = v * H;
    const k = Math.PI / 0.05;
    const a1 = (X + Y) + 0.05 * Math.sin((X - Y) * 9.0);
    const a2 = (X - Y) + 0.05 * Math.sin((X + Y) * 9.0);
    const s1 = Math.sin(a1 * k);
    const s2 = Math.sin(a2 * k);
    const w = 0.5;
    const line = Math.max(
      Math.exp(-(s1 * s1) / (2 * w * w)),
      Math.exp(-(s2 * s2) / (2 * w * w)),
    );
    const ex = Math.min(u, 1 - u) * W;
    const ey = Math.min(v, 1 - v) * H;
    const edge = Math.min(ex, ey);
    const frameInset = 0.06;
    const fd = Math.abs(edge - frameInset);
    const frame = Math.exp(-(fd * fd) / (2 * 0.006 * 0.006));
    const t = Math.max(0, Math.min(1, (frameInset - edge) / 0.05));
    const grainMask = t * t * (3 - 2 * t);

    // faint isotropic micro-tooth across the WHOLE face (center included) so the
    // blank areas read as real stock rather than dead-flat plastic.
    const mg =
      Math.sin(X * 131.0) * Math.cos(Y * 149.0) +
      Math.sin((X + Y) * 89.0) * Math.cos((X - Y) * 107.0);
    const micro = (mg * 0.25 + 0.5) * 0.1; // ~[0, 0.1]

    return Math.min(1, line * 0.6 * grainMask + frame + micro);
  };

  // --- Guilloché stamp ----------------------------------------------------
  // Deterministic fine-line rosette (banknote-style), fading to a flat margin
  // near the border so the panel edges stay clean. Produces a displacement map
  // (real relief) and a matching normal map (crisp shading of the thin lines).
  function makeStampMaps() {
    const n = TEX;
    const height = new Float32Array(n * n);

    for (let y = 0; y < n; y++) {
      for (let x = 0; x < n; x++) {
        const u = x / (n - 1);
        const v = y / (n - 1);
        // shared stock profile: border crosshatch + frame line + faint
        // full-face paper tooth (see grainHeightAt).
        height[y * n + x] = grainHeightAt(u, v);
      }
    }

    const cl = (i: number) => Math.max(0, Math.min(n - 1, i));
    const at = (x: number, y: number) => height[cl(y) * n + cl(x)];

    // displacement map (grayscale height)
    const dc = document.createElement('canvas');
    dc.width = dc.height = n;
    const dctx = dc.getContext('2d')!;
    const dimg = dctx.createImageData(n, n);
    for (let i = 0; i < height.length; i++) {
      const val = height[i] * 255;
      dimg.data[i * 4] = dimg.data[i * 4 + 1] = dimg.data[i * 4 + 2] = val;
      dimg.data[i * 4 + 3] = 255;
    }
    dctx.putImageData(dimg, 0, 0);

    // normal map (gradient of the same field)
    const nc = document.createElement('canvas');
    nc.width = nc.height = n;
    const nctx = nc.getContext('2d')!;
    const nimg = nctx.createImageData(n, n);
    const STR = 2.2;
    for (let y = 0; y < n; y++) {
      for (let x = 0; x < n; x++) {
        const dx = (at(x - 1, y) - at(x + 1, y)) * STR;
        const dy = (at(x, y - 1) - at(x, y + 1)) * STR;
        const len = Math.hypot(dx, dy, 1);
        const i = (y * n + x) * 4;
        nimg.data[i] = ((dx / len) * 0.5 + 0.5) * 255;
        nimg.data[i + 1] = ((dy / len) * 0.5 + 0.5) * 255;
        nimg.data[i + 2] = (1 / len) * 0.5 * 255 + 127;
        nimg.data[i + 3] = 255;
      }
    }
    nctx.putImageData(nimg, 0, 0);

    const mk = (cv: HTMLCanvasElement) => {
      const t = new THREE.CanvasTexture(cv);
      t.anisotropy = renderer.capabilities.getMaxAnisotropy();
      return t;
    };
    return { displacementMap: mk(dc), normalMap: mk(nc) };
  }

  // Printed text, laid out like Patrick Bateman's "Pierce & Pierce" card:
  // a phone-position contact at top-left, a firm-style mark at top-right, the
  // name centered (first name roman, surname spaced caps) with a title beneath,
  // and the remaining details strung across the bottom in tracked small caps.
  //
  // Two things are produced from the same layout:
  //   • a COLOR map (the dark "bone & ink" print), and
  //   • a NORMAL map where every glyph is recessed into the stock — the
  //     letterpress *deboss* ("embedded ink") look, on top of the paper tooth.
  type Box = { x0: number; x1: number; y0: number; y1: number; url: string | null };

  function makeTextMaps() {
    const TW = 2048;
    const TH = Math.round(TW * (H / W));
    const mk = () => {
      const cv = document.createElement('canvas');
      cv.width = TW;
      cv.height = TH;
      return cv;
    };
    const cc = mk(); const cctx = cc.getContext('2d')!;   // color (ink)
    const mc = mk(); const mctx = mc.getContext('2d')!;   // ink coverage mask
    const nc = mk(); const nctx = nc.getContext('2d')!;   // derived normal map

    const boxes: Box[] = [];
    const INK = '#15161a';                                 // crisp, cool near-black engraving ink
    const FONT = '"EB Garamond", "Times New Roman", serif';

    const pushBox = (x0: number, x1: number, baseY: number, size: number, url: string) => {
      boxes.push({
        x0: x0 / TW,
        x1: x1 / TW,
        // canvas y -> texture v (CanvasTexture flips Y): v = 1 - y/TH
        y0: 1 - (baseY + size * 0.32) / TH,
        y1: 1 - (baseY - size * 0.85) / TH,
        url,
      });
    };

    // Lay the whole card out into `ctx`. In mask mode we paint white-on-black
    // (ink coverage) and skip box bookkeeping; the geometry is identical so the
    // deboss lines up pixel-for-pixel with the printed ink.
    const layout = (ctx: CanvasRenderingContext2D, mask: boolean) => {
      ctx.fillStyle = mask ? '#000000' : '#ffffff';        // white => card's bone shows through
      ctx.fillRect(0, 0, TW, TH);
      ctx.fillStyle = mask ? '#ffffff' : INK;
      ctx.textBaseline = 'alphabetic';
      if (mask) ctx.filter = 'blur(2.2px)';                // soft, pressed-in bevel
      if (!mask) boxes.length = 0;

      const sideX = TW * 0.085;

      // ---- top-left: primary contact (the "phone" slot) -------------------
      const topSize = Math.round(TH * 0.041);
      ctx.font = `400 ${topSize}px ${FONT}`;
      ctx.textAlign = 'left';
      ctx.letterSpacing = `${Math.round(topSize * 0.05)}px`;
      const topY = TH * 0.165;
      const email = 'me@billwang.dev';
      ctx.fillText(email, sideX, topY);
      if (!mask) pushBox(sideX, sideX + ctx.measureText(email).width, topY, topSize, 'mailto:me@billwang.dev');

      // ---- top-right: firm-style mark -------------------------------------
      ctx.textAlign = 'right';
      ctx.letterSpacing = `${Math.round(topSize * 0.16)}px`;
      ctx.fillText('BILLWANG.DEV', TW - sideX, topY);

      // ---- centre: name, "Bill WANG" --------------------------------------
      const nameSize = Math.round(TH * 0.110);
      const nameY = TH * 0.50;
      ctx.textAlign = 'left';
      ctx.font = `500 ${nameSize}px ${FONT}`;
      ctx.letterSpacing = '0px';
      const first = 'Bill ';
      const w1 = ctx.measureText(first).width;
      const trackLast = Math.round(nameSize * 0.07);
      ctx.letterSpacing = `${trackLast}px`;
      const last = 'WANG';
      const w2 = ctx.measureText(last).width - trackLast;  // drop trailing track
      const startX = TW / 2 - (w1 + w2) / 2;
      ctx.letterSpacing = '0px';
      ctx.fillText(first, startX, nameY);
      ctx.letterSpacing = `${trackLast}px`;
      ctx.fillText(last, startX + w1, nameY);
      ctx.letterSpacing = '0px';

      // ---- centre: title (the "Vice President" line) ----------------------
      const subSize = Math.round(TH * 0.046);
      const subY = TH * 0.61;
      ctx.font = `400 ${subSize}px ${FONT}`;
      ctx.textAlign = 'center';
      const subTrack = Math.round(subSize * 0.22);
      ctx.letterSpacing = `${subTrack}px`;
      ctx.fillText('SOFTWARE ENGINEER', TW / 2 + subTrack / 2, subY);

      // ---- bottom: details strung across, like the address line -----------
      const botSize = Math.round(TH * 0.036);
      const botY = TH * 0.865;
      ctx.font = `400 ${botSize}px ${FONT}`;
      ctx.textAlign = 'left';
      ctx.letterSpacing = `${Math.round(botSize * 0.07)}px`;
      const segs: { t: string; url: string | null }[] = [
        { t: 'LINKEDIN/BW7599', url: 'https://www.linkedin.com/in/bw7599' },
        { t: '·', url: null },
        { t: 'GITHUB/BILLWANG7599', url: 'https://github.com/billwang7599' },
        { t: '·', url: null },
        { t: 'MY WORKS', url: '/works' },
      ];
      const sep = '   ';
      const sepW = ctx.measureText(sep).width;
      const ws = segs.map((s) => ctx.measureText(s.t).width);
      const total = ws.reduce((a, b) => a + b, 0) + sepW * (segs.length - 1);
      let x = TW / 2 - total / 2;
      segs.forEach((s, i) => {
        ctx.fillText(s.t, x, botY);
        if (!mask && s.url) pushBox(x, x + ws[i], botY, botSize, s.url);
        x += ws[i] + sepW;
      });
      ctx.letterSpacing = '0px';
      ctx.filter = 'none';
    };

    // Build the normal map: paper tooth (analytic) minus the ink coverage, so
    // glyphs sink into the stock and catch light along their edges.
    const buildNormal = () => {
      const ink = mctx.getImageData(0, 0, TW, TH).data;
      const height = new Float32Array(TW * TH);
      const DEBOSS = 0.6;
      for (let y = 0; y < TH; y++) {
        for (let x = 0; x < TW; x++) {
          const u = x / (TW - 1);
          const v = y / (TH - 1);
          const cov = ink[(y * TW + x) * 4] / 255;
          height[y * TW + x] = grainHeightAt(u, v) - cov * DEBOSS;
        }
      }
      const at = (x: number, y: number) => {
        const xx = x < 0 ? 0 : x >= TW ? TW - 1 : x;
        const yy = y < 0 ? 0 : y >= TH ? TH - 1 : y;
        return height[yy * TW + xx];
      };
      const out = nctx.createImageData(TW, TH);
      const STR = 3.0;
      for (let y = 0; y < TH; y++) {
        for (let x = 0; x < TW; x++) {
          const dx = (at(x - 1, y) - at(x + 1, y)) * STR;
          const dy = (at(x, y - 1) - at(x, y + 1)) * STR;
          const len = Math.hypot(dx, dy, 1);
          const i = (y * TW + x) * 4;
          out.data[i] = ((dx / len) * 0.5 + 0.5) * 255;
          out.data[i + 1] = ((dy / len) * 0.5 + 0.5) * 255;
          out.data[i + 2] = (1 / len) * 0.5 * 255 + 127;
          out.data[i + 3] = 255;
        }
      }
      nctx.putImageData(out, 0, 0);
    };

    const colorTex = new THREE.CanvasTexture(cc);
    colorTex.colorSpace = THREE.SRGBColorSpace;
    colorTex.anisotropy = renderer.capabilities.getMaxAnisotropy();
    const normalTex = new THREE.CanvasTexture(nc);
    normalTex.anisotropy = renderer.capabilities.getMaxAnisotropy();

    const redraw = () => {
      layout(cctx, false);
      layout(mctx, true);
      buildNormal();
      colorTex.needsUpdate = true;
      normalTex.needsUpdate = true;
    };
    redraw();
    // web fonts load async — rebuild both maps once they're ready
    document.fonts?.ready.then(redraw);

    return { tex: colorTex, normalMap: normalTex, boxes };
  }

  // Back panel emblem — a blind-EMBOSSED maker's seal: a "BW" monogram inside a
  // fine double rule, with a tracked colophon beneath. No ink whatsoever — the
  // mark lives purely as raised relief in the stock, so it only declares itself
  // as the card turns and the light rakes across it. Where the front presses ink
  // *in* (deboss), the back pushes the monogram *out* (emboss); the two faces
  // answer one another. The art is drawn mirrored so it reads correctly once the
  // back panel is flipped 180° to face outward.
  function makeBackMaps() {
    const BW2 = 1024;
    const BH2 = Math.round(BW2 * (H / W));
    const FONT = '"EB Garamond", "Times New Roman", serif';
    const mc = document.createElement('canvas');
    mc.width = BW2;
    mc.height = BH2;
    const mctx = mc.getContext('2d')!;

    const drawEmblem = () => {
      mctx.fillStyle = '#000000';
      mctx.fillRect(0, 0, BW2, BH2);

      mctx.fillStyle = '#ffffff';
      mctx.strokeStyle = '#ffffff';
      mctx.textAlign = 'center';
      mctx.textBaseline = 'middle';
      mctx.filter = 'blur(1.6px)'; // soft pressed bevel, matching the front

      const cx = BW2 / 2;
      const cy = BH2 * 0.45;
      const R = BH2 * 0.31;

      // the seal: a bold rule with a finer concentric rule just inside it
      mctx.lineWidth = Math.max(2, BH2 * 0.007);
      mctx.beginPath();
      mctx.arc(cx, cy, R, 0, Math.PI * 2);
      mctx.stroke();
      mctx.lineWidth = Math.max(1.5, BH2 * 0.003);
      mctx.beginPath();
      mctx.arc(cx, cy, R * 0.9, 0, Math.PI * 2);
      mctx.stroke();

      // monogram, centred in the seal
      const mSize = Math.round(BH2 * 0.30);
      mctx.font = `500 ${mSize}px ${FONT}`;
      mctx.letterSpacing = `${Math.round(mSize * 0.03)}px`;
      mctx.fillText('BW', cx + mSize * 0.015, cy + mSize * 0.02);

      // colophon, tracked small caps below the seal
      const cSize = Math.round(BH2 * 0.052);
      mctx.font = `400 ${cSize}px ${FONT}`;
      mctx.letterSpacing = `${Math.round(cSize * 0.36)}px`;
      mctx.fillText('EST · MMXXVI', cx + cSize * 0.18, cy + R + cSize * 1.4);

      mctx.filter = 'none';
    };

    const dc = document.createElement('canvas');
    dc.width = BW2;
    dc.height = BH2;
    const dctx = dc.getContext('2d')!;
    const nc = document.createElement('canvas');
    nc.width = BW2;
    nc.height = BH2;
    const nctx = nc.getContext('2d')!;

    const dispTex = new THREE.CanvasTexture(dc);
    const normTex = new THREE.CanvasTexture(nc);
    [dispTex, normTex].forEach((t) => (t.anisotropy = renderer.capabilities.getMaxAnisotropy()));

    const build = () => {
      drawEmblem();
      const ink = mctx.getImageData(0, 0, BW2, BH2).data;
      const height = new Float32Array(BW2 * BH2);
      const EMBOSS = 0.42; // raise of the mark over the stock
      for (let y = 0; y < BH2; y++) {
        for (let x = 0; x < BW2; x++) {
          const u = x / (BW2 - 1);
          const v = y / (BH2 - 1);
          const cov = ink[(y * BW2 + x) * 4] / 255;
          height[y * BW2 + x] = grainHeightAt(u, v) + cov * EMBOSS;
        }
      }

      // displacement map (real geometry relief; the back panel is tessellated)
      const dimg = dctx.createImageData(BW2, BH2);
      for (let i = 0; i < height.length; i++) {
        const val = Math.min(1, height[i]) * 255;
        dimg.data[i * 4] = dimg.data[i * 4 + 1] = dimg.data[i * 4 + 2] = val;
        dimg.data[i * 4 + 3] = 255;
      }
      dctx.putImageData(dimg, 0, 0);

      // normal map (gradient of the same field, for crisp raking light)
      const at = (x: number, y: number) => {
        const xx = x < 0 ? 0 : x >= BW2 ? BW2 - 1 : x;
        const yy = y < 0 ? 0 : y >= BH2 ? BH2 - 1 : y;
        return height[yy * BW2 + xx];
      };
      const out = nctx.createImageData(BW2, BH2);
      const STR = 2.6;
      for (let y = 0; y < BH2; y++) {
        for (let x = 0; x < BW2; x++) {
          const dx = (at(x - 1, y) - at(x + 1, y)) * STR;
          const dy = (at(x, y - 1) - at(x, y + 1)) * STR;
          const len = Math.hypot(dx, dy, 1);
          const i = (y * BW2 + x) * 4;
          out.data[i] = ((dx / len) * 0.5 + 0.5) * 255;
          out.data[i + 1] = ((dy / len) * 0.5 + 0.5) * 255;
          out.data[i + 2] = (1 / len) * 0.5 * 255 + 127;
          out.data[i + 3] = 255;
        }
      }
      nctx.putImageData(out, 0, 0);

      dispTex.needsUpdate = true;
      normTex.needsUpdate = true;
    };
    build();
    document.fonts?.ready.then(build); // rebuild once EB Garamond loads

    return { displacementMap: dispTex, normalMap: normTex };
  }

  const stamp = makeStampMaps();
  const text = makeTextMaps();
  const backEmblem = makeBackMaps();
  const BONE = 0xe8e5da; // cool bone — less cream, more clinical off-white

  // Front panel — paper tooth + letterpress-debossed printed text
  const frontMat = new THREE.MeshStandardMaterial({
    color: BONE,
    roughness: params.roughness,
    metalness: 0.0,
    envMapIntensity: 0.12, // faint, even sheen — the stock stays matte
    map: text.tex,
    normalMap: text.normalMap,
    normalScale: new THREE.Vector2(1.0, 1.0),
    displacementMap: stamp.displacementMap,
    displacementScale: params.grain,
  });
  const front = new THREE.Mesh(new THREE.PlaneGeometry(W, H, SEG_X, SEG_Y), frontMat);

  // Back panel — same stock, no ink, carrying the blind-embossed maker's seal.
  // Flipped 180° to face outward (-z); the emblem art is pre-mirrored to suit.
  const backMat = new THREE.MeshStandardMaterial({
    color: BONE,
    roughness: params.roughness,
    metalness: 0.0,
    envMapIntensity: 0.12,
    normalMap: backEmblem.normalMap,
    normalScale: new THREE.Vector2(0.85, 0.85),
    displacementMap: backEmblem.displacementMap,
    displacementScale: params.grain,
  });
  const back = new THREE.Mesh(new THREE.PlaneGeometry(W, H, SEG_X, SEG_Y), backMat);
  back.rotation.y = Math.PI;

  // Body — flat slab giving the clean edges between the two panels. Its faces
  // are hidden behind the bone panels, so only the thin side band shows: a gilt
  // painted edge (antique gold, brushed not mirror) that catches a single line
  // of light as the card tilts — the one warm accent on an otherwise cool card.
  const bodyMat = new THREE.MeshStandardMaterial({
    color: 0xb59a63,
    roughness: 0.42,
    metalness: 0.92,
    envMapIntensity: 0.9,
  });
  let body = new THREE.Mesh(new THREE.BoxGeometry(W, H, params.thickness), bodyMat);

  // Invisible flat plane for cheap click/hover ray hit-testing (the real front
  // panel has ~470k triangles, far too heavy to raycast every pointer move).
  const hitPlane = new THREE.Mesh(
    new THREE.PlaneGeometry(W, H),
    new THREE.MeshBasicMaterial({ visible: false }),
  );

  // Panels sit just outside the body faces so their flat margins are flush.
  const placePanels = (thickness: number) => {
    front.position.z = thickness / 2 + 0.0005;
    back.position.z = -thickness / 2 - 0.0005;
    hitPlane.position.z = thickness / 2 + 0.001;
  };
  placePanels(params.thickness);

  const card = new THREE.Group();
  card.add(body, front, back, hitPlane);
  scene.add(card);
  let lastThick = params.thickness;

  // ---- Interaction state -------------------------------------------------
  const X_AXIS = new THREE.Vector3(1, 0, 0);
  const Y_AXIS = new THREE.Vector3(0, 1, 0);

  let velX = 0;          // pitch velocity (around world X)
  let velY = 0;          // yaw velocity (around world Y)

  let dragging = false;
  let lastX = 0;
  let lastY = 0;
  let lastActivity = performance.now();

  const keys = new Set<string>();

  // ---- Entrance ----------------------------------------------------------
  // One quiet, confident reveal: the card fades up from a slight three-quarter
  // angle and a hair further away, then eases to rest face-on. No overshoot,
  // no bounce — suave, the understatement of the scene. A pointer grab cancels
  // it so the card is always immediately responsive.
  const INTRO_MS = 1500;
  // Stamped on the first *rendered* frame, not now — the one-time geometry and
  // texture build below is heavy and synchronous, and we don't want that cost
  // to eat into (or skip) the reveal. Set lazily in the loop.
  let introStart = 0;
  const introFromZ = params.camDist + 1.0;
  const introFromQuat = new THREE.Quaternion().setFromEuler(new THREE.Euler(0.16, -0.52, 0));
  const introToQuat = new THREE.Quaternion(); // identity → face-on at rest
  let intro = true;
  const easeOutQuint = (t: number) => 1 - Math.pow(1 - t, 5);
  const endIntro = () => {
    if (!intro) return;
    intro = false;
    canvas.style.opacity = '1';
    camera.position.z = params.camDist;
  };

  const clamp = (v: number) => Math.max(-params.maxVel, Math.min(params.maxVel, v));

  let downX = 0, downY = 0;

  // ---- Pointer (mouse + touch via Pointer Events) ------------------------
  canvas.addEventListener('pointerdown', (e) => {
    endIntro();
    dragging = true;
    lastX = e.clientX;
    lastY = e.clientY;
    downX = e.clientX;
    downY = e.clientY;
    lastActivity = performance.now();
    canvas.setPointerCapture(e.pointerId);
  });

  canvas.addEventListener('pointermove', (e) => {
    if (!dragging) return;
    const dx = e.clientX - lastX;
    const dy = e.clientY - lastY;
    lastX = e.clientX;
    lastY = e.clientY;
    velY = clamp(dx * params.dragSens);
    velX = clamp(dy * params.dragSens);
    lastActivity = performance.now();
  });

  const endDrag = (e: PointerEvent) => {
    dragging = false;
    if (canvas.hasPointerCapture(e.pointerId)) canvas.releasePointerCapture(e.pointerId);
  };
  canvas.addEventListener('pointerup', endDrag);
  canvas.addEventListener('pointercancel', endDrag);

  // ---- Clickable links (raycast the front face) --------------------------
  const raycaster = new THREE.Raycaster();
  const ndc = new THREE.Vector2();

  function linkAt(clientX: number, clientY: number): string | null {
    const rect = canvas.getBoundingClientRect();
    ndc.x = ((clientX - rect.left) / rect.width) * 2 - 1;
    ndc.y = -((clientY - rect.top) / rect.height) * 2 + 1;
    raycaster.setFromCamera(ndc, camera);
    const hit = raycaster.intersectObject(hitPlane, false)[0];
    if (!hit || !hit.uv) return null;
    const { x, y } = hit.uv;
    for (const b of text.boxes) {
      if (b.url && x >= b.x0 && x <= b.x1 && y >= b.y0 && y <= b.y1) return b.url;
    }
    return null;
  }

  // a near-stationary press is a click, not a drag → follow the link under it.
  // Internal routes (starting with "/") navigate in place; external links and
  // mailto: open in a new tab.
  canvas.addEventListener('pointerup', (e) => {
    if (Math.hypot(e.clientX - downX, e.clientY - downY) > 6) return;
    const url = linkAt(e.clientX, e.clientY);
    if (!url) return;
    if (url.startsWith('/')) window.location.href = url;
    else window.open(url, '_blank', 'noopener');
  });

  // pointer cursor when hovering a link
  canvas.addEventListener('pointermove', (e) => {
    if (dragging) return;
    canvas.style.cursor = linkAt(e.clientX, e.clientY) ? 'pointer' : 'grab';
  });

  // ---- Keyboard ----------------------------------------------------------
  const tracked = new Set([
    'w', 'a', 's', 'd',
    'arrowup', 'arrowdown', 'arrowleft', 'arrowright',
  ]);
  window.addEventListener('keydown', (e) => {
    const k = e.key.toLowerCase();
    if (!tracked.has(k)) return;
    e.preventDefault();
    keys.add(k);
    lastActivity = performance.now();
  });
  window.addEventListener('keyup', (e) => keys.delete(e.key.toLowerCase()));

  function applyKeys() {
    if (keys.size === 0) return;
    if (keys.has('w') || keys.has('arrowup')) velX = clamp(velX - params.keyAccel);
    if (keys.has('s') || keys.has('arrowdown')) velX = clamp(velX + params.keyAccel);
    if (keys.has('a') || keys.has('arrowleft')) velY = clamp(velY - params.keyAccel);
    if (keys.has('d') || keys.has('arrowright')) velY = clamp(velY + params.keyAccel);
    lastActivity = performance.now();
  }

  // ---- Resize ------------------------------------------------------------
  window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
  });

  // ---- Animation loop ----------------------------------------------------
  function tick() {
    // Entrance: own the camera + pose until the card has settled, then hand
    // back to the normal interaction logic below.
    if (intro) {
      if (introStart === 0) introStart = performance.now();
      const t = Math.min(1, (performance.now() - introStart) / INTRO_MS);
      const e = easeOutQuint(t);
      camera.position.z = introFromZ + (params.camDist - introFromZ) * e;
      card.quaternion.slerpQuaternions(introFromQuat, introToQuat, e);
      canvas.style.opacity = String(Math.min(1, e * 1.2));
      lastActivity = performance.now(); // hold off idle drift until settled
      if (t >= 1) endIntro();
      renderer.render(scene, camera);
      requestAnimationFrame(tick);
      return;
    }

    // pick up any live param edits (from /admin)
    if (camera.position.z !== params.camDist) camera.position.z = params.camDist;
    if (frontMat.roughness !== params.roughness) {
      // bone panels only — the gilt edge keeps its own brushed roughness
      frontMat.roughness = params.roughness;
      backMat.roughness = params.roughness;
    }
    if (frontMat.displacementScale !== params.grain) {
      frontMat.displacementScale = params.grain;
      backMat.displacementScale = params.grain;
    }
    if (params.thickness !== lastThick) {
      const old = body.geometry;
      body.geometry = new THREE.BoxGeometry(W, H, params.thickness);
      old.dispose();
      placePanels(params.thickness);
      lastThick = params.thickness;
    }

    applyKeys();

    const active = dragging || keys.size > 0;
    const idle = !active && performance.now() - lastActivity > params.idleDelay;

    if (idle) {
      // ease toward a slow horizontal drift
      velY += (params.idleYaw - velY) * 0.02;
      velX *= 0.92;
    } else if (!active) {
      // coast with inertia after release
      velX *= params.damping;
      velY *= params.damping;
    }

    // keep within the (possibly just-lowered) speed cap
    velX = clamp(velX);
    velY = clamp(velY);

    card.rotateOnWorldAxis(X_AXIS, velX);
    card.rotateOnWorldAxis(Y_AXIS, velY);

    renderer.render(scene, camera);
    requestAnimationFrame(tick);
  }
  tick();

  return { params, card, camera };
}
