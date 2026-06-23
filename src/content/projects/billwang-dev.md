---
title: "billwang.dev"
description: "A rotatable 3D business card rendered with Three.js — letterpress relief, real paper grain, and a vitrine to sit it in."
year: "2026"
order: 100
featured: true
tech: ["Three.js", "Astro", "TypeScript", "Cloudflare Workers"]
link: "/"
repo: "https://github.com/billwang7599"
draft: false
---

The landing page is a single object: a business card you can pick up and turn
over. No hero text, no nav — just the card, spotlit in a cool gallery-grey
vitrine, waiting to be dragged.

## The idea

Most portfolio landing pages open with a wall of words. I wanted the opposite:
one tactile object that *is* the introduction. Turn it over and the contact
details are there — email, LinkedIn, GitHub — pressed into the stock like real
letterpress.

## How it's built

The card is a thin extruded mesh in [Three.js](https://threejs.org). The face
artwork is rendered to a texture and applied as a slight displacement so the
type catches the light like an actual deboss — the `grain` parameter controls
how deep the stamp sits.

Motion is the whole point, so the interaction model got the most attention:

- **Drag to turn.** Pointer movement maps to angular velocity with inertia, so
  the card keeps spinning a little after you let go and eases to rest.
- **Idle drift.** After a few seconds of stillness it picks up a slow yaw, so a
  static page never feels dead.
- **Reduced-motion aware.** The entrance reveal and idle drift back off when the
  visitor prefers reduced motion.

Every feel value — drag sensitivity, damping, max velocity, idle delay, surface
roughness, camera distance — is a live parameter. There's a hidden `/admin`
tuning panel with sliders for each; you dial in a feel, hit *Copy params*, and
paste the result back in as the new defaults. Tuning by feel beats guessing
numbers in source.

## Making it real for crawlers

A `<canvas>` is invisible to search engines, ATS parsers, and screen readers, so
the page carries a visually-hidden `<article>` with the same words the card
shows — the name, the role, and every contact link. The pixels are for people;
the markup is for everything else.

## Shipping it

The whole site is [Astro](https://astro.build) building to static HTML, served
straight off Cloudflare Workers as static assets — no server, no runtime, no
adapter. The card is the only heavy thing on the page, and it only loads on the
route that needs it.
