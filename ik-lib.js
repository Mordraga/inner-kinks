/**
 * Inner Kinks v2.0
 * Made by Mordraga
 * Generates and maintains kink profiles, heat meters, and relationship cards for NPCs.
 * Compatible with Inner Self and Auto-Cards; works standalone without either.
 */
function InnerKinks(hook) {
    "use strict";

    /**
     * Settings — modify these before publishing your scenario.
     * All settings can also be changed in-game via the "Configure Inner Kinks" story card.
     */
    const S = {
    // --- v1 ---
    // NPC first names to profile when IS and AC are not installed:
    CHARACTERS: ""
    // (comma-separated names: "Sarah, Leah, Lily")
    ,
    // Turns between kink profile generation/update events:
    COOLDOWN: 20
    ,
    // Is Inner Kinks active?
    ENABLED: true
    ,
    // Pin the "Configure Inner Kinks" card near the top of the cards list?
    IS_CONFIG_CARD_PINNED: false
    ,
    // --- Drift System ---
    // Detect consistent behavior patterns and update profiles reactively:
    DRIFT_ENABLED: true
    ,
    // Turns of consistent behavior before a drift event triggers:
    DRIFT_SENSITIVITY: 3
    ,
    // --- Libido Inertia ---
    // Per-NPC resistance to heat change based on randomized mass value:
    INERTIA_ENABLED: true
    ,
    INERTIA_MASS_MIN: 1
    ,
    INERTIA_MASS_MAX: 5
    ,
    // --- Intensity Scaling ---
    // Track NPC heat and adjust context injection emphasis by tier:
    INTENSITY_ENABLED: true
    ,
    // Inactive turns before heat decays one step:
    INTENSITY_DECAY: 5
    ,
    // --- Relationship Mapping ---
    // Track NPC↔NPC and player↔NPC dynamics and compatibility:
    RELATIONSHIP_ENABLED: true
    ,
    // --- Compatibility Scoring ---
    COMPAT_ENABLED: true
    ,
    // Apply compat penalty when player acts against an NPC's preferences:
    COMPAT_PENALTY_ENABLED: true
    ,
    // How much a single violation reduces compat (0.0–1.0):
    COMPAT_PENALTY_AMOUNT: 0.1
    ,
    // --- CNC Awareness ---
    // NPCs where refusal signals are consensual play (no violation penalty):
    CNC_CHARACTERS: ""
    // (comma-separated names)
    ,
    // --- Debug ---
    // Write live NPC state to kink card notes each turn:
    DEBUG_MODE: false
    // (true or false)
    ,
    };

    //—————————————————————————————————————————————————————————————————————

    if (
        !globalThis.state || (typeof state !== "object") || Array.isArray(state)
        || !globalThis.info  || (typeof info  !== "object") || Array.isArray(info)
        || !Array.isArray(globalThis.storyCards)
        || (typeof addStoryCard !== "function")
        || !Array.isArray(globalThis.history)
        || (typeof text !== "string")
    ) {
        return;
    }

    // Initialize persistent state
    state.InnerKinks ??= {};
    const IK = state.InnerKinks;
    IK.cooldown ??= 0;
    IK.index    ??= 0;
    IK.pending  ??= null;
    IK.driftTag ??= null;
    IK.chars    ??= {};

    // Declare config constants here so they are initialized before initConfigCard/applyConfigCard call them
    const CONFIG_TITLE = "Configure Inner Kinks";
    const CONFIG_DEFAULT = [
        "Inner Kinks v2.0 — by Mordraga",
        "enabled: true",
        "characters: ",
        "cooldown: 20",
        "drift: true",
        "inertia: true",
        "intensity: true",
        "relationships: true",
        "compat: true",
        "compat_penalty: true",
        "compat_penalty_amount: 0.1",
        "drift_sensitivity: 3",
        "intensity_decay: 5",
        "debug_mode: false",
    ].join("\n");
    const CONFIG_KEY_MAP = {
        enabled:               ["ENABLED",                "boolean"],
        characters:            ["CHARACTERS",             "string"],
        cooldown:              ["COOLDOWN",               "integer"],
        drift:                 ["DRIFT_ENABLED",          "boolean"],
        inertia:               ["INERTIA_ENABLED",        "boolean"],
        intensity:             ["INTENSITY_ENABLED",      "boolean"],
        relationships:         ["RELATIONSHIP_ENABLED",   "boolean"],
        compat:                ["COMPAT_ENABLED",         "boolean"],
        compat_penalty:        ["COMPAT_PENALTY_ENABLED", "boolean"],
        compat_penalty_amount: ["COMPAT_PENALTY_AMOUNT",  "float"],
        drift_sensitivity:     ["DRIFT_SENSITIVITY",      "integer"],
        intensity_decay:       ["INTENSITY_DECAY",        "integer"],
        debug_mode:            ["DEBUG_MODE",             "boolean"],
    };

    // Apply config card settings (read-only, safe on all hooks)
    applyConfigCard();

    if (!S.ENABLED) return;

    //—————————————————————————————————————————————————————————————————————
    // buildKeys — mirrors AC's key construction (library_AC.js)
    // Word-boundary-aware patterns so short names don't false-positive.
    //—————————————————————————————————————————————————————————————————————
    function buildKeys(keys, key) {
        key = key.trim().replace(/\s+/g, " ");
        const keyset = [];
        if (key === "") return keys;
        if (keys.trim() !== "") {
            keyset.push(...keys.split(","));
            const lowerKey = key.toLowerCase();
            for (let i = keyset.length - 1; 0 <= i; i--) {
                const preKey = keyset[i].trim().replace(/\s+/g, " ").toLowerCase();
                if ((preKey === "") || preKey.includes(lowerKey)) keyset.splice(i, 1);
            }
        }
        if (key.length < 6) {
            keyset.push(...[
                " " + key + " ", " " + key + "'", "\"" + key + " ",
                " " + key + ".", " " + key + "?", " " + key + "!",
                " " + key + ";", "'" + key + " ", "(" + key + " ",
                " " + key + ")", " " + key + ":", " " + key + "\"",
                "[" + key + " ", " " + key + "]", "—" + key + " ",
                " " + key + "—", "{" + key + " ", " " + key + "}",
            ]);
        } else if (key.length < 9) {
            keyset.push(...[
                key + " ", " " + key, key + "'", "\"" + key,
                key + ".", key + "?", key + "!", key + ";",
                "'" + key, "(" + key, key + ")", key + ":",
                key + "\"", "[" + key, key + "]", "—" + key,
                key + "—", "{" + key, key + "}",
            ]);
        } else {
            keyset.push(key);
        }
        keys = keyset[0] || key;
        let i = 1;
        while ((i < keyset.length) && ((keys.length + 1 + keyset[i].length) < 101)) {
            keys += "," + keyset[i++];
        }
        return keys;
    }

    //—————————————————————————————————————————————————————————————————————
    // Data constants
    //—————————————————————————————————————————————————————————————————————

    const BEHAVIOR_TAGS = {
        dominant_behavior: {
            keywords: ["took control", "commanded", "pinned", "ordered", "demanded", "held down", "grabbed"],
            regex: /\b(commanded?|ordered?|pinned?|dominat|took control|demanded?|held down)\b/i,
        },
        submissive_behavior: {
            keywords: ["obeyed", "yielded", "knelt", "submitted", "surrendered", "complied"],
            regex: /\b(obeyed?|yielded?|knelt|submitted?|surrendered?|complied?)\b/i,
        },
        pain_given: {
            keywords: ["struck", "bit ", "marked", "spanked", "slapped", "whipped"],
            regex: /\b(struck|bit\b|bitten|marked?|spanked?|slapped?|whipped?)\b/i,
        },
        pain_received: {
            keywords: ["winced", "cried out", "bruised", "ached", "gasped in pain"],
            regex: /\b(winced?|cried out|bruised?|ached?)\b/i,
        },
        exhibitionist_act: {
            keywords: ["watched", "exposed", "performed", "displayed", "revealed"],
            regex: /\b(watched?|exposed?|performed?|displayed?|revealed?)\b/i,
        },
        refusal: {
            keywords: ["refused", "pulled away", "said no", "pushed away", "stepped back"],
            regex: /\b(refused?|pulled away|said no|pushed away|stepped back)\b/i,
        },
    };

    const TAG_ARCHETYPE = {
        dominant_behavior:  "dominant",
        pain_given:         "dominant",
        submissive_behavior:"submissive",
        pain_received:      "submissive",
        exhibitionist_act:  "exhibitionist",
    };

    const DOM_ARCHETYPES = ["dominant", "sadist", "owner", "rigger", "degrader", "switch"];
    const SUB_ARCHETYPES = ["submissive", "masochist", "pet", "rope bunny", "degradee", "brat", "switch"];

    const VALID_ARCHETYPES = new Set([
        "dominant", "submissive", "switch", "brat", "masochist", "sadist",
        "pet", "owner", "rigger", "rope bunny", "voyeur", "exhibitionist",
        "experimentalist", "degrader", "degradee",
    ]);

    // Common aliases the AI uses instead of valid archetype names
    const ARCHETYPE_ALIASES = {
        "domme": "Dominant", "dom": "Dominant",
        "sub":   "Submissive",
        "bottom": "Submissive", "top": "Dominant",
        "pet owner": "Owner",
        "rope bunny": "Rope bunny",
    };

    const LIBIDO_MASS = { ace: [7, 10], demi: [4, 7], standard: [2, 4], high: [1, 2] };

    const INTIMATE_KEYWORDS = [
        "kissed", "caressed", "moaned", "gasped", "pressed against", "undressed",
        "naked", "aroused", "breathless", "skin against skin",
    ];
    const INTIMATE_REGEX = /\b(kiss(ed|ing)?|moan(ed|ing)?|caress(ed|ing)?|undress(ed|ing)?|entwined?)\b/i;

    //—————————————————————————————————————————————————————————————————————
    // Config card
    //—————————————————————————————————————————————————————————————————————

    function getConfigCard() {
        return storyCards.find(c =>
            typeof c.title === "string" && c.title === CONFIG_TITLE
        ) ?? null;
    }

    function initConfigCard() {
        if (getConfigCard()) return;
        addStoryCard(CONFIG_TITLE, CONFIG_DEFAULT, "class", CONFIG_TITLE, "");
        if (S.IS_CONFIG_CARD_PINNED) {
            const card = getConfigCard();
            if (card) {
                const idx = storyCards.indexOf(card);
                if (idx > 0) { storyCards.splice(idx, 1); storyCards.unshift(card); }
            }
        }
    }

    function applyConfigCard() {
        const card = getConfigCard();
        if (!card || typeof card.entry !== "string") return;
        for (const line of card.entry.split("\n")) {
            const colon = line.indexOf(":");
            if (colon === -1) continue;
            const k = line.slice(0, colon).trim().toLowerCase();
            const v = line.slice(colon + 1).trim();
            if (!CONFIG_KEY_MAP[k]) continue;
            const [prop, type] = CONFIG_KEY_MAP[k];
            if      (type === "boolean") S[prop] = (v === "true");
            else if (type === "string")  S[prop] = v;
            else if (type === "integer") { const n = parseInt(v, 10);  if (!isNaN(n)) S[prop] = n; }
            else if (type === "float")   { const n = parseFloat(v);    if (!isNaN(n)) S[prop] = n; }
        }
    }

    //—————————————————————————————————————————————————————————————————————
    // Card finders
    //—————————————————————————————————————————————————————————————————————

    function getBrainCard(name) {
        const lower = name.toLowerCase();
        return storyCards.find(card => {
            if (typeof card.keys !== "string" || !card.keys.includes('"agent"')) return false;
            try { return JSON.parse(card.keys)?.agent?.toLowerCase() === lower; }
            catch { return false; }
        }) ?? null;
    }

    function getACCard(name) {
        const prefix = "{title: " + name.toLowerCase() + "}";
        return storyCards.find(card =>
            typeof card.entry === "string"
            && card.entry.toLowerCase().startsWith(prefix)
        ) ?? null;
    }

    function getKinkCard(name) {
        const target = (name + " Kinks").toLowerCase();
        return storyCards.find(card =>
            typeof card.title === "string"
            && card.title.toLowerCase() === target
        ) ?? null;
    }

    function getRelCard(name1, name2) {
        const t1 = `${name1} ↔ ${name2} Relationship`.toLowerCase();
        const t2 = `${name2} ↔ ${name1} Relationship`.toLowerCase();
        return storyCards.find(card =>
            typeof card.title === "string"
            && (card.title.toLowerCase() === t1 || card.title.toLowerCase() === t2)
        ) ?? null;
    }

    //—————————————————————————————————————————————————————————————————————
    // KinkProfile — structured read / write for kink card entries
    //—————————————————————————————————————————————————————————————————————

    // Parse card.entry → { archetypes, kinks, triggers, dynamic } or null if invalid.
    // Accepts manually edited cards as long as the required fields are present and valid.
    function readKinkProfile(card) {
        if (!card || typeof card.entry !== "string") return null;

        const lines    = card.entry.split("\n").map(l => l.trim()).filter(Boolean);
        let archetypes = null;
        const kinks    = {};
        let triggers   = null;
        let limits     = null;
        let dynamic    = null;
        let libido     = null;

        for (const line of lines) {
            const colon = line.indexOf(":");
            if (colon === -1) continue;
            const key   = line.slice(0, colon).trim();
            const val   = line.slice(colon + 1).trim();
            if (!val) continue;
            const keyLo = key.toLowerCase();

            if (keyLo === "archetype") {
                archetypes = val.split(",").map(a => {
                    const t = a.trim();
                    return ARCHETYPE_ALIASES[t.toLowerCase()] ?? t;
                }).filter(Boolean);
            } else if (keyLo === "triggers") {
                // Strip surrounding quotes the AI sometimes adds around individual triggers
                triggers = val.split(",").map(t => t.trim().replace(/^["']+|["']+$/g, "").toLowerCase()).filter(Boolean);
            } else if (keyLo === "limits") {
                limits = val.split(",").map(t => t.trim().replace(/^["']+|["']+$/g, "").toLowerCase()).filter(Boolean);
            } else if (keyLo === "dynamic") {
                dynamic = val.trim().split(/\s+/).slice(0, 4).join(" ");
            } else if (keyLo === "libido") {
                if (LIBIDO_MASS[val.toLowerCase()]) libido = val.toLowerCase();
            } else if (archetypes) {
                // Normalize the line key through aliases before matching
                const normalizedKeyLo = (ARCHETYPE_ALIASES[keyLo] ?? key).toLowerCase();
                const match = archetypes.find(a => a.toLowerCase() === normalizedKeyLo);
                if (match) kinks[match] = val.split(",").map(k => k.trim()).filter(Boolean);
            }
        }

        // Clamp over-long fields down to required counts; reject if under-count (can't pad up)
        if (archetypes) archetypes = archetypes.slice(0, 2);
        if (triggers)   triggers   = triggers.slice(0, 5);
        if (limits)     limits     = limits.slice(0, 5);
        if (archetypes) for (const a of archetypes) { if (kinks[a]) kinks[a] = kinks[a].slice(0, 2); }

        if (
            !archetypes || archetypes.length !== 2
            || archetypes.some(a => !VALID_ARCHETYPES.has(a.toLowerCase()))
            || archetypes.some(a => (kinks[a] ?? []).length !== 2)
            || !triggers || triggers.length !== 5
            || !dynamic
        ) return null;

        return { archetypes, kinks, triggers, limits: limits ?? [], dynamic, libido };
    }

    function serializeKinkProfile(profile) {
        const lines = [
            `Archetype: ${profile.archetypes.join(", ")}`,
            ...profile.archetypes.map(a => `${a}: ${profile.kinks[a].join(", ")}`),
            `Triggers: ${profile.triggers.join(", ")}`,
        ];
        if (profile.limits && profile.limits.length > 0) lines.push(`Limits: ${profile.limits.join(", ")}`);
        lines.push(`Dynamic: ${profile.dynamic}`);
        if (profile.libido) lines.push(`Libido: ${profile.libido}`);
        return lines.join("\n");
    }

    // Validate profile object strictly, then write to card.entry. Returns true on success.
    function writeKinkProfile(card, profile) {
        if (
            !profile
            || !Array.isArray(profile.archetypes) || profile.archetypes.length !== 2
            || profile.archetypes.some(a => !VALID_ARCHETYPES.has(a.toLowerCase()))
            || profile.archetypes.some(a => (profile.kinks?.[a] ?? []).length !== 2)
            || !Array.isArray(profile.triggers) || profile.triggers.length !== 5
            || typeof profile.dynamic !== "string" || !profile.dynamic.trim()
            || (profile.libido != null && !LIBIDO_MASS[profile.libido])
        ) return false;

        const words  = profile.dynamic.trim().split(/\s+/);
        const limits = Array.isArray(profile.limits) ? profile.limits.slice(0, 5) : [];
        const p      = { ...profile, limits, dynamic: words.slice(0, 4).join(" ") };
        card.entry   = serializeKinkProfile(p);
        return true;
    }

    // Read the existing profile, apply only the supplied fields, then write back.
    // partial may contain any subset of: archetypes, kinks, triggers, dynamic.
    // Returns true if the merged result passed validation and was written.
    function mergeKinkProfile(card, partial) {
        const base   = readKinkProfile(card) ?? { archetypes: [], kinks: {}, triggers: [], limits: [], dynamic: "", libido: null };
        const merged = {
            archetypes: partial.archetypes ?? base.archetypes,
            kinks:      { ...base.kinks, ...(partial.kinks ?? {}) },
            triggers:   partial.triggers  ?? base.triggers,
            limits:     partial.limits    ?? base.limits,
            dynamic:    partial.dynamic   ?? base.dynamic,
            libido:     partial.libido    ?? base.libido,
        };
        return writeKinkProfile(card, merged);
    }

    //—————————————————————————————————————————————————————————————————————
    // Character discovery & per-character state
    //—————————————————————————————————————————————————————————————————————

    function getCharacters() {
        const seen  = new Set();
        const names = [];
        const add   = (n) => {
            n = n.trim();
            if (n && !seen.has(n.toLowerCase())) { seen.add(n.toLowerCase()); names.push(n); }
        };
        for (const card of storyCards) {
            if (typeof card.keys === "string" && card.keys.includes('"agent"')) {
                try { const a = JSON.parse(card.keys)?.agent; if (typeof a === "string") add(a); } catch {}
            }
        }
        for (const card of storyCards) {
            if (typeof card.entry === "string") {
                const m = card.entry.match(/^\{title:\s*(.+?)\}/i);
                if (m) { const n = m[1].trim(); add(n.charAt(0).toUpperCase() + n.slice(1)); }
            }
        }
        if (S.CHARACTERS.trim() !== "") {
            for (const n of S.CHARACTERS.split(",")) add(n.trim());
        }
        return names;
    }

    function getActiveCharacters(characters) {
        const n = Math.max(1, S.DRIFT_SENSITIVITY);
        const recent = history.slice(-n).map(h => (h.text || h.rawText || "").toLowerCase()).join(" ");
        return characters.filter(name => recent.includes(name.toLowerCase()));
    }

    function getCharState(name) {
        if (!IK.chars[name]) {
            const base = S.INERTIA_MASS_MIN + Math.random() * (S.INERTIA_MASS_MAX - S.INERTIA_MASS_MIN);
            IK.chars[name] = {
                mass_base:        base,
                mass_base_max:    base + 3.0,
                heat:             0.0,
                heatDecayTimer:   0,
                driftBuffer:      [],
                relationships:    {},
                debugHeatWritten:  null,
                lastTrigger:       "—",
                lastLimit:         null,
                profileGenerated:  false,
            };
        }
        return IK.chars[name];
    }

    function initRelationship(cs, target) {
        cs.relationships[target] ??= {
            compat:         1.0,
            compatCeiling:  1.0,
            dynamic:        "",
            violationCount: 0,
            massPenalty:    0,
        };
        return cs.relationships[target];
    }

    //—————————————————————————————————————————————————————————————————————
    // CNC awareness
    //—————————————————————————————————————————————————————————————————————

    function isCNC(name) {
        if (S.CNC_CHARACTERS.split(",").some(n => n.trim().toLowerCase() === name.toLowerCase())) {
            return true;
        }
        const card = getKinkCard(name);
        if (card && typeof card.entry === "string") {
            const e = card.entry.toLowerCase();
            return e.includes("non-consent") || e.includes(" cnc") || e.includes("consensual non");
        }
        return false;
    }

    //—————————————————————————————————————————————————————————————————————
    // Behavior detection
    //—————————————————————————————————————————————————————————————————————

    function scanBehaviorTags(scanText) {
        const lower = scanText.toLowerCase();
        const found = [];
        for (const [tag, { keywords, regex }] of Object.entries(BEHAVIOR_TAGS)) {
            if (keywords.some(kw => lower.includes(kw)) || regex.test(scanText)) {
                found.push(tag);
            }
        }
        return found;
    }

    function detectIntimateScene(scanText) {
        const lower = scanText.toLowerCase();
        return INTIMATE_KEYWORDS.some(kw => lower.includes(kw)) || INTIMATE_REGEX.test(scanText);
    }

    function getTriggersFromKinkCard(name) {
        return readKinkProfile(getKinkCard(name))?.triggers ?? [];
    }

    function getArchetypesFromKinkCard(name) {
        return readKinkProfile(getKinkCard(name))?.archetypes.map(a => a.toLowerCase()) ?? [];
    }

    function behaviorAlignsWithArchetype(tags, archetypes) {
        const hasDom = tags.some(t => t === "dominant_behavior" || t === "pain_given");
        const hasSub = tags.some(t => t === "submissive_behavior" || t === "pain_received");
        const isDom  = archetypes.some(a => DOM_ARCHETYPES.includes(a));
        const isSub  = archetypes.some(a => SUB_ARCHETYPES.includes(a));
        return (hasDom && isDom) || (hasSub && isSub);
    }

    //—————————————————————————————————————————————————————————————————————
    // Mass / Heat
    //—————————————————————————————————————————————————————————————————————

    function calcMassCurrent(name, inSceneNames) {
        const cs      = getCharState(name);
        const profile = readKinkProfile(getKinkCard(name));
        let m = cs.mass_base;

        // Demi: emotional bond with player gradually lowers resistance
        if (profile?.libido === "demi") {
            const playerRel = cs.relationships["player"];
            if (playerRel && playerRel.compat > 0.5) m -= (playerRel.compat - 0.5) * 4.0;
        }

        const triggers = profile?.triggers ?? [];
        if (triggers.length > 0 && triggers.some(t => text.toLowerCase().includes(t))) m -= 1.0;
        if (cs.heat > 2.0)  m -= 0.5;
        if (cs.heat === 0.0) m += 0.5;
        for (const sceneName of inSceneNames) {
            if (sceneName === name) continue;
            const rel = cs.relationships[sceneName] ?? cs.relationships["player"];
            if (!rel) continue;
            m += rel.massPenalty;
            if (rel.compat > 0.8) m -= 0.5;
            if (rel.compat < 0.3) m += 0.5;
        }
        return Math.max(1, Math.min(15, m));
    }

    function applyHeatDelta(name, rawDelta, massCurrent) {
        const cs = getCharState(name);
        cs.heat = Math.max(0.0, Math.min(4.0, cs.heat + rawDelta / massCurrent));
        if (rawDelta > 0) cs.heatDecayTimer = 0;
    }

    function tickDecay(name, massCurrent) {
        const cs = getCharState(name);
        cs.heatDecayTimer++;
        if (cs.heatDecayTimer >= S.INTENSITY_DECAY) {
            cs.heat = Math.max(0.0, cs.heat - (1.0 / massCurrent));
            cs.heatDecayTimer = 0;
        }
    }

    function applyLibidoMass(name, libido) {
        const range = LIBIDO_MASS[libido];
        if (!range) return;
        const cs         = getCharState(name);
        const [lo, hi]   = range;
        cs.mass_base     = lo + Math.random() * (hi - lo);
        cs.mass_base_max = cs.mass_base + 3.0;
    }

    function getHeatTier(heat) {
        if (heat >= 4.0) return "peak";
        if (heat >= 3.0) return "burning";
        if (heat >= 2.0) return "hot";
        if (heat >= 1.0) return "warm";
        return "cold";
    }

    // Returns heat delta for a scene based on what archetypes care about.
    // Voyeur heats from witnessing intimacy; exhibitionist from being watched;
    // dominant archetypes heat more when actively taking control.
    // Everyone else gets the 0.25 base for any intimate scene.
    function archetypeHeatDelta(archetypes, tags, scanText) {
        const isIntimate    = detectIntimateScene(scanText);
        const hasExhibitAct = tags.includes("exhibitionist_act");
        const hasDomAction  = tags.some(t => t === "dominant_behavior" || t === "pain_given");

        if (!isIntimate && !hasExhibitAct) return 0;

        let delta = isIntimate ? 0.25 : 0;

        for (const arch of archetypes) {
            if (arch === "voyeur"       && isIntimate)                 delta = Math.max(delta, 0.5);
            if (arch === "exhibitionist"&& hasExhibitAct)              delta = Math.max(delta, 0.5);
            if (DOM_ARCHETYPES.includes(arch) && hasDomAction)         delta = Math.max(delta, 0.5);
        }

        return delta;
    }

    function injectHeatEmphasis(name, cardEntry, tier, heat, playerCompat) {
        const heatStr    = heat.toFixed(1);
        const cardBlock  = cardEntry ? `\n${cardEntry}` : "";
        const compatNote = (playerCompat !== null && heat >= 4.0)
            ? `\n[${name}'s comfort with player: ${playerCompat.toFixed(2)}]` : "";

        // Build kink desire and limit lines so the AI knows what this character wants AND what breaks the mood
        const parsed = cardEntry ? readKinkProfile({ entry: cardEntry }) : null;
        const desireLine = parsed
            ? ` Desires: ${parsed.archetypes.map(a => `${a} — ${(parsed.kinks[a] ?? []).join(", ")}`).join("; ")}.`
            : "";
        const limitLine = (parsed && parsed.limits.length > 0)
            ? ` Hard limits (kills the mood): ${parsed.limits.join(", ")}.`
            : "";

        // If a limit fired last turn, override tier guidance for one turn
        const cs = getCharState(name);
        if (cs.lastLimit) {
            const firedLimit = cs.lastLimit;
            cs.lastLimit = null; // consume — one turn of override only
            return `[PRIORITY — ${name}: mood broken — "${firedLimit}" is a hard limit. Write ${name} pulling back, expressing discomfort, or shutting down the escalation. Do not continue the intimate direction.]${cardBlock}`;
        }

        switch (tier) {
            case "cold":
                return parsed
                    ? `[${name}: heat 0.0/4.0 — not yet aroused.${desireLine}${limitLine} Profile is for personality reference only — no escalation yet.]${cardBlock}`
                    : `[${name}: heat 0.0/4.0 — not yet aroused. Keep scene intensity calibrated to this.]`;
            case "warm":
                return `[${name}: heat ${heatStr}/4.0 — early engagement.${desireLine}${limitLine} Let these preferences subtly color ${name}'s reactions without forcing escalation.]${cardBlock}`;
            case "hot":
                return `[${name}: heat ${heatStr}/4.0 — aroused.${desireLine}${limitLine} Write ${name}'s behavior actively shaped by these desires.]${cardBlock}`;
            case "burning":
                return `[PRIORITY — ${name}: heat ${heatStr}/4.0 — highly aroused.${desireLine}${limitLine} ${name} should be actively seeking or yielding to these desires.]${cardBlock}`;
            case "peak":
                return `[PRIORITY — ${name}: heat ${heatStr}/4.0 — peak arousal.${desireLine}${limitLine} Write full intensity — these are what ${name} craves right now.]${cardBlock}${compatNote}`;
            default:
                return cardBlock.trim();
        }
    }

    //—————————————————————————————————————————————————————————————————————
    // Relationships & compat
    //—————————————————————————————————————————————————————————————————————

    function upsertRelCard(name1, name2, rel) {
        const title   = `${name1} ↔ ${name2} Relationship`;
        const entry   = `Compat: ${rel.compat.toFixed(2)}\nDynamic: ${rel.dynamic || "—"}\nViolations: ${rel.violationCount}`;
        const existing = getRelCard(name1, name2);
        if (existing) {
            existing.entry = entry;
        } else {
            addStoryCard(buildKeys(buildKeys("", name1), name2), entry, "class", title, "");
        }
    }

    function applyCompat(name, target, delta) {
        const cs  = getCharState(name);
        const rel = initRelationship(cs, target);
        rel.compat = Math.max(0.0, Math.min(rel.compatCeiling, rel.compat + delta));
    }

    function applyViolation(name, target) {
        const cs  = getCharState(name);
        const rel = initRelationship(cs, target);
        rel.compat         = Math.max(0.0, rel.compat         - S.COMPAT_PENALTY_AMOUNT);
        rel.compatCeiling  = Math.max(0.0, rel.compatCeiling  - S.COMPAT_PENALTY_AMOUNT / 2);
        rel.massPenalty   += 0.1;
        rel.violationCount++;
        cs.mass_base = Math.min(cs.mass_base_max, cs.mass_base + 0.1);
        upsertRelCard(name, target, rel);
    }

    //—————————————————————————————————————————————————————————————————————
    // Generation prompt & parsing
    //—————————————————————————————————————————————————————————————————————

    // Builds the profile generation task using the IS boundary pattern.
    // The AI writes the scene normally, then appends <|ik_profile|> + the profile.
    // Output hook splits on the boundary — story shown to player, profile captured to card.
    function buildProfileTask(name, driftTag) {
        const brain    = getBrainCard(name);
        const acCard   = getACCard(name);
        const kinkCard = getKinkCard(name);
        const cs       = getCharState(name);
        const partners = Object.keys(cs.relationships);

        const lines = [
            "<SYSTEM>",
            `After writing your story response for this turn, output "<|ik_profile|>" on its own line, then ${name}'s kink profile in this exact format — no text after the profile:`,
            `Archetype: [archetype1], [archetype2]`,
            `[archetype1]: [kink1], [kink2]`,
            `[archetype2]: [kink1], [kink2]`,
            `Triggers: [word or phrase], [word or phrase], [word or phrase], [word or phrase], [word or phrase]`,
            `Limits: [word or phrase], [word or phrase], [word or phrase]`,
            `Dynamic: [relationship dynamic]`,
            `Libido: [libido level]`,
            "Rules:",
            "- Archetypes and kinks describe sexual and intimate preferences ONLY — not occupations, hobbies, or personality traits",
            "- Exactly 2 archetypes from: Dominant, Submissive, Switch, Brat, Masochist, Sadist, Pet, Owner, Rigger, Rope bunny, Voyeur, Exhibitionist, Experimentalist, Degrader, Degradee",
            "- Exactly 2 kinks per archetype (sexual/intimate acts or dynamics, brief noun phrases, lowercase)",
            "- Exactly 5 triggers: concrete words or short phrases that would literally appear in dialogue or narration and cause an intimate reaction (e.g. 'good boy', 'kneel', 'beg', 'please', 'sir', 'pet') — NOT abstract concepts like 'power imbalances', 'authority figures', or 'submission cues'",
            "- 3 to 5 limits: concrete words or short phrases that would kill the mood or cause a hard negative reaction — things this character dislikes or finds uncomfortable in intimate contexts (e.g. 'baby girl', 'little one', 'good boy' for someone who hates being praised like a child) — NOT abstract concepts",
            "- One relationship dynamic descriptor, four words maximum",
            "- One libido level: ace (very resistant to arousal), demi (needs emotional connection first), standard, or high (easily aroused)",
            "- Infer intimate preferences AND limits from personality, behavior, and story context — not from job or hobbies",
            "</SYSTEM>",
        ];

        if (driftTag) {
            lines.splice(-1, 0, `- Story evidence suggests a shift toward [${driftTag}]. Update the profile to reflect this if appropriate.`);
        }

        if (brain && typeof brain.description === "string" && brain.description.trim() !== "") {
            lines.splice(-1, 0, `${name}'s thoughts and feelings:\n${brain.description.trim()}`);
        }

        if (acCard && typeof acCard.entry === "string") {
            const clean = acCard.entry.replace(/^\{title:[^}]*\}\s*/i, "").trim();
            if (clean !== "") lines.splice(-1, 0, `${name}'s background:\n${clean}`);
        }

        if (kinkCard && typeof kinkCard.entry === "string" && kinkCard.entry.trim() !== "") {
            lines.splice(-1, 0, `Current profile (update if story warrants it):\n${kinkCard.entry.trim()}`);
        }

        if (partners.length > 0) {
            lines.splice(-1, 0, ...[
                `Also append one relationship line per partner after the profile (format: [${name}] ↔ [Partner]: [four word dynamic]):`,
                `Known partners: ${partners.join(", ")}`,
            ]);
        }

        return lines.join("\n");
    }

    function parseProfileV2(output) {
        const lines = output.trim().split("\n");

        // Seek Archetype: line (also accepts "Archetypes:"), skipping any AI preamble
        let startIdx = lines.findIndex(l => /^archetypes?:/i.test(l.trim()));
        if (startIdx === -1) {
            // Try to infer the Archetype: line from kink-format lines (Key: val1, val2)
            // that appear before known terminal fields — AI sometimes skips the header
            const KNOWN_FIELDS = new Set(["triggers", "dynamic", "libido"]);
            const inferredArchs = [];
            let inferStart = -1;
            for (let i = 0; i < lines.length; i++) {
                const ci = lines[i].indexOf(":");
                if (ci === -1) continue;
                const k  = lines[i].slice(0, ci).trim().toLowerCase();
                const v  = lines[i].slice(ci + 1).trim();
                if (KNOWN_FIELDS.has(k)) break;
                if (v.split(",").map(p => p.trim()).filter(Boolean).length === 2) {
                    if (inferStart === -1) inferStart = i;
                    inferredArchs.push(lines[i].slice(0, ci).trim());
                }
                if (inferredArchs.length === 2) break;
            }
            if (inferredArchs.length === 2 && inferStart !== -1) {
                lines.splice(inferStart, 0, `Archetype: ${inferredArchs.join(", ")}`);
                startIdx = inferStart;
            } else {
                const firstIdx = lines.findIndex(l => l.trim() !== "");
                if (firstIdx !== -1) { lines[firstIdx] = "Archetype: " + lines[firstIdx].trim(); startIdx = firstIdx; }
                else { lines.unshift("Archetype:"); startIdx = 0; }
            }
        }

        // Collect profile lines and relationship lines from startIdx onward.
        // No early stop at Dynamic: — Libido: follows Dynamic: and must be included.
        const profileLines = [];
        const relationships = [];
        const relPattern = /^(.+?)\s*↔\s*(.+?):\s*(.+)$/;

        for (const line of lines.slice(startIdx)) {
            const m = line.match(relPattern);
            if (m) {
                relationships.push({
                    name1:   m[1].trim(),
                    name2:   m[2].trim(),
                    dynamic: m[3].trim().split(/\s+/).slice(0, 4).join(" "),
                });
            } else {
                profileLines.push(line);
            }
        }

        // Normalize "Archetypes:" → "Archetype:" then parse
        const normalized = profileLines.join("\n").replace(/^Archetypes:/mi, "Archetype:").trim();
        const profile    = readKinkProfile({ entry: normalized });

        return { profile, relationships };
    }

    function upsertKinkCard(name, profile) {
        let card = getKinkCard(name);
        if (!card) {
            addStoryCard(buildKeys("", name), "", "class", name + " Kinks", "");
            card = getKinkCard(name);
            if (!card) return false;
        }
        const success = writeKinkProfile(card, profile);
        if (success && profile.libido) applyLibidoMass(name, profile.libido);
        return success;
    }

    function writeDebugInfo(name, massCurrent) {
        const card = getKinkCard(name);
        if (!card) return;
        const cs   = getCharState(name);
        const tier = getHeatTier(cs.heat);
        cs.debugHeatWritten = parseFloat(cs.heat.toFixed(2));
        const lines = [
            `[IK Debug — ${name}]`,
            `mass_base: ${cs.mass_base.toFixed(2)}`,
            `heat: ${cs.heat.toFixed(2)} (${tier})`,
            `decay_timer: ${cs.heatDecayTimer}`,
            `drift_buffer: ${cs.driftBuffer.length > 0 ? cs.driftBuffer.join(", ") : "—"}`,
            `trigger: ${cs.lastTrigger ?? "—"}`,
            `limit: ${cs.lastLimit ?? "—"}`,
        ];
        for (const [partner, rel] of Object.entries(cs.relationships)) {
            lines.push(
                `${partner} compat: ${rel.compat.toFixed(2)}`,
                `${partner} ceiling: ${rel.compatCeiling.toFixed(2)}`,
                `${partner} violations: ${rel.violationCount}`,
            );
        }
        card.description = lines.join("\n");
    }

    function readDebugOverrides(name) {
        const card = getKinkCard(name);
        if (!card || typeof card.description !== "string") return;
        const cs = getCharState(name);
        for (const line of card.description.split("\n")) {
            const colon = line.indexOf(":");
            if (colon === -1) continue;
            const key = line.slice(0, colon).trim().toLowerCase();
            const val = line.slice(colon + 1).trim();
            if (key === "mass_base") {
                const n = parseFloat(val);
                if (!isNaN(n)) {
                    cs.mass_base     = Math.max(1, Math.min(15, n));
                    cs.mass_base_max = cs.mass_base + 3.0;
                }
            } else if (key === "heat") {
                const n = parseFloat(val);
                // Only override if this differs from what the system last wrote — indicates a manual edit.
                if (!isNaN(n) && n !== cs.debugHeatWritten) cs.heat = Math.max(0.0, Math.min(4.0, n));
            } else if (key === "decay_timer") {
                const n = parseInt(val, 10);
                if (!isNaN(n)) cs.heatDecayTimer = Math.max(0, n);
            } else if (key === "drift_buffer") {
                cs.driftBuffer = (val === "—" || val.trim() === "")
                    ? []
                    : val.split(",").map(t => t.trim()).filter(Boolean);
            } else if (key === "trigger" || key === "limit") {
                // read-only display fields — never override
            } else {
                // Relationship fields: "[partner] compat / ceiling / violations"
                const parts  = key.split(" ");
                const field  = parts[parts.length - 1];
                const partner = parts.slice(0, -1).join(" ");
                const rel    = cs.relationships[partner];
                if (!rel) continue;
                if (field === "compat") {
                    const n = parseFloat(val);
                    if (!isNaN(n)) rel.compat = Math.max(0.0, Math.min(1.0, n));
                } else if (field === "ceiling") {
                    const n = parseFloat(val);
                    if (!isNaN(n)) rel.compatCeiling = Math.max(0.0, Math.min(1.0, n));
                } else if (field === "violations") {
                    const n = parseInt(val, 10);
                    if (!isNaN(n)) rel.violationCount = Math.max(0, n);
                }
            }
        }
    }

    //—————————————————————————————————————————————————————————————————————
    // Hook dispatch
    //—————————————————————————————————————————————————————————————————————

    if (hook === "input") {
        if (!S.INTENSITY_ENABLED && !S.COMPAT_ENABLED) return;

        const characters = getCharacters();
        if (characters.length === 0) return;

        const tags       = scanBehaviorTags(text);
        const inputLower = text.toLowerCase();
        // Apply only to characters mentioned in the input; fall back to all if none named
        const inputChars = characters.filter(n => inputLower.includes(n.toLowerCase()));
        const targets    = inputChars.length > 0 ? inputChars : characters;

        for (const name of targets) {
            const cs = getCharState(name);
            const mc = S.INERTIA_ENABLED ? calcMassCurrent(name, targets) : 1;

            if (S.INTENSITY_ENABLED) {
                const profile  = readKinkProfile(getKinkCard(name));
                const triggers = profile?.triggers ?? [];
                if (triggers.length > 0 && triggers.some(t => inputLower.includes(t))) {
                    applyHeatDelta(name, 0.25, mc);
                }
                // Kink word in player input: player is actively engaging with this character's desires
                if (profile) {
                    const kinkWords = profile.archetypes.flatMap(a => profile.kinks[a] ?? []).map(k => k.toLowerCase());
                    if (kinkWords.some(k => inputLower.includes(k))) applyHeatDelta(name, 0.15, mc);
                    // Limit word in player input: player is doing something this character dislikes
                    const hitLimit = (profile.limits ?? []).find(l => inputLower.includes(l));
                    if (hitLimit) {
                        applyHeatDelta(name, -0.25, mc);
                        getCharState(name).lastLimit = hitLimit;
                    }
                }
            }

            if (S.COMPAT_ENABLED) {
                const archetypes = getArchetypesFromKinkCard(name);
                if (behaviorAlignsWithArchetype(tags, archetypes)) {
                    applyCompat(name, "player", 0.05);
                    const rel = initRelationship(cs, "player");
                    upsertRelCard(name, "player", rel);
                }
            }
        }

        return;
    }

    if (hook === "context") {
        globalThis.stop ??= false;

        // Create the config card here — addStoryCard is safe in context hook
        initConfigCard();

        const characters = getCharacters();
        if (characters.length === 0) return;

        // Ensure all character states are initialized, then apply any debug overrides
        for (const name of characters) {
            getCharState(name);
            if (S.DEBUG_MODE) readDebugOverrides(name);
        }

        // Determine who is active in recent history
        const activeChars  = getActiveCharacters(characters);
        const inSceneNames = activeChars.length > 0 ? activeChars : characters;

        // Mass + heat decay pass
        for (const name of characters) {
            const mc = S.INERTIA_ENABLED ? calcMassCurrent(name, inSceneNames) : 1;
            if (S.INTENSITY_ENABLED) tickDecay(name, mc);
        }

        // Drift scan — active characters only
        if (S.DRIFT_ENABLED && !IK.pending) {
            const recentText = history
                .slice(-Math.max(1, S.DRIFT_SENSITIVITY))
                .map(h => h.text || h.rawText || "")
                .join(" ");

            for (const name of activeChars) {
                const cs   = getCharState(name);
                const tags = scanBehaviorTags(recentText).filter(t => t !== "refusal");

                for (const tag of tags) {
                    if (cs.driftBuffer.length >= S.DRIFT_SENSITIVITY) cs.driftBuffer.shift();
                    cs.driftBuffer.push(tag);
                }

                if (cs.driftBuffer.length >= S.DRIFT_SENSITIVITY) {
                    const families = new Set(cs.driftBuffer.map(t => TAG_ARCHETYPE[t]).filter(Boolean));
                    if (families.size === 1) {
                        IK.pending  = name;
                        IK.driftTag = [...families][0];
                        cs.driftBuffer = [];
                        break;
                    } else if (families.size > 1) {
                        cs.driftBuffer = [];
                    }
                }
            }
        }

        // Cooldown rotation (if drift didn't claim pending)
        if (!IK.pending) {
            if (IK.cooldown > 0) {
                IK.cooldown--;
            } else {
                IK.index    = IK.index % characters.length;
                const name  = characters[IK.index];
                IK.index    = (IK.index + 1) % characters.length;
                // Only generate once per adventure — profileGenerated is false at adventure start
                // even if a card from a previous session exists in the scenario.
                if (!getCharState(name).profileGenerated) {
                    IK.pending  = name;
                    IK.driftTag = null;
                }
                IK.cooldown = S.COOLDOWN;
            }
        }

        // Heat emphasis and trigger injection — injected BEFORE the generation task so
        // the generation task lands last in context and the AI prioritizes it.
        if (S.INTENSITY_ENABLED) {
            for (const name of characters) {
                const cs      = getCharState(name);
                const tier    = getHeatTier(cs.heat);
                const card    = getKinkCard(name);
                const profile = card ? readKinkProfile(card) : null;
                const entry   = card?.entry ?? null;

                // Skip cold characters with no card who aren't in the active scene
                if (tier === "cold" && !entry && !activeChars.includes(name)) continue;

                const playerRel = cs.relationships["player"] ?? null;
                const compat    = playerRel ? playerRel.compat : null;

                // Trigger + limit evaluation — boundary approach; skip during profile generation turns
                if (profile && !IK.pending) {
                    const conditions = profile.triggers.join(", ");
                    const limits     = profile.limits ?? [];
                    const limitPart  = limits.length > 0
                        ? ` Then on the next line, LIMIT:${name}:YES:[which limit word or phrase] if the scene contained or implied any of (${limits.join(", ")}), or LIMIT:${name}:NO.`
                        : "";
                    text = text + `\n\n<SYSTEM>After writing the scene, output "<|ik_trigger|>" on its own line, then TRIGGER:${name}:YES if the player's action or scene involved any of (${conditions}), or TRIGGER:${name}:NO.${limitPart} No other text.</SYSTEM>`;
                }

                // On generation turns suppress the card entry — buildProfileTask already
                // includes it as "Current profile", and injecting it again here would
                // bury the generation instruction under conflicting "no escalation" guidance.
                const emphEntry = IK.pending ? null : entry;
                text = text + "\n\n" + injectHeatEmphasis(name, emphEntry, tier, cs.heat, compat);

                // Low compat warning at hot+
                if (S.COMPAT_ENABLED && cs.heat >= 2.0 && compat !== null && compat < 0.4) {
                    text = text + `\n[Note: ${name}'s comfort with the player is low (${compat.toFixed(1)}). Proceed carefully.]`;
                }
            }
        }

        // Inject profile generation task last so it is the final instruction the AI reads.
        if (IK.pending) {
            text = text + "\n\n" + buildProfileTask(IK.pending, IK.driftTag);
        }

        return;
    }

    if (hook === "output") {
        const characters  = getCharacters();
        const outputText  = text;
        const namePending = IK.pending;
        if (namePending) { IK.pending = null; IK.driftTag = null; }

        const PROFILE_BOUNDARY = "<|ik_profile|>";
        const TRIGGER_BOUNDARY = "<|ik_trigger|>";
        const triggerFired     = {};
        const limitFired       = {}; // name.toLowerCase() → fired word (string) | false (NO)
        let storyText          = outputText;

        // Extract profile section — boundary first, then Archetype: fallback, then Triggers: fallback
        if (namePending) {
            const bIdx = storyText.indexOf(PROFILE_BOUNDARY);
            const aIdx = storyText.search(/^Archetypes?:/mi);
            let useBound = bIdx !== -1;
            let pIdx     = useBound ? bIdx : aIdx;

            // Last-resort fallback: no boundary and no Archetype: header —
            // AI wrote the profile inline without either marker. Detect by Triggers: line
            // and back up to the start of the profile block.
            if (pIdx === -1) {
                const trigIdx = storyText.search(/^Triggers:\s/mi);
                if (trigIdx !== -1) {
                    const before  = storyText.slice(0, trigIdx);
                    const lastGap = before.lastIndexOf("\n\n");
                    pIdx = lastGap !== -1 ? lastGap + 2 : trigIdx;
                }
            }

            if (pIdx !== -1) {
                const taskText = useBound
                    ? storyText.slice(pIdx + PROFILE_BOUNDARY.length).trim()
                    : storyText.slice(pIdx).trim();
                storyText      = storyText.slice(0, pIdx).trimEnd();
                text           = storyText;

                const { profile, relationships } = parseProfileV2(taskText);
                const written = profile && upsertKinkCard(namePending, profile);
                if (written) {
                    getCharState(namePending).profileGenerated = true;
                } else {
                    IK.cooldown = 2; // retry in a few turns instead of waiting the full cooldown
                }
                if (S.RELATIONSHIP_ENABLED) {
                    for (const { name1, name2, dynamic } of relationships) {
                        const cs  = getCharState(name1);
                        const rel = initRelationship(cs, name2);
                        rel.dynamic = dynamic;
                        upsertRelCard(name1, name2, rel);
                    }
                }
                state.message = written
                    ? `Inner Kinks: ${namePending}'s kink profile generated.`
                    : profile
                        ? `Inner Kinks: ${namePending}'s profile failed validation — retrying in 2 turns.`
                        : `Inner Kinks: Could not parse a profile for ${namePending} — retrying in 2 turns.`;
                if (S.DEBUG_MODE) {
                    const mc = S.INERTIA_ENABLED ? calcMassCurrent(namePending, []) : 1;
                    writeDebugInfo(namePending, mc);
                }
                // Replace generation output with a brief neutral placeholder
                if (!storyText.trim()) storyText = text = `*[${namePending}'s profile is being updated...]*`;
            } else {
                IK.cooldown = 2;
                state.message = `Inner Kinks: ${namePending}'s profile output not found — retrying in 2 turns.`;
            }
        }

        // Extract trigger + limit section — AI appended both after the boundary
        const tIdx = storyText.indexOf(TRIGGER_BOUNDARY);
        if (tIdx !== -1) {
            const taskText = storyText.slice(tIdx + TRIGGER_BOUNDARY.length).trim();
            storyText      = storyText.slice(0, tIdx).trimEnd();
            text           = storyText;
            const flagMatch = taskText.match(/TRIGGER:([^:\s]+):(YES|NO)/i);
            if (flagMatch) {
                triggerFired[flagMatch[1].trim().toLowerCase()] = flagMatch[2].toUpperCase() === "YES";
            }
            // LIMIT:Name:YES:[word] or LIMIT:Name:NO — colon-separated, word may contain spaces
            const limitMatch = taskText.match(/LIMIT:([^:\s]+):(YES|NO)(?::(.+))?/i);
            if (limitMatch) {
                const lName = limitMatch[1].trim().toLowerCase();
                limitFired[lName] = limitMatch[2].toUpperCase() === "YES"
                    ? (limitMatch[3]?.trim() || true)
                    : false;
            }
        }

        // Fallback: inline trigger flag regex for AI that ignores the boundary
        if (Object.keys(triggerFired).length === 0) {
            const flagRegex = /\[?TRIGGER:([^:\]\s]+):(YES|NO)\]?/gi;
            let flagMatch;
            while ((flagMatch = flagRegex.exec(storyText)) !== null) {
                triggerFired[flagMatch[1].trim().toLowerCase()] = flagMatch[2].toUpperCase() === "YES";
            }
            if (Object.keys(triggerFired).length > 0) {
                storyText = storyText.replace(/\[?TRIGGER:[^:\]\s]+:(YES|NO)\]?/gi, "").replace(/^\s+/, "");
                text = storyText;
            }
        }

        // Fallback: inline limit flag regex
        if (Object.keys(limitFired).length === 0) {
            const limitFlagRegex = /\[?LIMIT:([^:\]\s]+):(YES|NO)(?::([^\]\n]*))?\]?/gi;
            let limitFlagMatch;
            while ((limitFlagMatch = limitFlagRegex.exec(storyText)) !== null) {
                const lName = limitFlagMatch[1].trim().toLowerCase();
                limitFired[lName] = limitFlagMatch[2].toUpperCase() === "YES"
                    ? (limitFlagMatch[3]?.trim() || true)
                    : false;
            }
            if (Object.keys(limitFired).length > 0) {
                storyText = storyText.replace(/\[?LIMIT:[^:\]\s]+:(YES|NO)(?::[^\]\n]*)?\]?/gi, "").trim();
                text = storyText;
            }
        }

        // Record per-character trigger result for debug notes.
        if (S.DEBUG_MODE) {
            for (const name of characters) {
                const cs     = getCharState(name);
                const nameLo = name.toLowerCase();
                if (namePending) {
                    cs.lastTrigger = "— (profile gen)";
                } else if (nameLo in triggerFired) {
                    cs.lastTrigger = triggerFired[nameLo] ? "YES" : "NO";
                } else {
                    cs.lastTrigger = "missed";
                }
            }
        }

        // Heat and compat pass on story portion.
        // Also include characters the AI explicitly named in a TRIGGER flag, even if the
        // story text only uses pronouns (e.g. pet scenes where "Jake" is never written).
        const outputChars = characters.filter(n =>
            storyText.toLowerCase().includes(n.toLowerCase())
            || n.toLowerCase() in triggerFired
        );

        for (const name of outputChars) {
            const cs       = getCharState(name);
            const mc       = S.INERTIA_ENABLED ? calcMassCurrent(name, outputChars) : 1;
            const profile  = readKinkProfile(getKinkCard(name));
            const archs    = profile?.archetypes.map(a => a.toLowerCase()) ?? [];
            const triggers = profile?.triggers ?? [];
            const tags     = scanBehaviorTags(storyText);

            if (S.INTENSITY_ENABLED) {
                const storyLower = storyText.toLowerCase();
                const sceneDelta = archetypeHeatDelta(archs, tags, storyText);
                if (sceneDelta > 0) applyHeatDelta(name, sceneDelta, mc);
                const nameLo = name.toLowerCase();
                if (triggerFired[nameLo] === true) {
                    applyHeatDelta(name, 0.5, mc);
                } else if (!(nameLo in triggerFired) && triggers.length > 0
                           && triggers.some(t => storyLower.includes(t))) {
                    applyHeatDelta(name, 0.25, mc);
                }
                // Kink word bonus: kink-specific content in an intimate scene gives a small heat nudge
                if (profile && detectIntimateScene(storyText)) {
                    const kinkWords = profile.archetypes.flatMap(a => profile.kinks[a] ?? []).map(k => k.toLowerCase());
                    if (kinkWords.some(k => storyLower.includes(k))) applyHeatDelta(name, 0.15, mc);
                }
                // Limit detection: AI judgment primary, substring fallback secondary
                if (profile && (profile.limits ?? []).length > 0) {
                    let hitLimit = null;
                    if (nameLo in limitFired) {
                        // AI explicitly judged it
                        const result = limitFired[nameLo];
                        hitLimit = result === false ? null
                            : typeof result === "string" ? result
                            : (profile.limits.find(l => storyLower.includes(l)) ?? "(limit)");
                    } else {
                        // Substring fallback — exact word/phrase match
                        hitLimit = (profile.limits ?? []).find(l => storyLower.includes(l)) ?? null;
                    }
                    if (hitLimit) {
                        applyHeatDelta(name, -0.5, mc);
                        cs.lastLimit = hitLimit;
                    }
                }
            }

            if (S.COMPAT_ENABLED) {
                if (behaviorAlignsWithArchetype(tags, archs)) {
                    applyCompat(name, "player", 0.05);
                    const rel = initRelationship(cs, "player");
                    upsertRelCard(name, "player", rel);
                }
                if (S.COMPAT_PENALTY_ENABLED && tags.includes("refusal")) {
                    if (isCNC(name)) {
                        if (S.INTENSITY_ENABLED) applyHeatDelta(name, 0.25, mc);
                    } else {
                        applyViolation(name, "player");
                    }
                }
            }

            if (S.RELATIONSHIP_ENABLED && outputChars.length > 1) {
                for (const other of outputChars) {
                    if (other === name) continue;
                    initRelationship(cs, other);
                }
            }
        }

        if (S.DEBUG_MODE) {
            for (const name of characters) {
                const mc = S.INERTIA_ENABLED ? calcMassCurrent(name, outputChars) : 1;
                writeDebugInfo(name, mc);
            }
        }

        return;
    }
}
