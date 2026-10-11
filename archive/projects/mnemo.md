---
title: "Mnemo"
description: "file-less note taking app"
year: "2026"
order: 200
tech: ["Svelte","spaCy","SQLite","a bunch of Python libraries"]
link: "https://mnemo.billwang.dev"
---
a little vibe coded note app which abstracts away the responsibility of file management.

we have 2 main engines, one for retrieval and one for ingesting.

ingesting engine would index your notes on title, body, extracted entities, extracted dates, wiki-links, and file refs -- plus chunk and embed the raw text for semantic search. tags and objects come later, from a separate pass.

retrieval engine takes the user input and runs it through both keyword (BM25) and vector search in parallel, fuses the two rankings with RRF, then reranks the top hits with a cross-encoder for final relevance.

mostly abandoned for now to work on MemDB -- custom DB which does all of the above built ontop of rust. 