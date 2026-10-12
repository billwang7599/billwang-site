/**
 * A few ASCII critters that live along the bottom edge of the viewport and
 * play with each other: they wander, nap, and play tag — a chaser that catches
 * someone sends them running and becomes "it" no more.
 *
 * Purely decorative. The host element is aria-hidden and pointer-events: none;
 * the caller skips mounting under prefers-reduced-motion.
 */

type State = 'idle' | 'walk' | 'nap' | 'chase' | 'flee';

interface Critter {
  el: HTMLSpanElement;
  body: HTMLSpanElement;
  bubble: HTMLSpanElement;
  face: string;
  width: number;
  x: number;
  state: State;
  timer: number; // seconds left in the current state
  tx: number; // walk target
  other: Critter | null; // chase / flee partner
  hop: number; // seconds left in a hop
  bubbleTimer: number;
  phase: number; // walk-bob phase
}

const FACES = ['(o.o)', '=^.^=', '(^_^)', "('v')", '(•_•)'];
const NAP_FACE = '(-.-)';
const SPOOKED_FACE = '(O.O)';

const WALK_SPEED = 28; // px/s
const RUN_SPEED = 70;
const HOP_TIME = 0.35;
const HOP_HEIGHT = 7;

const rand = (lo: number, hi: number) => lo + Math.random() * (hi - lo);
const pick = <T>(xs: T[]) => xs[Math.floor(Math.random() * xs.length)];

export function mountCritters(host: HTMLElement) {
  const count = window.innerWidth < 600 ? 3 : 5;
  const faces = [...FACES].sort(() => Math.random() - 0.5).slice(0, count);
  let W = host.clientWidth;

  const critters: Critter[] = faces.map((face) => {
    const el = document.createElement('span');
    el.className = 'critter';
    const bubble = document.createElement('span');
    bubble.className = 'bubble';
    const body = document.createElement('span');
    body.textContent = face;
    el.append(bubble, body);
    host.append(el);
    return {
      el,
      body,
      bubble,
      face,
      width: 0,
      x: 0,
      state: 'idle',
      timer: rand(0.5, 3),
      tx: 0,
      other: null,
      hop: 0,
      bubbleTimer: 0,
      phase: Math.random() * 10,
    };
  });
  for (const c of critters) {
    c.width = c.el.offsetWidth;
    c.x = rand(0, Math.max(0, W - c.width));
  }

  const maxX = (c: Critter) => Math.max(0, W - c.width);

  const say = (c: Critter, text: string, secs = 1.2) => {
    c.bubble.textContent = text;
    c.bubble.classList.add('on');
    c.bubbleTimer = secs;
  };

  const setFace = (c: Critter, face: string) => {
    if (c.body.textContent !== face) c.body.textContent = face;
  };

  const enter = (c: Critter, state: State, other: Critter | null = null) => {
    c.state = state;
    c.other = other;
    setFace(c, state === 'nap' ? NAP_FACE : state === 'flee' ? SPOOKED_FACE : c.face);
    switch (state) {
      case 'idle':
        c.timer = rand(1.5, 4);
        break;
      case 'walk':
        c.tx = rand(0, maxX(c));
        c.timer = 12; // safety cap; normally ends on arrival
        break;
      case 'nap':
        c.timer = rand(5, 10);
        say(c, 'z', c.timer);
        break;
      case 'chase':
        c.timer = rand(4, 7); // gives up if it can't catch them
        break;
      case 'flee':
        c.timer = rand(1.2, 2);
        c.hop = HOP_TIME;
        say(c, '!');
        break;
    }
  };

  // What to do once the current state runs out.
  const next = (c: Critter) => {
    const r = Math.random();
    const awake = critters.filter((o) => o !== c && o.state !== 'nap');
    if (r < 0.2 && awake.length) {
      const target = pick(awake);
      enter(c, 'chase', target);
    } else if (r < 0.3) {
      enter(c, 'nap');
    } else if (r < 0.7) {
      enter(c, 'walk');
    } else {
      enter(c, 'idle');
    }
  };

  const move = (c: Critter, toward: number, speed: number, dt: number) => {
    const d = toward - c.x;
    if (Math.abs(d) < 1) return true;
    c.x += Math.sign(d) * Math.min(Math.abs(d), speed * dt);
    c.phase += dt * speed * 0.35;
    return false;
  };

  const update = (c: Critter, dt: number) => {
    c.timer -= dt;
    let moving = false;

    switch (c.state) {
      case 'walk':
        moving = !move(c, c.tx, WALK_SPEED, dt);
        if (!moving) c.timer = 0;
        break;
      case 'chase': {
        const o = c.other!;
        moving = true;
        move(c, o.x, RUN_SPEED * 0.9, dt);
        if (Math.abs(o.x - c.x) < (c.width + o.width) / 2) {
          // Tag! A napper just wakes up confused; anyone else bolts.
          c.hop = HOP_TIME;
          if (o.state === 'nap') {
            enter(o, 'idle');
            say(o, '?');
            say(c, '♥');
          } else {
            say(c, 'tag!');
            enter(o, 'flee', c);
          }
          enter(c, 'idle');
        }
        break;
      }
      case 'flee': {
        const o = c.other!;
        const away = c.x >= o.x ? maxX(c) : 0;
        moving = !move(c, away, RUN_SPEED, dt);
        break;
      }
    }

    if (c.timer <= 0) next(c);

    // Someone is coming for you: notice them once they're close.
    if (c.state === 'idle' || c.state === 'walk') {
      const chaser = critters.find((o) => o.state === 'chase' && o.other === c);
      if (chaser && Math.abs(chaser.x - c.x) < 80 && Math.random() < dt * 2) {
        enter(c, 'flee', chaser);
      }
    }

    c.x = Math.min(Math.max(c.x, 0), maxX(c));

    let y = 0;
    if (c.hop > 0) {
      c.hop = Math.max(0, c.hop - dt);
      y = -Math.sin((1 - c.hop / HOP_TIME) * Math.PI) * HOP_HEIGHT;
    } else if (moving) {
      y = -Math.abs(Math.sin(c.phase)) * 1.5;
    }

    if (c.bubbleTimer > 0) {
      c.bubbleTimer -= dt;
      if (c.bubbleTimer <= 0) c.bubble.classList.remove('on');
    }

    c.el.style.transform = `translate3d(${c.x.toFixed(1)}px, ${y.toFixed(1)}px, 0)`;
  };

  let last = performance.now();
  const frame = (now: number) => {
    // Clamp so a backgrounded tab doesn't teleport everyone on return.
    const dt = Math.min((now - last) / 1000, 0.05);
    last = now;
    for (const c of critters) update(c, dt);
    requestAnimationFrame(frame);
  };
  requestAnimationFrame(frame);

  window.addEventListener('resize', () => {
    W = host.clientWidth;
  });
}
