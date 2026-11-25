import { Container, Graphics, Text } from 'pixi.js';
import { STAGE_H, STAGE_W, type Preset } from '../config';
import type { AudioBus } from '../audio/AudioBus';

/**
 * Stage 1 test scene: status bar with clock, a bouncing coin and a timer.
 * Proves that animation + audio reach the recorded file. Replaced in Stage 2.
 */
export class TestScene extends Container {
  private coin = new Graphics();
  private timer: Text;
  private elapsed = 0;
  private lastBeepSecond = -1;

  constructor(private readonly preset: Preset, private readonly audio: AudioBus) {
    super();
    const bg = new Graphics().rect(0, 0, STAGE_W, STAGE_H).fill(preset.background);
    this.addChild(bg);

    const clock = new Text({
      text: preset.statusBar.time,
      style: { fill: '#ffffff', fontFamily: '-apple-system, Helvetica, Arial', fontSize: 50, fontWeight: '600' },
    });
    clock.position.set(110, 48);
    this.addChild(clock);

    this.coin.circle(0, 0, 140).fill('#f5b400').circle(0, 0, 110).fill('#ffd54a');
    this.coin.position.set(STAGE_W / 2, STAGE_H / 2);
    this.addChild(this.coin);

    this.timer = new Text({
      text: '0.0 s',
      style: { fill: '#ffffff', fontFamily: 'Arial', fontSize: 72, fontWeight: '700' },
    });
    this.timer.anchor.set(0.5);
    this.timer.position.set(STAGE_W / 2, STAGE_H - 360);
    this.addChild(this.timer);

    const hint = new Text({
      text: 'TEST TAKE · tap clock ×3 to finish',
      style: { fill: '#ffffffaa', fontFamily: 'Arial', fontSize: 36 },
    });
    hint.anchor.set(0.5);
    hint.position.set(STAGE_W / 2, STAGE_H - 260);
    this.addChild(hint);
  }

  /** Advance the animation. @param dtMs frame delta in milliseconds */
  update(dtMs: number): void {
    this.elapsed += dtMs / 1000;
    const t = this.elapsed;
    this.coin.y = STAGE_H / 2 - Math.abs(Math.sin(t * 2.4)) * 420;
    this.coin.scale.x = Math.cos(t * 3);
    this.timer.text = `${t.toFixed(1)} s`;
    const sec = Math.floor(t);
    if (this.preset.testTone && sec !== this.lastBeepSecond) {
      this.lastBeepSecond = sec;
      this.audio.beep(sec % 4 === 0 ? 1320 : 880);
    }
  }
}
