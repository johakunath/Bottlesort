/* ---------------- palette ----------------
   Each entry = [bright face, shadow side]; used as a b→a→b across the band. */
/* palettes retuned for mobile legibility: each colour sits on a distinct hue with
   varied lightness so neighbours never read as the same colour on a small screen */
const APO_COLORS = [
  ['#ff7a85', '#d4263d'], // cherry  (red)
  ['#ffb24d', '#e0710f'], // tangerine (orange)
  ['#ffe24d', '#d6ad00'], // lemon   (yellow)
  ['#7fd96a', '#2f9e3f'], // lime    (green)
  ['#4fd6c4', '#0e9488'], // teal    (cyan)
  ['#6aa8ff', '#2459d6'], // blue
  ['#b98cff', '#6a2fd6'], // violet  (purple)
  ['#ff8fd6', '#d63f97'], // pink    (magenta)
  ['#c98f5e', '#7c4a26']  // mocha   (brown)
];
const NEON_COLORS = [
  ['#ff5d6c', '#c8102e'], // cherry  (red)
  ['#ff9f3a', '#d65a00'], // tangerine (orange)
  ['#ffe23d', '#c9a200'], // lemon   (yellow)
  ['#5de86a', '#109a2f'], // lime    (green)
  ['#2fe0d0', '#058a80'], // teal    (cyan)
  ['#4f9bff', '#1043d6'], // blue
  ['#b46bff', '#6a1fd6'], // violet  (purple)
  ['#ff5db8', '#c8127a'], // pink    (magenta)
  ['#d8a76a', '#8a5a2c']  // sand    (brown)
];
const TIDE_COLORS = [
  ['#ff7f73', '#c63f45'], // coral   (red)
  ['#ffbd67', '#d46a24'], // amber   (orange)
  ['#f7e978', '#c9a93b'], // shell   (yellow)
  ['#84d86d', '#2f9a55'], // kelp    (green)
  ['#54d9c5', '#138b84'], // glass   (cyan)
  ['#69b8ff', '#2a66c7'], // lagoon  (blue)
  ['#b28dff', '#6650c6'], // lilac   (purple)
  ['#ff91b7', '#c94678'], // anemone (pink)
  ['#c8a06a', '#74603f']  // drift   (brown)
];


const COLOR_NAMES = ['cherry', 'tangerine', 'lemon', 'lime', 'teal', 'blue', 'violet', 'pink', 'mocha'];

/* ---------------- bottle shapes ----------------
   Every shape: viewBox 100 x vbH. pivot = element center (CSS rotate origin).
   B/T = liquid bottom/top, box = interior bounds for tilt pooling. */
const SHAPES = {
  round: {
    vbH: 240, aspect: 2.4, mouthFrac: 17 / 240, surfRx: 31,
    interior: 'M36,24 L36,34 C36,46 18,46 18,64 L18,208 Q18,224 34,224 L66,224 Q82,224 82,208 L82,64 C82,46 64,46 64,34 L64,24 Z',
    outline: 'M33,21 L33,34 C33,43 15,44 15,64 L15,208 Q15,227 34,227 L66,227 Q85,227 85,208 L85,64 C85,44 67,43 67,34 L67,21',
    lip: { x: 30, y: 11, w: 40, h: 13, rx: 6, mouthRx: 15, mouthRy: 4, mouthCy: 17 },
    B: 224, T: 50, box: [18, 82, 24, 224],
    cork: { x: 31, y: 10, w: 38, h: 17, r: 6 },
    gloss: [
      { x: 23, y: 66, w: 7, h: 139, rx: 3.5, o: 0.65 },
      { x: 73, y: 72, w: 4, h: 129, rx: 2, o: 0.35 },
      { x: 38, y: 25, w: 4, h: 11, rx: 2, o: 0.55 }
    ]
  },
  classic: {
    vbH: 240, aspect: 2.4, mouthFrac: 20 / 240, surfRx: 26,
    interior: 'M38,26 L38,54 C38,64 22,68 22,84 L22,204 Q22,224 42,224 L58,224 Q78,224 78,204 L78,84 C78,68 62,64 62,54 L62,26 Z',
    outline: 'M35,22 L35,53 C35,63 19,67 19,84 L19,205 Q19,227 42,227 L58,227 Q81,227 81,205 L81,84 C81,67 65,63 65,53 L65,22',
    lip: { x: 31, y: 14, w: 38, h: 12, rx: 6, mouthRx: 14, mouthRy: 3.4, mouthCy: 20 },
    B: 224, T: 62, box: [22, 78, 26, 224],
    gloss: [
      { x: 27, y: 92, w: 9, h: 110, rx: 4.5, o: 0.55 },
      { x: 68, y: 96, w: 3.5, h: 92, rx: 1.7, o: 0.25 },
      { x: 40, y: 30, w: 5, h: 22, rx: 2.5, o: 0.5 }
    ]
  },
  tall: {
    vbH: 320, aspect: 3.2, mouthFrac: 18 / 320, surfRx: 21,
    interior: 'M40,24 L40,50 C40,58 30,62 30,74 L30,286 Q30,304 50,304 Q70,304 70,286 L70,74 C70,62 60,58 60,50 L60,24 Z',
    outline: 'M37,20 L37,49 C37,57 27,61 27,74 L27,287 Q27,307 50,307 Q73,307 73,287 L73,74 C73,61 63,57 63,49 L63,20',
    lip: { x: 34, y: 12, w: 32, h: 11, rx: 5.5, mouthRx: 12, mouthRy: 3, mouthCy: 18 },
    B: 304, T: 64, box: [30, 70, 24, 304],
    gloss: [
      { x: 34, y: 84, w: 8, h: 190, rx: 4, o: 0.55 },
      { x: 61, y: 90, w: 3, h: 160, rx: 1.5, o: 0.25 },
      { x: 42, y: 28, w: 4.5, h: 18, rx: 2.2, o: 0.5 }
    ]
  },
  flask: {
    vbH: 240, aspect: 2.4, mouthFrac: 20 / 240, surfRx: 30, magic: true,
    interior: 'M42,26 L42,131 A40,40 0 1,0 58,131 L58,26 Z',
    outline: 'M39,22 L39,129 A43,43 0 1,0 61,129 L61,22',
    lip: { x: 35, y: 14, w: 30, h: 12, rx: 6, mouthRx: 11, mouthRy: 3, mouthCy: 20 },
    B: 210.2, T: 45, box: [10, 90, 26, 210],
    cork: { x: 35, y: 12, w: 30, h: 16, r: 5 },
    label: { x: 30, y: 150, w: 40, h: 42, rx: 18 },
    gloss: [
      { x: 26, y: 150, w: 10, h: 44, rx: 5, o: 0.5 },
      { x: 44, y: 32, w: 5, h: 60, rx: 2.5, o: 0.45 }
    ],
    sparkle: [[33, 146], [70, 186], [58, 158]]
  }
};
/* Towers: the round glass extended downwards. The bottom B is chosen so one
   tower segment holds exactly the interior area of one round segment
   (B = 224 + (capacity - 4) * roundUnitArea / 64; see SHAPE_GEO in pour-physics). */
const TOWER_BOTTOM = { 8: 396, 12: 568 };
function towerShapeName(capacity) { return capacity === 12 ? 'tower' : 'tower' + capacity; }
function isTowerShape(name) { return typeof name === 'string' && name.startsWith('tower'); }
function towerShape(B) {
  const vbH = B + 16;
  return {
    vbH, aspect: vbH / 100, mouthFrac: 17 / vbH, surfRx: 31,
    interior: `M36,24 L36,34 C36,46 18,46 18,64 L18,${B - 16} Q18,${B} 34,${B} L66,${B} Q82,${B} 82,${B - 16} L82,64 C82,46 64,46 64,34 L64,24 Z`,
    outline: `M33,21 L33,34 C33,43 15,44 15,64 L15,${B - 16} Q15,${B + 3} 34,${B + 3} L66,${B + 3} Q85,${B + 3} 85,${B - 16} L85,64 C85,44 67,43 67,34 L67,21`,
    lip: { x: 30, y: 11, w: 40, h: 13, rx: 6, mouthRx: 15, mouthRy: 4, mouthCy: 17 },
    B, T: 50, box: [18, 82, 24, B],
    cork: { x: 31, y: 10, w: 38, h: 17, r: 6 },
    gloss: [
      { x: 23, y: 66, w: 7, h: B - 87, rx: 3.5, o: 0.65 },
      { x: 73, y: 72, w: 4, h: B - 99, rx: 2, o: 0.35 },
      { x: 38, y: 25, w: 4, h: 11, rx: 2, o: 0.55 }
    ]
  };
}
for (const cap of [8, 12]) SHAPES[towerShapeName(cap)] = towerShape(TOWER_BOTTOM[cap]);

/* cork + parchment-label furniture per shape (Apothecary skin) */
SHAPES.classic.cork = { x: 33, y: 13, w: 34, h: 18, r: 6 };
SHAPES.classic.label = { x: 29, y: 150, w: 42, h: 54, rx: 4 };
SHAPES.tall.cork = { x: 34, y: 11, w: 32, h: 16, r: 5 };
SHAPES.tall.label = { x: 34, y: 196, w: 32, h: 76, rx: 4 };


export { APO_COLORS, NEON_COLORS, TIDE_COLORS, COLOR_NAMES, SHAPES, TOWER_BOTTOM, towerShapeName, isTowerShape };
