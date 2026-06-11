# Concept — A Memory of Violence

*Memoria de la violencia · Cartographic archive, Colombia 1958–present*

This document describes the violence/memory side of the artifact: what it is, why it exists, and the reasoning behind its visual language. (The elections layer is a separate concern and is not covered here.)

## What it is

An interactive, browser-based map of Colombia that renders the documented violence of the armed conflict — as recorded by the Centro Nacional de Memoria Histórica (CNMH/SIEVCAC) — as **wounds on the territory that heal into permanent scars**.

Time is the central dimension. As the timeline plays from 1958 to the present:

- Each documented event appears **on its exact date** as a wound at the place it occurred. Its visual extent is proportional to the number of victims; nothing is sized by interpretation or emphasis.
- The wound flares while fresh, then fades over roughly three years — and leaves a **permanent scar** that never disappears. By the end of playback the map is not empty: it is covered in the accumulated marks of seven decades.
- Blood-like tendrils spread from each wound across the surrounding territory, their density tracking victim counts. They follow the same lifecycle: bright while fresh, then settling into thin, dark, permanent traces.
- Events whose exact date is unknown in the source never flare — they cannot honestly be placed on a day — but their scars appear once their known year closes. Cases with no known year at all are excluded from the timeline and counted openly in an on-screen exclusion record.
- Clicking a scar opens the documented record behind it: modality, date, place, and a demographic portrait of the victims, with the source citation. The source contains no names or narratives, so the artifact shows exactly what is documented and nothing more.

The wound/scar metaphor is the thesis of the piece: violence is not a sequence of isolated incidents but an injury to territory and population whose marks persist. A massacre in 1997 is still visible in 2026 — on the map because it is still present in the country.

Everything beyond position, date, and victim count — the spreading, the fading, the scarring — is explicitly **visual interpretation of where and when violence occurred**, not data. No coordinate, date, or victim count is ever estimated, interpolated, or fabricated.

## Why I made it

**Rutas del Conflicto** (rutasdelconflicto.com) is the direct inspiration, and this project builds very much on their design. Their work — a navigable, place-by-place archive of the conflict's massacres — showed me that memory work could take the form of a map rather than a linear narrative, and they do it very well. This map is my own stab at the same idea: keeping their core gesture of geography as the way into the conflict, while experimenting with a more visceral visual register — animation, accumulation, the wound-and-scar metaphor — to see whether the territory's marking can be *felt* as well as consulted. It is an homage and an experiment on top of their idea, not a correction of it.

There is also something their work has that this one still lacks: **the human, narrative dimension**. Rutas del Conflicto pairs its map with reported, written accounts of individual events — what happened, to whom, told as a story. This artifact currently stops at the documented record (the SIEVCAC source carries no names or narratives, only the case data), so an event here is a portrait in numbers where theirs is a portrait in words. Closing that gap — bringing narrative accounts of events into the map in future versions — is the clearest direction for improvement.

The conflict's toll is usually communicated as aggregate numbers, and aggregates anesthetize. My hypothesis is that a spatial-temporal rendering can do what a table cannot: convey that the violence had a *shape* — that it concentrated in specific regions, moved across the country in waves, and left wounds that are both spatial (these municipalities, this corridor) and temporal (this decade, and still visible decades later). The goal is not analysis first; it is that a viewer pressing play experiences something of the scale and persistence of what happened.

The second motivation is the **CNMH itself**. I admire its work: the patient, rigorous, case-by-case documentation of the conflict in SIEVCAC is one of the most important memory undertakings in the country, and it deserves to be seen by more than researchers who can parse a CSV. Building interactive data visualization is what I'm good at; this project is an attempt to put that skill at the service of their documentation — to build a public, bilingual window onto an archive that already exists, rather than a new claim about the conflict.

## Commitments

Because the archive records real victims, the design carries non-negotiable constraints, stated here as part of the concept rather than as implementation detail:

- **Fidelity over drama.** Every mark on the map corresponds to a documented case with a citation back to its source record. Missing values stay missing and are disclosed; the artifact's emotional force must come from the truth of the data, not from embellishment of it.
- **Interpretation is labeled.** The wound metaphor is an authored reading and the interface says so. The viewer can always reach the underlying record.
- **Dignity.** The archive is published for memory, research, and education. The aesthetic aims for gravity — a dark cartographic register, not spectacle.

## Status of this document

This is the concept statement, not the technical record. Data provenance and audit live in `docs/data-sources.md`; the rendering architecture and its constraints live in `docs/stack-decision.md`.
