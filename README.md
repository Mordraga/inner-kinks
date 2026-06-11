# Inner Kinks v2.0

A scripting system for [AI Dungeon](https://play.aidungeon.io) that generates and maintains kink profiles, heat meters, and relationship cards for NPCs. Profiles are written by the AI itself during play — no manual setup per character required.

---

## Inspiration

Inner Kinks was built to extend the work of **LewdLeah**, whose [AutoCards](https://github.com/LewdLeah) and [Inner Self](https://github.com/LewdLeah) systems laid the groundwork for structured NPC tracking in AI Dungeon scenarios. IK is **compatible with both by design** — if AutoCards and/or Inner Self are installed in the same scenario, IK will detect their cards and integrate with them rather than duplicating work. It also runs cleanly as a standalone system if you don't use either.

---

## What It Does

- **Kink profile generation** — IK watches for NPCs appearing in your story and asks the AI to write a structured kink profile for each one (archetypes, kinks, triggers, dynamic, libido). Profiles are stored as scenario story cards and persist across sessions.
- **Heat meter** — Each NPC has a heat value (0–4) that rises when their triggers appear in dialogue or narration, and decays when scenes go quiet. The AI's context is adjusted based on heat tier to keep escalation paced and consistent.
- **Kink-specific behavior guidance** — At each heat tier, the AI is told not just *that* a character is aroused but *what* they specifically want (e.g. "Desires: Masochist — pain, humiliation; Degradee — submission, denial") so its writing reflects the character's actual profile.
- **Inertia system** — Each NPC has a `mass` value derived from their libido setting that controls how fast heat changes. High libido characters are reactive; ace/demi characters take much longer to warm up.
- **Drift detection** — If the AI writes the same behavior pattern for several turns in a row, IK queues a profile update to reflect what the character is actually doing.
- **Relationship & compat tracking** — IK tracks compatibility between the player and each NPC, and between NPCs. Acting against a character's preferences reduces compat; acting in alignment builds it.
- **CNC awareness** — Mark specific characters as CNC so refusal signals don't trigger a compatibility penalty.
- **Debug mode** — Writes a live state block (heat, mass, last trigger, decay timer) into each NPC's kink card notes every turn.

---

## Setup

1. **Copy the scripts** into your AI Dungeon scenario's script tabs:

   | File | Tab |
   |---|---|
   | `ik-lib.js` | **Library** |
   | `ik-input.js` | **Input** |
   | `ik-context.js` | **Context** |
   | `ik-output.js` | **Output** |

   If you already have scripts in those tabs, paste the IK call at the **top** of your existing modifier — before any other logic.

2. **Register your characters** — On first run IK will auto-create a "Configure Inner Kinks" story card. Open it and set:

   ```
   characters: Sarah, Jake, Vera
   ```

   (Comma-separated NPC first names. These are the characters IK will track and profile.)

3. **Play** — IK runs silently. After enough turns with a character on screen, the AI will be prompted to write their profile. You'll see a message like `Inner Kinks: Vera's kink profile generated.` Once a profile exists, heat tracking and behavior guidance activate automatically.

---

## Configuration

All settings live in the **Configure Inner Kinks** story card (auto-created on first run). The available options and their defaults:

```
characters:              (comma-separated NPC names to track)
cooldown: 20             (turns between profile generation events)
enabled: true
debug_mode: false        (set true to see live heat/mass state in card notes)
drift_enabled: true
drift_sensitivity: 3     (turns of consistent behavior before drift triggers)
inertia_enabled: true
inertia_mass_min: 1
inertia_mass_max: 5
intensity_enabled: true
intensity_decay: 5       (inactive turns before heat decays one step)
relationship_enabled: true
compat_enabled: true
compat_penalty_enabled: true
compat_penalty_amount: 0.1
cnc_characters:          (comma-separated names where refusal = consensual play)
```

---

## Kink Profile Format

Profiles are stored as story card entries. The AI writes them; IK validates and corrects them. The format:

```
Archetype: Switch, Masochist
Switch: impact play, verbal humiliation
Masochist: pain, denial
Triggers: good girl, kneel, beg, please, sir
Dynamic: controlled casual dominance
Libido: high
```

**Valid archetypes**: Dominant, Submissive, Switch, Brat, Masochist, Sadist, Pet, Owner, Rigger, Rope bunny, Voyeur, Exhibitionist, Experimentalist, Degrader, Degradee

**Libido values** (controls inertia mass range): `ace`, `demi`, `standard`, `high`

---

## Compatibility with AutoCards & Inner Self

IK reads AutoCards character entries for names and facts. If Inner Self is installed, IK will use the personality state IS maintains rather than generating a separate one. Neither dependency is required — if the cards aren't present, IK falls back to its own tracking.

---

## License

See [LICENSE](LICENSE).

---

*Inner Kinks v2.0 — by Mordraga*
