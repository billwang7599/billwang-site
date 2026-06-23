---
title: "GoLang Multiplayer Pong | Log: #3"
description: "Devlog #3 — separating network logic from the system layer."
pubDate: 2025-10-30
tags: ["devlog", "wip"]
project: golang-pong
---

TCP Network Client to handle initial connection and game state, this way client will know which entity is theirs to control.

TCP Network Client can also return the UDP port to connect to.

Seperate UDP logic from systems to network. Systems will now just handle the queue of packets.
