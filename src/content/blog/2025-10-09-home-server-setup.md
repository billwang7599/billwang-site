---
title: "Home Server Setup/Future Plans"
description: "My home server setup and future plans."
pubDate: 2025-10-09
tags: ["homelab", "networks", "devlog"]
---

## Prelude
I had an old PC lying around and wanted to repurpose it. Being a software engineer, and wanting to learn more about networks and systems, I decided to turn it into a home server.

## Current Setup
### Specifications
- OS: Proxmox
- CPU: 4 x Intel(R) Core(TM) i5-4460 CPU @ 3.20GHz (1 Socket)
- RAM: 16GB DDR3
- GPU: N/A
- Storage: 1TB SSD, 2x12TB HDD, 256GB HDD, 1TB HDD

### Summary
Why so many different storage types?

I bought the SSD for a more reliable storage solution. There lives the OS and the VMs. This way they're less likely to get corrupted (compared to HDD) and also faster spinups.

2x12TB I bought to handle my media files and backups.

256GB and 1TB HDDs were found in random old technology found in thrift stores. Influenced by posts found on TikTok/reels where people found hard drives for cheap, instead my experience turned out to be a net negative investement.

The HDDs are provisioned on a TrueNas VM, where 2x12TB are mirrored for redundancy, and the 256GB and 1TB HDDs are used for additional storage and backups.

Otherwise all of my self-hosted apps are ran on a Portainer VM, and my game servers on a Pteradactyl VM.

## Future Plans
### Specifications
- OS: Proxmox
- CPU: 14 x Intel(R) Core(TM) i5-13500 CPU @ 2.50GHz
- RAM: 32/64GB DDR4
- GPU: AMD Radeon(TM) RX 7700 XT GPU
- Storage: 1TB SSD, 4x12TB HDD

### Summary
By upgrading the CPU, I'll be able to run my Plex servers faster whilst hosting my game servers.

I'm throwing in my gaming GPU to see if I can run a gaming VM using Moonlight & Sunshine, kinda like NVIDIA's GeForce Now.

Getting more storage and setting them to 4x12TB mirror, I'll have 24TB of working storage. I'm thinking of removing the NAS and just using Proxmox to handle ZFS storage.

Self hosted apps I want:
- Nextcloud
- Plex
- Pterodactyl
- Wireguard
- Immitch

Some more dev-focused things to play around with:
- K8s instance
- Self hosted Supabase instance
- Custom Discord bots

## Connection
I used to use a Wireguard VPN to connect to my home network, but I also wanted to attach each service to a domain name.

So to kill two birds with one stone, I'm using Cloudflare's Zero Trust and tunneling service. This way I can expose my services to the internet, but still only allow myself to access them.

## Conclusion
Someone please sponsor me or donate some parts, I'm broke af.
