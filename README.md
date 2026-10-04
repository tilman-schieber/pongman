# PONGMAN

Pong, Pac-Man, Space Invaders and a bit of Donkey Kong in one arcade cabinet, built in TypeScript with no runtime dependencies. Runs entirely in the browser. A sibling of [Scales](https://github.com/tilman-schieber/scales) and [Snackman](https://github.com/tilman-schieber/snackman): same screen, same font, same high score tables. A recreation of kingPenguin's [Pacapong](https://kingpenguin.itch.io/pacapong) (2015), with the rules spelled out.

The ball is Pongman. He sticks to your paddle, then he is shot across a maze that is new for every match — into an opening, or off the wall straight back at you. Whoever shot him **steers** him: while he flies, that paddle's moves are his turns; let go and he heads for the other side. The dots he eats are yours. Run him into a ghost and he dies, and the other side has him on their paddle at once.

The bar at the top is a tug of war: everything you score pulls Pongman your way, and a goal — past the other paddle — is the big pull. Get him to your end and you win.

## Modes

| Mode | Who |
| --- | --- |
| 1 PLAYER | You are yellow, on the left. The CPU plays red: EASY, NORMAL or HARD. Your points go on the high score table of that difficulty, win or lose. |
| 2 PLAYERS | Yellow plays W and S, red plays the arrow keys. Or one gamepad each. |

MATCH sets how many goals ahead wins (3, 5, 7 or 11; dots and the rest count in goal fractions), SPEED how fast he flies at the shot. He gets faster with every catch of a rally.

## The court

| Thing | What it does |
| --- | --- |
| The maze | Corridors one tile wide on a lattice, mirrored left to right, no dead ends, a ghost pen in the middle, and three or four openings onto each lane. Generated afresh for every match with Snackman's generator |
| Dots | 10 each, to whoever is steering. Clear the maze for 1000 and it fills up again |
| Ghosts | Three pale ghosts roam the maze. Run into one and Pongman dies: it costs 100, and the other side gets him. Eaten ghosts go home to the pen and come back out |
| Power pellets | In the corners. The ghosts turn blue and can be eaten: 200, 400, 800, 1600 |
| Aliens | Land in the maze now and then, up to three at once. Eat one (100) and six invaders drop into the **other** lane |
| Invaders | They bomb the paddle in their lane; a hit stuns it for a moment. The paddle fires back by itself, 50 an invader |
| The gorilla | Climbs up at the bottom now and then, beats his chest and lobs five barrels over the maze at the paddles. A mark shows where each comes down; one on your paddle stuns it and costs 50 |
| Goal | 500, and a whole goal's pull on the bar |

## Controls

| Key | Action |
| --- | --- |
| W / S | Yellow paddle (and steering, while yellow's shot is flying) |
| Up / Down | Red paddle. Alone, these work for yellow too |
| A / D, Left / Right | Menus |
| Enter / Esc | Start / pause |
| Backspace | Quit to menu (while paused) |
| M | Music on/off |
| H | High scores (title screen) |

Gamepads: the first is yellow, the second red; stick or d-pad, any button for Enter. On a touch screen, drag on your half of the court; a tap is Enter.

## The CPU

It tracks the ball with a delay and some error, shoots at an opening, and when it steers it judges each possible turn by what lies ahead: dots, aliens, ghosts, and the way out past your paddle. EASY mostly flies straight; HARD does all of that nearly every time.

## Music

A chiptune loop over four chords. Every match gets its own melody and key; instruments join in as the bar tips, and it breaks into a racing arpeggio while the ghosts are blue. MUSIC in the menu turns it on or off, and M mutes it at any time.

High scores are kept per CPU difficulty in the browser's local storage.

The gorilla sprite was drawn with [PixelLab](https://pixellab.ai); everything else is hand-placed pixels in `src/render.ts`.

## Development

```sh
npm install
npm run dev
npm run build
```

In `npm run dev`, `game`, `input` and `step(frames, held, draw)` are on `window` for poking at a match from the console.
