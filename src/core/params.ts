// URL flags.
const q = new URLSearchParams(location.search);

export const params = {
  story: q.get('story') === '1',
  hideui: q.get('hideui') === '1',
  capture: q.get('capture') === '1',
  aspect: q.get('aspect') === '4x5' ? '4x5' : '16x9',
  world: q.get('world') === 'galaxy' ? 'galaxy' : 'landscape',
  test: q.get('test') ?? '',
  debug: q.get('debug') === '1',
  lowQuality: q.get('q') === 'low',
  /** Start time for story playback (seconds). */
  t: Number(q.get('t') ?? 0) || 0,
  fps: Number(q.get('fps') ?? 60) || 60,
  /** Debug camera: x,y,z,tx,ty,tz in world units. */
  cam: (q.get('cam') ?? '').split(',').filter(Boolean).map(Number),
} as const;

export type Params = typeof params;
