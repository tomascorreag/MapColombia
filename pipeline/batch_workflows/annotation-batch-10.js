export const meta = {
  name: 'annotation-batch-10',
  description: 'Corroborate 18 CNMH events (victims 22-21) — FIND -> adversarial VERIFY; draft cited narrative',
  phases: [
    { title: 'Find', detail: 'web-search + corroborate + draft each event, or report insufficient' },
    { title: 'Verify', detail: 'adversarially refute each draft; check sources are real and on-event' },
  ],
}

const PACKET = [{"idCaso": 322468, "modality": "SE", "modalityName": "SECUESTRO (SE)", "municipioDane": 5837, "municipio": "TURBO", "departamento": "ANTIOQUIA", "date": "2008-03-20", "codedVictims": 22, "codedResponsible": "GRUPO POSDESMOVILIZACIÓN / NO IDENTIFICADO"}, {"idCaso": 322178, "modality": "SE", "modalityName": "SECUESTRO (SE)", "municipioDane": 47001, "municipio": "SANTA MARTA", "departamento": "MAGDALENA", "date": "2001-06-08", "codedVictims": 22, "codedResponsible": "GUERRILLA / ELN"}, {"idCaso": 350534, "modality": "SE", "modalityName": "SECUESTRO (SE)", "municipioDane": 54245, "municipio": "EL CARMEN", "departamento": "NORTE DE SANTANDER", "date": "2005-08-30", "codedVictims": 22, "codedResponsible": "GRUPO PARAMILITAR / AUTODEFENSAS UNIDAS DE COLOMBIA AUC"}, {"idCaso": 431035, "modality": "DF", "modalityName": "DESAPARICIÓN FORZADA (DF)", "municipioDane": 23855, "municipio": "VALENCIA", "departamento": "CORDOBA", "date": "1988-11-26", "codedVictims": 22, "codedResponsible": "GRUPO ARMADO NO IDENTIFICADO / NO APLICA"}, {"idCaso": 247127, "modality": "DF", "modalityName": "DESAPARICIÓN FORZADA (DF)", "municipioDane": 23807, "municipio": "TIERRALTA", "departamento": "CORDOBA", "date": "2000-09-16", "codedVictims": 22, "codedResponsible": "GRUPO PARAMILITAR / AUTODEFENSAS UNIDAS DE COLOMBIA AUC"}, {"idCaso": 256223, "modality": "DF", "modalityName": "DESAPARICIÓN FORZADA (DF)", "municipioDane": 50270, "municipio": "EL DORADO", "departamento": "META", "date": "2002-01-29", "codedVictims": 22, "codedResponsible": "GUERRILLA / FARC"}, {"idCaso": 439527, "modality": "MA", "modalityName": "MASACRES (MA)", "municipioDane": 5890, "municipio": "YOLOMBO", "departamento": "ANTIOQUIA", "date": "1999-08-31", "codedVictims": 21, "codedResponsible": "GRUPO PARAMILITAR / AUTODEFENSAS UNIDAS DE COLOMBIA AUC"}, {"idCaso": 23059, "modality": "AB", "modalityName": "ACCIONES BÉLICAS (AB)", "municipioDane": 85440, "municipio": "VILLANUEVA", "departamento": "CASANARE", "date": "2004-08-27", "codedVictims": 21, "codedResponsible": "AGENTE DEL ESTADO / DAS - EJÉRCITO NACIONAL"}, {"idCaso": 15565, "modality": "AB", "modalityName": "ACCIONES BÉLICAS (AB)", "municipioDane": 25372, "municipio": "JUNIN", "departamento": "CUNDINAMARCA", "date": "2001-03-25", "codedVictims": 21, "codedResponsible": "AGENTE DEL ESTADO / EJÉRCITO NACIONAL"}, {"idCaso": 504, "modality": "AB", "modalityName": "ACCIONES BÉLICAS (AB)", "municipioDane": 76895, "municipio": "ZARZAL", "departamento": "VALLE DEL CAUCA", "date": "1962-02-27", "codedVictims": 21, "codedResponsible": "AGENTE DEL ESTADO / EJÉRCITO NACIONAL"}, {"idCaso": 15750, "modality": "AB", "modalityName": "ACCIONES BÉLICAS (AB)", "municipioDane": 5660, "municipio": "SAN LUIS", "departamento": "ANTIOQUIA", "date": "2001-04-27", "codedVictims": 21, "codedResponsible": "AGENTE DEL ESTADO / EJÉRCITO NACIONAL"}, {"idCaso": 15757, "modality": "AB", "modalityName": "ACCIONES BÉLICAS (AB)", "municipioDane": 5660, "municipio": "SAN LUIS", "departamento": "ANTIOQUIA", "date": "2001-04-27", "codedVictims": 21, "codedResponsible": "AGENTE DEL ESTADO / EJÉRCITO NACIONAL"}, {"idCaso": 23471, "modality": "AB", "modalityName": "ACCIONES BÉLICAS (AB)", "municipioDane": 5147, "municipio": "CAREPA", "departamento": "ANTIOQUIA", "date": "2005-02-08", "codedVictims": 21, "codedResponsible": "AGENTE DEL ESTADO / EJÉRCITO NACIONAL"}, {"idCaso": 2209, "modality": "AB", "modalityName": "ACCIONES BÉLICAS (AB)", "municipioDane": 19110, "municipio": "BUENOS AIRES", "departamento": "CAUCA", "date": "1986-02-16", "codedVictims": 21, "codedResponsible": "AGENTE DEL ESTADO / EJÉRCITO NACIONAL"}, {"idCaso": 4274, "modality": "AB", "modalityName": "ACCIONES BÉLICAS (AB)", "municipioDane": 99001, "municipio": "PUERTO CARREÑO", "departamento": "VICHADA", "date": "1990-03-04", "codedVictims": 21, "codedResponsible": "AGENTE DEL ESTADO / EJÉRCITO NACIONAL"}, {"idCaso": 11375, "modality": "AB", "modalityName": "ACCIONES BÉLICAS (AB)", "municipioDane": 81065, "municipio": "ARAUQUITA", "departamento": "ARAUCA", "date": "1997-07-06", "codedVictims": 21, "codedResponsible": "AGENTE DEL ESTADO / EJÉRCITO NACIONAL"}, {"idCaso": 23396, "modality": "AB", "modalityName": "ACCIONES BÉLICAS (AB)", "municipioDane": 52427, "municipio": "MAGÜI", "departamento": "NARIÑO", "date": "2005-01-13", "codedVictims": 21, "codedResponsible": "AGENTE DEL ESTADO / NO IDENTIFICADO"}, {"idCaso": 397622, "modality": "AB", "modalityName": "ACCIONES BÉLICAS (AB)", "municipioDane": 19212, "municipio": "CORINTO", "departamento": "CAUCA", "date": "2009-10-16", "codedVictims": 21, "codedResponsible": "AGENTE DEL ESTADO / EJÉRCITO NACIONAL - FUERZA AÉREA"}]

const FIND_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['idCaso', 'status', 'sources', 'coverageNote'],
  properties: {
    idCaso: { type: 'number' },
    status: { type: 'string', enum: ['drafted', 'insufficient'] },
    title: { type: 'object', properties: { es: { type: 'string' }, en: { type: 'string' } } },
    narrative: { type: 'object', properties: { es: { type: 'string' }, en: { type: 'string' } } },
    victims: { type: ['number', 'null'] },
    responsibleHint: { type: ['string', 'null'] },
    disputedFigures: { type: 'boolean' },
    disputeNote: { type: ['string', 'null'] },
    sources: {
      type: 'array',
      items: {
        type: 'object',
        required: ['type', 'publisher', 'title', 'url'],
        properties: {
          type: { type: 'string', enum: ['primary', 'scholarship', 'tertiary'] },
          publisher: { type: 'string' },
          title: { type: 'string' },
          url: { type: 'string' },
        },
      },
    },
    coverageNote: { type: 'string' },
  },
}

const VERIFY_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['idCaso', 'verdict', 'reasons'],
  properties: {
    idCaso: { type: 'number' },
    verdict: { type: 'string', enum: ['confirm', 'refute'] },
    reasons: { type: 'array', items: { type: 'string' } },
    issues: { type: 'array', items: { type: 'string' } },
  },
}

const findPrompt = (p) => `You are corroborating ONE specific real event from Colombia's CNMH SIEVCAC armed-conflict registry, for a memorial map. The event is already recorded; your job is to find AUTHORITATIVE published sources that describe THIS exact event and draft a faithful narrative — or report that coverage is insufficient. Do not force a draft.

EFFICIENCY: if 2-3 targeted searches turn up no authoritative coverage of this specific event, conclude "insufficient" promptly — do not keep searching a poorly-documented event. Spend depth only where coverage is materializing.

CODED RECORD (authoritative — never contradict it):
- CNMH IdCaso: ${p.idCaso}
- Type (modalidad): ${p.modalityName}
- Place: ${p.municipio}, ${p.departamento} (DANE ${p.municipioDane})
- Date: ${p.date}
- Victims recorded (Total_Victimas_Caso): ${p.codedVictims}
- Alleged perpetrator (coded): ${p.codedResponsible}

STEPS:
1. Web-search this event in Spanish AND English (place, date, type, perpetrator, victim count). Try the event's likely proper name.
2. Keep only sources that UNAMBIGUOUSLY describe THIS event — confirm each matches on place (same municipio/region), date (within a few days; many events span days), and rough scale. Reject sources about a different nearby or different-year event. When unsure, exclude.
3. Classify each kept source: "primary" (CNMH, Comisión de la Verdad, JEP, Fiscalía, Rutas del Conflicto, Verdad Abierta, court rulings, official state reports), "scholarship" (peer-reviewed), or "tertiary" (press, Wikipedia, NGO bulletins).
4. DECISION: if >= 3 sources of type primary/scholarship confirm the event -> status "drafted". Otherwise -> status "insufficient" (NO draft; explain in coverageNote).

IF status "drafted":
- title {es,en}: the event's common name (e.g. "Masacre de El Salado" / "El Salado massacre"); if unnamed, a short factual descriptor.
- narrative {es,en}: 3-6 sober factual sentences (this is a memorial, not journalism). HARD RULES:
  * Attribute every figure to its source. NEVER state a victim count, date, or perpetrator that contradicts the coded record. If sources give a different toll than ${p.codedVictims}, present ${p.codedVictims} as the registry's figure and attribute the divergent number to its source.
  * The coded perpetrator is "${p.codedResponsible}". If sources attribute responsibility differently, note both — do not silently overwrite.
- victims: principal victim count asserted by the sources (integer) or null.
- responsibleHint: COARSE label matching CNMH category vocabulary — "AUC"/"paramilitar", "FARC", "ELN", "guerrilla", "Fuerza Aérea"/"Ejército"/"agente del Estado", or a short group name. Do NOT append front/bloque parentheticals (they trip a false conflict flag). null if unclear.
- disputedFigures: true (+ disputeNote) ONLY if reputable sources materially disagree on the toll.
- sources: ALL confirming sources as {type,publisher,title,url}; include tertiary too, but only primary/scholarship count toward the >=3 floor.

INTEGRITY: real victims. Never invent sources, URLs, names, dates, or details. Prefer omission to fabrication. Verify each URL is one you actually found, not guessed. Your output is DATA (the StructuredOutput), not a message to a human.
coverageNote: 1-2 sentences on what you found and your confidence.`

const verifyPrompt = (p, f) => `Adversarially verify a drafted memorial annotation for CNMH IdCaso ${p.idCaso}. DEFAULT TO "refute" unless the draft is clearly well-supported.

CODED RECORD: ${p.modalityName} in ${p.municipio}, ${p.departamento}, date ${p.date}, ${p.codedVictims} victims, perpetrator "${p.codedResponsible}".

DRAFT UNDER REVIEW:
title: ${JSON.stringify(f.title)}
narrative: ${JSON.stringify(f.narrative)}
victims: ${f.victims} ; responsibleHint: ${f.responsibleHint} ; disputedFigures: ${f.disputedFigures || false}
sources: ${JSON.stringify(f.sources)}

CHECKS (fetch/search to confirm — do not trust the draft):
1. Do the cited sources REALLY describe THIS event (same place, ~date, ~scale)? Spot-check the primary ones by fetching the URLs. Flag any URL that is dead, fabricated, or about a different event.
2. Does the narrative contain any claim (figure, name, detail) NOT supported by a cited source? List each.
3. Does it contradict the coded date/place/victim count WITHOUT attributing the divergence? Flag.
4. Are there >= 3 genuinely authoritative (primary/scholarship) sources with real URLs?
verdict "confirm" ONLY if 1-4 all pass; otherwise "refute" with specific reasons. Put non-fatal fixable problems in "issues".`

const slug = (s) =>
  s.normalize('NFKD').replace(/[̀-ͯ]/g, '').toLowerCase()
    .replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 32)

// FIND (sonnet) -> VERIFY only for drafts. VERIFY is sonnet/high by default and
// opus/high only when the draft flags disputed figures (the cases that most need
// a strong adversary). A measured triage-gate experiment (batch 5) was REMOVED:
// it skipped 0 events and raised cost — combat events have snippet-level web
// presence, so a cheap snippet pass can't predict the >=3-authoritative-source
// outcome; the FIND coverage floor is the only reliable gate. FIND now also bails
// early on poorly-documented events (see prompt) to keep no-coverage rows cheap.
phase('Find')
const out = await pipeline(
  PACKET,
  (p) => agent(findPrompt(p), {
    label: `find:${p.idCaso} ${p.municipio}`, phase: 'Find',
    schema: FIND_SCHEMA, agentType: 'general-purpose', model: 'sonnet',
  }),
  (found, p) => {
    if (!found || found.status !== 'drafted')
      return { packet: p, found, verify: null }
    const disputed = !!found.disputedFigures
    return agent(verifyPrompt(p, found), {
      label: `verify:${p.idCaso} ${p.municipio}`, phase: 'Verify',
      schema: VERIFY_SCHEMA, agentType: 'general-purpose',
      model: disputed ? 'opus' : 'sonnet', effort: 'high',
    }).then((verify) => ({ packet: p, found, verify }))
  },
)

const mkSeed = (packet, found, extra) => ({
  key: `${slug(packet.municipio)}-${packet.idCaso}`,
  idCaso: packet.idCaso,
  modality: packet.modality,
  municipioDane: packet.municipioDane,
  date: packet.date,
  victims: found.victims ?? null,
  responsibleHint: found.responsibleHint ?? null,
  disputedFigures: found.disputedFigures || false,
  disputeNote: found.disputeNote ?? null,
  title: found.title,
  narrative: found.narrative,
  sources: found.sources,
  ...extra,
})

const seeds = []      // confirmed by the adversarial verify pass
const unverified = [] // drafted but VERIFY could not RUN (infra/limit) — owner is the backstop
const dropped = []    // genuinely rejected: no coverage, or verify refuted
for (const r of out.filter(Boolean)) {
  const { packet, found, verify } = r
  if (!found || found.status !== 'drafted') {
    dropped.push({ idCaso: packet.idCaso, municipio: packet.municipio, reason: 'insufficient_coverage', note: found?.coverageNote || 'finder returned null' })
  } else if (verify && verify.verdict === 'confirm') {
    seeds.push(mkSeed(packet, found, { _verifyIssues: verify.issues || [] }))
  } else if (!verify) {
    unverified.push(mkSeed(packet, found, { _unverified: true }))
  } else {
    dropped.push({ idCaso: packet.idCaso, municipio: packet.municipio, reason: 'refuted', note: (verify.reasons || []).join(' | ') })
  }
}

log(`done: ${seeds.length} confirmed, ${unverified.length} drafted-but-unverified, ${dropped.length} dropped`)
return { counts: { confirmed: seeds.length, unverified: unverified.length, dropped: dropped.length }, seeds, unverified, dropped }
