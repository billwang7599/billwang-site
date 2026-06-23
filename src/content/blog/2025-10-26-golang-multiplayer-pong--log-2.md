---
title: "GoLang Multiplayer Pong | Log: #2"
description: "Short update pre-midterms. Issue with network architecture."
pubDate: 2025-10-26
tags: ["devlog"]
project: golang-pong
---

## Short Update
Quick update as I’m busy studying for midterms. I’ve been working through how to design the network system. Initially, I considered putting it in the `cmd/` directory (see below), but realized that would be too isolated and not very logical.

Instead, I’m now implementing both a `NetworkSendSystem` and a `NetworkReceiveSystem` for the client and server. This approach makes sense: the client sends user inputs, the server sends updated states, the client receives updated states, and the server receives client inputs.

What do we actually send? Packets—of different types for different purposes (e.g., `PlayerInputPacket` and `PlayerStatePacket`). To ensure our `NetworkReceiveSystem` can deserialize packets correctly, each packet struct will start with a `PacketType` field of type `uint8` (1 byte in size). When a packet is received, we’ll read the first byte to determine its type, then deserialize accordingly.

One last issue: how do we know where to send packets? Since we’re using UDP, there’s no persistent connection, so we need a “phonebook.” My plan is to create a mapping of network IP to entity. For clients, we’ll initially fill this phonebook with the server’s IP and a placeholder integer for the entity. This phonebook can live in `world.go` so both network systems can access it. If we receive a packet from a new IP, we’ll add it to the phonebook.

### Future Considerations
I’m not entirely satisfied with the current network connection setup, but it’s good enough for a prototype. In the future, I’d like players to be able to create servers on the fly (e.g., for private games). This should be easier to implement since the server logic is fairly isolated. Maybe I’ll use a Docker image to spin up a new server for each player who wants one. Realistically, I doubt many people will play, but it’s fun to build for scale. Another idea is to use Kubernetes, but for now, that’s overkill.

## File Structure
```
├── bin
│   ├── client
│   └── server
├── cmd
│   ├── client
│   │   └── main.go
│   └── server
│       └── main.go
├── go.mod
├── go.sum
├── internal
│   ├── components
│   │   ├── controllable.go
│   │   ├── movement.go
│   │   ├── position.go
│   │   └── sprite.go
│   ├── ecs
│   │   ├── component.go
│   │   ├── entity.go
│   │   ├── system.go
│   │   └── world.go
│   │   └── packet.go -- new
│   └── systems
│       ├── input.go
│       ├── movement.go
│       └── render.go
│       └── network_receiver.go -- new
│       └── network_sender.go -- new
├── Makefile
└── README.md
```
