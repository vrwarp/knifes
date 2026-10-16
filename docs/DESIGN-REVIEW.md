# Design review loop

Five critics with deliberately different lenses reviewed the same full-page screenshots
(`e2e/screens.mjs` captures them) in parallel. After each round the consensus findings were
implemented, the smoke suite rerun, the screens recaptured, and the same five critics sent the new
set with a note of what changed. The loop stops when no critic reports a blocking finding and the
scores stop moving.

Lenses: mobile UX, art direction and typography, immersion and pacing (escape-room designer),
accessibility and robustness, live GM operations (stage manager).

Scores are 1 to 10 on hierarchy and readability, visual craft, immersion and tone, usability under
party conditions, and the GM console, averaged across the five critics.

| Round | Hierarchy | Craft | Immersion | Party usability | GM console | P0 findings |
| - | - | - | - | - | - | - |
| 1 | 5.0 | 6.4 | 7.0 | 4.6 | 6.4 | 26 across critics, 6 unanimous |
| 2 | 7.8 | 7.3 | 8.0 | 6.7 | 7.3 | 1 (tabs unmounting lost the deduction draft) |
| 3 | see below | | | | | |

## Round 1: what the critics agreed on

- Body copy rendered magenta: the `accent` frame modifier collided with the `.accent` text utility.
- 15px inputs made iOS zoom and stay zoomed.
- Puzzle photos were cropped thumbnails; the map swallowed scroll gestures and pushed the button below the fold.
- Long evidence file names overflowed the card and caused horizontal page scroll.
- The gate error vanished after half a second.
- Wins were never visible: the socket push replaced the screen before the success state rendered.
- Tile state was colour-only; disabled buttons were a muddy slab; no reduced-motion support.
- The GM hint panel sat a screen down on a phone; resets fired without confirmation; the geo target
  defaulted to empty and silently accepted any pin; nothing on the console read from across a room.

Implemented in commit "Design round 1". Also taken from the ideas lists: the across-the-room NOW
strip, the verdict in beats with the birthday line last, the window highlight on log rows, one-tap
quick hints, print-only case file, client-side photo downscale.

Declined or deferred, with reasons: a "fields verified" count on a wrong deduction (the organizers
chose pass or fail; it exists as a GM option, off by default); changing the puzzle secret ALPHA,
which appears in the fiction (organizers' choice; GMs can change it in the console); the Fallout-style
glyph scramble and a GM-released finale (cost versus the remaining days).

## Round 2: what remained

- The new tap-to-skip did not skip (the typing interval kept running). Found by four critics.
- Investigation tabs unmounted on switch and lost the deduction draft and ARCHIVE query. The one P0.
- Map lock scrim too light, label colliding with tile text, zoom controls visible while locked.
- The transmissions button grew and wrapped the top bar at the moment a hint arrived.
- The hint overlay did not take focus, so the phone keyboard could cover Acknowledge.
- Coordinate and list fields in the GM config parsed every keystroke and could only be pasted into.
- The stuck alarm used time in stage, so it turned red for the whole dinner.
- Integrity text contradicted itself; hint defaults had lost their capital letters; one "03:45" survived.

Implemented in commit "Design round 2".

## Round 3: convergence check

(filled in below once the round-three verdicts are in)
