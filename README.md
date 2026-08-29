# CHESS ROYALE

A shrinking-board chess variant. Two seats, no king, no check. Runners cross an
expiring board to reach face-up chests that turn them into real pieces.

`src/game/royale.rules.mjs` is pure — no DOM, no clock, no `Math.random`.
Everything else is measurement.

## Locked shape

9×9. Five runners a seat on alternating back-row squares. **Three moves a turn.**
Six chests, face-up and labelled from move one. Collapses at the end of rounds 4
and 7 (9→7→5); the game ends after round 11 on material.

A runner moves up to two squares forward, forward-diagonally, or sideways, never
backward, and captures one square forward or forward-diagonally. Sideways is what
stops it being trapped against a file; backward is never needed because the
collapse only ever pushes a runner forward.

## What the sims found

Run them: `node tools/final.mjs 30`, `node tools/actions.mjs 24`,
`node tools/combat.mjs 30`, `node tools/shape.mjs 24`.

**1. The centre square cannot hold a prize.** It is the only square the collapse
never reaches, so a unique top prize sitting there is not a prize, it is the win
condition — whoever took the centre queen won 96–100% of games across every board
size and speed tested. Removing her and mirroring the top prize drops that to 67%.

**2. One move a turn is not a game.** This is the finding that matters. The
collapse sets a hard ~12-round clock, and at one move a turn that is twelve
actions to spend on five pieces. Nothing can reach anything. Measured at one
move a turn: a capture was *legal* on 2–17% of turns, the ring killed 5.7 pieces
a game while players killed 0.6, and half of all games were draws.

Raising it to three moves a turn, changing nothing else:

| moves/turn | promotions | capture legal | taken by players | killed by ring | draws |
|---|---|---|---|---|---|
| 1 | 3.6/10 | 7% | 0.6 | 5.7 | 50% |
| 2 | 5.5/10 | 17% | 5.5 | 1.9 | 4% |
| 3 | 5.8/10 | 17% | 7.1 | 0.7 | 4% |
| 4 | 5.3/10 | 17% | 7.1 | 0.3 | 0% |

The ratio inverts from 1:9 to 10:1. At one move a turn the board is the
executioner and the players are spectators; at three they fight and the ring goes
back to being pressure instead of a scythe. Four is not better and drains the
ring of any bite at all.

**3. Everything else we tried was the wrong lever.** Bigger and smaller boards
(9/11/13), faster runners, letting runners capture straight ahead, offsetting the
starting files, doubling the number of runners, flooding the board with 20 chests
instead of 6, and giving each seat a king-substitute "heart" that loses the game
if taken — none of them moved capture availability off 2–17%. The heart made it
*worse*, because a heart in open space can always simply run. The binding
constraint was never geometry or material, it was the move budget.

## Bot results at the locked shape

- competent vs random: **100%** — not a slot machine.
- competent vs the same bot with chest routing switched off: **63%** — the chest
  race is the game, and it is worth about a two-to-one edge rather than the whole
  thing.
- draws 3%, 7.0 captures a game, 0.8 ring kills a game.

Tuning note from `tools/sweep.mjs`: every configuration that ignored chests
finished in the bottom four of a sixteen-way round robin, and *fearing* the
collapse loses — the best safety weight is near zero. The ring is a clock to
spend, not a threat to flee.

## Playing it

```
node server.js     # http://localhost:4173
```

Tap a runner, tap a green dot. Three moves a turn, then the opponent takes
three. `Undo` walks back moves inside your own turn. The two seats are told
apart by a light disc and a dark one rather than by colour alone; dead ground is
struck out rather than recoloured; the ring about to fall is outlined in amber
and the chip names the round it goes.
