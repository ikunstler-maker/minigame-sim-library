import { Application, Graphics } from 'pixi.js';
import { loadGameFonts, makeNumber, type NumberKind } from './numberStyles';

interface Row {
  kind: NumberKind;
  text: string;
  heightPx: number;
  /** Flat backdrop approximating the area behind the number in the video. */
  bg: number;
}

const ROWS: Row[] = [
  { kind: 'plate', text: '25,000.00', heightPx: 38, bg: 0xf6b020 },
  { kind: 'coin', text: '150.00', heightPx: 44, bg: 0xf4b020 },
  { kind: 'whirl', text: '400.00', heightPx: 60, bg: 0xff6a10 },
  { kind: 'counter', text: '550.00', heightPx: 48, bg: 0xb01408 },
  { kind: 'bigwin', text: '5,018.00', heightPx: 104, bg: 0xa01005 },
  { kind: 'ui', text: '7,800.00', heightPx: 28, bg: 0x101010 },
  { kind: 'title', text: 'SIZZLING', heightPx: 80, bg: 0xc01008 },
];

/**
 * Dev page: for every number kind shows the reference crop (left) and the
 * PixiJS rendering (right) with a cap-height guide, so styles can be tuned by eye.
 */
async function main(): Promise<void> {
  await loadGameFonts();
  const host = document.getElementById('rows')!;
  for (const row of ROWS) {
    const wrap = document.createElement('div');
    wrap.className = 'row';
    const label = document.createElement('div');
    label.textContent = `${row.kind} (${row.heightPx}px)`;
    const img = document.createElement('img');
    img.src = `/private/coin-volcano/plate/font-ref/${row.kind}.png`;
    wrap.append(label, img);

    const app = new Application();
    await app.init({ width: 640, height: Math.ceil(row.heightPx * 2.2) + 20, background: row.bg, antialias: true });
    const h = app.screen.height;
    const guide = new Graphics()
      .moveTo(0, h / 2 - row.heightPx / 2)
      .lineTo(640, h / 2 - row.heightPx / 2)
      .moveTo(0, h / 2 + row.heightPx / 2)
      .lineTo(640, h / 2 + row.heightPx / 2)
      .stroke({ color: 0x00ffff, width: 1, alpha: 0.6 });
    const num = makeNumber(row.kind, row.text, row.heightPx);
    num.position.set(320, h / 2);
    app.stage.addChild(guide, num);
    wrap.append(app.canvas);
    host.append(wrap);
  }
  document.body.dataset.ready = '1';
}

void main();
