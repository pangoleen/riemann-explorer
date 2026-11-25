import { describe, expect, it } from 'vitest';
import { StoryPlayer } from '../src/story/player';
import { captions, DURATION } from '../src/story/timeline';

describe('story timeline', () => {
  const p = new StoryPlayer();
  it('is deterministic', () => {
    const a = p.state(23.456);
    const b = p.state(23.456);
    expect(a.pos.toArray()).toEqual(b.pos.toArray());
  });
  it('camera speed has no jumps between consecutive 60 fps frames', () => {
    const dt = 1 / 60;
    let prev = p.state(0).pos;
    let prevV = -1;
    let worst = 0;
    let worstT = 0;
    for (let f = 1; f <= DURATION * 60; f++) {
      const cur = p.state(f * dt).pos;
      const v = cur.distanceTo(prev) / dt;
      if (prevV >= 0) {
        const jump = Math.abs(v - prevV);
        if (jump > worst) { worst = jump; worstT = f * dt; }
      }
      prevV = v;
      prev = cur;
    }
    console.log(`largest frame-to-frame speed change: ${worst.toFixed(2)} units/s at t=${worstT.toFixed(2)}`);
    expect(worst).toBeLessThan(3);
  });
  it('captions stay inside the video and do not overlap', () => {
    for (let i = 0; i < captions.length; i++) {
      expect(captions[i].to).toBeLessThanOrEqual(DURATION);
      if (i) expect(captions[i].from).toBeGreaterThan(captions[i - 1].to);
    }
  });
});
