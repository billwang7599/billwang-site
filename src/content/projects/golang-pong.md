---
title: "Multiplayer Pong"
description: "A networked multiplayer Pong for the terminal, written in Go on an ECS architecture — built in the open, one devlog at a time."
year: "2025"
order: 80
tech: ["Go", "ECS", "Netcode"]
repo: "https://github.com/billwang7599"
draft: false
---

A multiplayer take on Pong for the terminal, written in Go on an entity-component-system
architecture: two players, one ball, and all the timing problems that come with
putting a game over the wire.

I built it in the open and kept a running devlog as it came together — from the
first playable version through separating the network layer out of the systems.
The full series is below.
