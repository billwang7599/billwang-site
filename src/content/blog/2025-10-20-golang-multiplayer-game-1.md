---
title: "GoLang Multiplayer Pong | Log: #1"
description: "Devlog for creating a GoLang terminal game using ECS architecture."
pubDate: 2025-10-20
tags: ["devlog"]
project: golang-pong
---

## Prelude
I started this solely to learn more about Go (Golang) and creating multiplayer games. The goal is to create [Pong](https://en.wikipedia.org/wiki/Pong).

## Architecture
I'm planning on using the ECS (entity-component-system) architecture. ECS is a popular software architecture for games, prioritizing composition over inheritance. In my opinion, this is the easiest way to create a modular system.

What does this mean? Rather than eliminating code repetition by having a complex family tree of objects (inheritance), we instead define each object by its components.

An **entity** can be thought of as any unit in the game. This could be a wall, monster, or the player. How entities differ and gain interactivity comes from *components*.

A **component** defines a behavior of an *entity*. For example, if we want to display an *entity* on screen, it should have a `Sprite` and `Position` component, telling us where to place the *entity* and what to display. If you want to move them, you might give them a `Moveable` component. For these behaviors to update, we use *systems*.

A `System` is typically defined by an interface requiring an `Update()` method. To display the object, we would want to create a `DisplaySystem` object. As stated before, we need a `Position` and a `Sprite` component for *entities* to be displayable. In `Update()`, we would get all *entities* with both `Position` and `Sprite`, and add them to the canvas.

## Current Progress
Currently, I have implemented all necessary code for a simple client-side game capable of asynchronous input polling (through goroutines), movement, and display (using [Tcellv2](https://pkg.go.dev/github.com/gdamore/tcell/v2)).

[Link to GitHub](https://github.com/billwang7599/BillGame)

### File Structure
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
│   └── systems
│       ├── input.go
│       ├── movement.go
│       └── render.go
├── Makefile
└── README.md
```

You may be wondering what's inside `ecs/`. These are "manager" objects that provide the infrastructure for handling *entities*, *components*, and *systems*. Essentially, they are data structures that organize and manage the different entities and components, offering methods to add, retrieve, and update them.

## Future Plans
Implement the network system/infrastructure to handle UDP packets between a game client and the game server.

Future network flow:
1. User runs game client, gets a random user ID.
2. Connect to a server by entering an IP address and port.
3. Logs into the server. Able to play if both players click "Play".
