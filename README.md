<img src="assets/icon.svg" width="64" height="64" alt="">

# Gearhold

A lane defense game for the browser. Blobs ooze in from the right. Build bots
to keep them out of the Core on the left. Survive 10 waves to win.

## Play

Open `index.html` in a browser. No install, no build, no server.

1. Pick a bot from the top bar.
2. Click a floor tile to build it.
3. Bots cost sparks. Dynamos make more sparks.

| Key | Does |
| --- | --- |
| `1`-`6` | Pick a bot |
| `W` | Recycle tool (scrap a bot, get half back) |
| `Esc` or right click | Put the tool down |
| `P` or `Space` | Pause |
| `F` | Fast (2x) |
| `M` | Mute |

## Bots

| Bot | Cost | Job |
| --- | --- | --- |
| Dynamo | 50 | Makes sparks |
| Pitcher | 100 | Throws bolts down its lane |
| Bulwark | 75 | Tough shield that blocks blobs |
| Arc Coil | 175 | Zaps up to 3 nearby blobs across 3 lanes |
| Springer | 50 | Punts a blob far back, 3 uses |
| Fuse Bot | 150 | Blows up a 3x3 area |

## Code

- `src/sim.js` - the rules. No drawing, so it also runs in Node.
- `src/render.js` - everything drawn on the canvas.
- `src/audio.js` - sound effects, made on the spot with Web Audio.
- `src/main.js` - game loop, mouse, touch and keyboard.

## Test

```
node --test
```

Created in [T3 Code](https://t3.codes).
