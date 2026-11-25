import { Container, FillGradient, Graphics, Sprite, Text, type Texture } from 'pixi.js';
import { PT, STAGE_H, STAGE_W } from '../config';
import { IOS_FONT } from './ios/StatusBar';

/** Placeholder app screen shown after the open animation until the game plugin lands (Stage 3). */
export class GameStub extends Container {
  constructor(title: string, icon: Texture | null) {
    super();
    const grad = new FillGradient({
      type: 'linear', start: { x: 0, y: 0 }, end: { x: 0, y: 1 }, textureSpace: 'local',
      colorStops: [{ offset: 0, color: '#5b1a9e' }, { offset: 1, color: '#22063f' }],
    });
    this.addChild(new Graphics().rect(0, 0, STAGE_W, STAGE_H).fill(grad));
    if (icon) {
      const s = new Sprite(icon);
      s.anchor.set(0.5);
      s.width = s.height = 180 * PT;
      s.position.set(STAGE_W / 2, STAGE_H * 0.42);
      this.addChild(s);
    }
    const t = new Text({ text: title, style: { fontFamily: IOS_FONT, fontSize: 28 * PT, fontWeight: '700', fill: 0xffffff } });
    t.anchor.set(0.5);
    t.position.set(STAGE_W / 2, STAGE_H * 0.42 + 120 * PT);
    this.addChild(t);
  }
}
