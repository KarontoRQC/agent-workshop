export type ShapeMode = 'sphere' | 'wave' | 'galaxy';
export type PaletteMode = 'aurora' | 'solar' | 'ember' | 'mono';

export type VoiceCommand =
  | { kind: 'shape'; shape: ShapeMode; label: string }
  | { kind: 'palette'; palette: PaletteMode; label: string }
  | { kind: 'burst'; label: string }
  | { kind: 'calm'; label: string }
  | { kind: 'faster'; label: string }
  | { kind: 'slower'; label: string }
  | { kind: 'pause'; label: string }
  | { kind: 'resume'; label: string }
  | { kind: 'random'; label: string }
  | { kind: 'unknown'; label: string };

export const shapeLabels: Record<ShapeMode, string> = {
  sphere: 'sphere',
  wave: 'wave',
  galaxy: 'galaxy',
};

export const paletteLabels: Record<PaletteMode, string> = {
  aurora: 'aurora',
  solar: 'solar',
  ember: 'ember',
  mono: 'mono',
};

export const paletteColors: Record<PaletteMode, string[]> = {
  aurora: ['#31f2c3', '#ff6f61', '#f5c451', '#f7faf7'],
  solar: ['#f7d35f', '#ff7d4f', '#51d8c8', '#f5f0e7'],
  ember: ['#ff5d4d', '#f2a33c', '#37d7b9', '#e9f0ed'],
  mono: ['#f4fbf7', '#96fff0', '#d5a84d', '#80908d'],
};

export const commandChips = [
  'sphere',
  'wave',
  'galaxy',
  'burst',
  'calm',
  'faster',
  'slower',
  'random',
];

export function parseVoiceCommand(rawCommand: string): VoiceCommand {
  const text = rawCommand.trim().toLowerCase();

  if (!text) {
    return { kind: 'unknown', label: 'empty command' };
  }

  if (/(sphere|ball|orb|球体|球|圆)/i.test(text)) {
    return { kind: 'shape', shape: 'sphere', label: 'sphere' };
  }

  if (/(wave|ocean|ripple|波浪|海浪|水波|波)/i.test(text)) {
    return { kind: 'shape', shape: 'wave', label: 'wave' };
  }

  if (/(galaxy|spiral|stars|星系|银河|旋涡|漩涡)/i.test(text)) {
    return { kind: 'shape', shape: 'galaxy', label: 'galaxy' };
  }

  if (/(burst|explode|scatter|boom|爆发|爆炸|炸开|扩散)/i.test(text)) {
    return { kind: 'burst', label: 'burst' };
  }

  if (/(calm|quiet|soft|平静|冷静|稳定|柔和|慢下来)/i.test(text)) {
    return { kind: 'calm', label: 'calm' };
  }

  if (/(faster|speed up|quick|加速|快一点|更快|快)/i.test(text)) {
    return { kind: 'faster', label: 'faster' };
  }

  if (/(slower|slow down|reduce|减速|慢一点|更慢|慢)/i.test(text)) {
    return { kind: 'slower', label: 'slower' };
  }

  if (/(pause|stop|hold|暂停|停下|停止)/i.test(text)) {
    return { kind: 'pause', label: 'pause' };
  }

  if (/(resume|play|continue|继续|播放|恢复)/i.test(text)) {
    return { kind: 'resume', label: 'resume' };
  }

  if (/(random|shuffle|switch|随机|换一个|切换)/i.test(text)) {
    return { kind: 'random', label: 'random' };
  }

  if (/(aurora|teal|极光|青绿)/i.test(text)) {
    return { kind: 'palette', palette: 'aurora', label: 'aurora' };
  }

  if (/(solar|gold|sun|金色|太阳|暖光)/i.test(text)) {
    return { kind: 'palette', palette: 'solar', label: 'solar' };
  }

  if (/(ember|fire|coral|火|珊瑚|橘红)/i.test(text)) {
    return { kind: 'palette', palette: 'ember', label: 'ember' };
  }

  if (/(mono|white|black|单色|白色)/i.test(text)) {
    return { kind: 'palette', palette: 'mono', label: 'mono' };
  }

  return { kind: 'unknown', label: 'unknown' };
}

export function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}
