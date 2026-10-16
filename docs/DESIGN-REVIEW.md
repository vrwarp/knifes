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
| 3 | 8.0 | 7.1 | 8.5 | 7.5 | 7.8 | 0 new; 2 regressions from round 2 (both fixed) |

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

Verdicts: immersion and GM operations converged outright. Mobile UX, art direction and
accessibility each withheld convergence on exactly one item, and all three items were regressions
introduced by round-two fixes rather than new design findings:

- The evidence vault eyebrow printed a literal `\u2011` (a JavaScript escape written inside JSX
  text). Fixed before the verdicts landed; the critics were reading captures that predated the fix.
- The merged name, badge, door and event cell in the vault access log inherited a `nowrap` rule
  from the old badge column, so the table ran to 662 CSS pixels on a 390 pixel phone and the 03:48
  "one card envelope" clue sat off screen. The cell wraps now and the file body scrolls as a backstop.

Also fixed from the round-three lists: the GM jump-to select was clipped to about 100 pixels by the
no-wrap control row (it keeps a 160 pixel floor and the button wraps instead); the top fade meant for
the scrolling GM log also faded the first row of the vault table; the stage-back scroll fired at
mount under reduced motion; the deduction verdict floor applied only to wrong answers (a pass
swapped the screen the instant the socket pushed it, so the floor now lives in the server); the
rejection text, the reveal button and the intro button scroll into view when they appear below the
fold; deduction inputs meet the 44 pixel target; the hint overlay no longer grows from the middle
while it types (the typewriter reserves its final height); ARCHIVE cycles processing lines while a
live reply takes its time; the GM console polls and shows a link banner when it never had a socket;
the stuck strip shows idle time as its big number; forward stage skips confirm like backward jumps;
hint drafting has its own flag and a cancel; two GM contrast pairs were raised above 4.5:1.

Stop decision: converged. No critic has a blocking finding against the current build, every blocking
item of the round was a regression that is fixed and verified on recaptured screens, and the
scores moved by 0.2 or less on three of five dimensions (party usability rose 0.8 with the overflow
and target fixes). The three-round cap is reached.

Left open on purpose, all non-blocking: a count of verified fields on a miss (the organizers chose
pass or fail; the GM option stays); changing the puzzle secret ALPHA (it is part of the fiction);
a Fallout-style glyph scramble on the hacking screen; a GM-released finale beat. The remaining
critic ideas that were not taken are listed in the round-three notes under the scratchpad critique
folder and in the per-critic reports.
