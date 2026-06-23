---
title: "Homelab Updated - Hardware and Services"
description: "I love docker and containerization"
pubDate: 2026-01-04
tags: ["homelab", "network", "devlog"]
---

## Hardware Updates
Motherboard: Gigabyte B760M Gaming + Wifi DDR4 \
OS: Proxmox 9.1 (Kernel 6.17.4) \
GPU: GTX 1060 6GB \
CPU: i5 13500 \
RAM: 48GB DDR4

### GPU - Why use trash?
The GTX 1060 6GB is very outdated, being ~3-4x slower than my RTX 7700xt. So, why use it?

I'm trying to set up a cloud gaming VM and AMD cards infamously has a reset bug when trying to do GPU passthrough. This makes it so that when shutting down the VM, the GPU enters a corrupted state. When the host (in my case Proxmox) tries to start it again, it crashes and would need a power cycle.

I've tried multiple solutions (over two sleepless nights), from blacklisting the GPU, downloading custom ROMs, to setting up hook scripts to manually unbind and rebind the PCIe slot, nothing worked.

I ended up giving up and just switching over to my Nvidia GPU and it worked flawlessly (go team green).

Better to use something than nothing.

## Services
I currently use [Tailscale](https://tailscale.com/) to connect to my devices and allow my friends access to my network.

I have a Minecraft server running [Stoneblock 4](https://www.feed-the-beast.com/modpacks/stoneblock-4) for myself and my friends.

I have a [Portainer](https://www.portainer.io/) instance running too. Here, I have a [Jellyfin](https://jellyfin.org/) stack (movies and shows), a VPN stack (torrenting ;) & seeding), and a [Komga](https://komga.org/) stack (manga).

All 3 services mentioned are running on an LXC (Linux Container) for small overhead and ease of access to system resources.

For my VMs, I have another Linux machine for Portainer to act as a DMZ so I can eventually have NGINX to connect all my services. These services can either live in the same environment or be pinholed to ports to other services on the LAN.

I also have a Windows VM for the aforementioned cloud gaming setup. Uses [Sunshine](https://sunshine.stream/) and [Moonlight](https://moonlight-stream.org/) for the streaming client and server.


## Things I learned
### DMZ
DMZ (De-Militarized Zone) is a server isolated from the rest of the LAN (Local Area Network) which the internet has access to.

We use the DMZ to protect other machines you don't want compromised. If the DMZ is compromised, bad actors can't target other machines. That's also usually why you only store static/non-important files on the DMZ.

This poses the question, how do we expose important services like a NAS or media service?

Instead of directly opening a port to the internet, we create a pinhole from the DMZ to that service, usually through a reverse-proxy like NGINX.

This is safer because an open port handles any packets, which means if your service is compromised the attacker can gain root access and attack other machines.

If your DMZ gets attacked, they can still only send web packets to the service and are unable to get root access.

### Docker \& Containerization
I love docker and containers. It's so easy to spin up services and thread them together using virtual networks.
