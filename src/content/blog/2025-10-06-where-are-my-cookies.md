---
title: "Where are my cookies?"
description: "Exploring my stupid mistake using Next.js and Supabase auth."
pubDate: 2025-10-06
tags: ["blog"]
---

## Prelude
Working on an OA for [Magna Digital](https://www.magna.so/). Basically create an MVP for a new product.

My stack consists of Next.js, Prisma, and Supabase.

Since I'm using Supabase for my database, I also use it for authentication. It provides a nice [SDK](https://supabase.com/docs/guides/auth/server-side) with simple boilerplate code to follow. (If you're new to authentication, JWT, middleware, etc., I recommend [this guide](https://www.jwt.io/introduction#how-json-web-tokens-work)).

After setting up the boilerplate, I use the function:
```ts
const { error } = await supabase.auth.signOut()
```
for signing out. However, for some reason, I wanted to try something new. I placed it as a GET route under `/auth/logout`, which technically works the same as calling the function directly.

So my logout button was actually a link:
```tsx
<Link href="/auth/logout">
  Logout
</Link>
```

This link was placed in the dashboard.

## Issue
My login flow looked like this:

1. User visits the login page.
2. User enters their credentials.
3. User clicks the login button.
4. User is redirected to the dashboard.

However, I noticed I kept on getting logged out after immediately signing in. After debugging, I found out as soon as I get into the dashboard, my Supabase auth cookies get cleared.

When they're cleared, I immediately get redirected back to the login page. This infinite loop stumped me for a while.

I thought the issue was with my login flow so I tried debugging the middleware, but nothing was wrong there.

The login form and routes looked fine too.

This was also only happening in prod, not dev.

## Solution
If you know anything about Next.js, `<Link></Link>` is a component provided by the framework which enables [pre-fetching of the linked page](https://nextjs.org/docs/app/api-reference/components/link#prefetch). This means all pages referenced by `<Link></Link>` components will be fetched in advance, improving the user experience.

Why is this important? Since in production, Link components are pre-fetched, as soon as the user renders my logout link in the dashboard, they immediately get logged out.

Honestly I thought this was a pretty funny bug that took me way too long to figure out. I prompted AI so many times but it couldn't even find the problem after looking through my entire codebase.

I probably wouldn't have found it if I hadn't remembered the [documentation](https://nextjs.org/docs/app/api-reference/components/link#prefetch) I read.

The lesson here is don't blindly rely on AI for everything and continue to read documentation. Also don't make stupid dev decisions.

## Related Links
- [Project OA](https://magna.billwang.dev)
- [Project GitHub](https://github.com/billwang7599/magna-investments)
- [Supabase SSR SDK](https://supabase.com/docs/guides/auth/server-side)
- [JWT Guide](https://www.jwt.io/introduction#how-json-web-tokens-work)
- [Next.js link pre-fetching](https://nextjs.org/docs/app/api-reference/components/link#prefetch)
