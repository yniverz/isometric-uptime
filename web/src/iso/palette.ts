/** Colour palettes for the isometric world, light and dark. */

export function hexToRgb(hex: string): [number, number, number] {
  const h = hex.replace('#', '');
  const n = parseInt(h.length === 3 ? h.split('').map((c) => c + c).join('') : h, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

/** Mix towards white (amt > 0) or black (amt < 0). */
export function shade(hex: string, amt: number): string {
  const [r, g, b] = hexToRgb(hex);
  const t = amt < 0 ? 0 : 255;
  const k = Math.abs(amt);
  const m = (c: number) => Math.round(c + (t - c) * k);
  return '#' + [m(r), m(g), m(b)].map((c) => c.toString(16).padStart(2, '0')).join('');
}

export function mix(a: string, b: string, t: number): string {
  const A = hexToRgb(a);
  const B = hexToRgb(b);
  return '#' + A.map((c, i) => Math.round(c + (B[i] - c) * t).toString(16).padStart(2, '0')).join('');
}

export interface Palette {
  dark: boolean;
  // ground
  grass: string;
  grassAlt: string;
  urban: string;
  urbanAlt: string;
  sand: string;
  sandAlt: string;
  snow: string;
  snowAlt: string;
  soil: string;
  rock: string;
  path: string;
  shadow: string;
  // vegetation & props
  leaf: string;
  leafAlt: string;
  pine: string;
  trunk: string;
  lamp: string;
  lampGlow: string;
  // floors
  floorRaised: string;
  floorLine: string;
  vent: string;
  ventDot: string;
  wood: string;
  woodLine: string;
  carpet: string;
  carpetLine: string;
  concrete: string;
  concreteLine: string;
  tile: string;
  tileLine: string;
  slabSide: string;
  // walls
  wallInner: string;
  wallCut: string;
  window: string;
  windowFrame: string;
  // building exteriors
  houseWall: string;
  houseRoof: string;
  houseTrim: string;
  door: string;
  officeWall: string;
  officeGlass: string;
  officeMullion: string;
  factoryWall: string;
  factoryRib: string;
  factoryRoof: string;
  factoryDoor: string;
  stripe: string;
  // equipment (from the reference artwork)
  rackTop: string;
  rackFrame: string;
  rackSide: string;
  rackInner: string;
  rackDark: string;
  dev: string;
  devTop: string;
  devSide: string;
  devVent: string;
  devLight: string;
  devDark: string;
  devSilver: string;
  screen: string;
  screenDark: string;
  screenGlow: string;
  cableYellow: string;
  cableCyan: string;
  cableRed: string;
  furniture: string;
  furnitureDark: string;
  plastic: string;
  pcb: string;
  // ui in-world
  text: string;
  textMuted: string;
  labelBg: string;
  labelStroke: string;
  holo: string;
  holoFill: string;
  select: string;
}

export const LIGHT: Palette = {
  dark: false,
  grass: '#BFDDB2',
  grassAlt: '#B5D6A7',
  urban: '#CCD6E1',
  urbanAlt: '#C3CEDA',
  sand: '#EADCB8',
  sandAlt: '#E3D3AA',
  snow: '#EEF3F8',
  snowAlt: '#E5ECF3',
  soil: '#A89078',
  rock: '#8E9FB6',
  path: '#E4E9EF',
  shadow: '#5E6E8C',
  leaf: '#86C08F',
  leafAlt: '#6FAE7E',
  pine: '#5E9E78',
  trunk: '#9C7A5B',
  lamp: '#56668E',
  lampGlow: '#FFE7A8',
  floorRaised: '#C4D1DF',
  floorLine: '#B4C3D4',
  vent: '#B2C1D3',
  ventDot: '#9DAEC3',
  wood: '#DCC6A5',
  woodLine: '#CBB18D',
  carpet: '#B8C4D9',
  carpetLine: '#AEBBD1',
  concrete: '#CDD3DB',
  concreteLine: '#BCC4CE',
  tile: '#E2E8EF',
  tileLine: '#CFD8E2',
  slabSide: '#A3B3C8',
  wallInner: '#E9EEF4',
  wallCut: '#56668E',
  window: '#A9CBEA',
  windowFrame: '#F7F9FC',
  houseWall: '#F1E8DA',
  houseRoof: '#D9796B',
  houseTrim: '#FFFFFF',
  door: '#8B6B57',
  officeWall: '#DDE5EE',
  officeGlass: '#86ADD8',
  officeMullion: '#EEF3F8',
  factoryWall: '#C9CFD8',
  factoryRib: '#B6BDC8',
  factoryRoof: '#9AA6B6',
  factoryDoor: '#8E99AA',
  stripe: '#E86A5C',
  rackTop: '#63739A',
  rackFrame: '#39476A',
  rackSide: '#323D59',
  rackInner: '#1D2437',
  rackDark: '#2A3450',
  dev: '#7084AE',
  devTop: '#93A5CC',
  devSide: '#4B5B82',
  devVent: '#556893',
  devLight: '#DDE6F5',
  devDark: '#39476A',
  devSilver: '#C9D2DE',
  screen: '#5CC6DA',
  screenDark: '#3A8FA2',
  screenGlow: '#8FE3EE',
  cableYellow: '#FFCD6B',
  cableCyan: '#5CC6DA',
  cableRed: '#FF7F7F',
  furniture: '#E3D5C1',
  furnitureDark: '#B9A68D',
  plastic: '#F4F6F9',
  pcb: '#3E9F6E',
  text: '#26314D',
  textMuted: '#5D6C8C',
  labelBg: 'rgba(255,255,255,0.92)',
  labelStroke: 'rgba(38,49,77,0.12)',
  holo: '#3FB5CF',
  holoFill: 'rgba(92,198,218,0.14)',
  select: '#5B8CFF',
};

export const DARK: Palette = {
  ...LIGHT,
  dark: true,
  grass: '#2F4A3C',
  grassAlt: '#2B4437',
  urban: '#2C3648',
  urbanAlt: '#283143',
  sand: '#4A4434',
  sandAlt: '#443E2F',
  snow: '#3A4557',
  snowAlt: '#354051',
  soil: '#3B3230',
  rock: '#252D3F',
  path: '#3A4458',
  shadow: '#000000',
  leaf: '#3F7A5A',
  leafAlt: '#346A4D',
  pine: '#2F6A4E',
  trunk: '#5A4636',
  lamp: '#8392B8',
  lampGlow: '#FFD878',
  floorRaised: '#2E394F',
  floorLine: '#27324A',
  vent: '#344059',
  ventDot: '#26304A',
  wood: '#4A3F36',
  woodLine: '#41372F',
  carpet: '#2F3950',
  carpetLine: '#2A3348',
  concrete: '#333B4B',
  concreteLine: '#2D3444',
  tile: '#38435A',
  tileLine: '#303A50',
  slabSide: '#1E2536',
  wallInner: '#3A4558',
  wallCut: '#161C2B',
  window: '#6C8FC2',
  windowFrame: '#56627D',
  houseWall: '#5B5550',
  houseRoof: '#8C4A44',
  houseTrim: '#6C6660',
  door: '#4D3B31',
  officeWall: '#44506A',
  officeGlass: '#4B6E9E',
  officeMullion: '#56627D',
  factoryWall: '#48505F',
  factoryRib: '#3E4654',
  factoryRoof: '#3A4353',
  factoryDoor: '#353D4B',
  stripe: '#B8544A',
  furniture: '#5A5048',
  furnitureDark: '#453D36',
  plastic: '#6B7488',
  text: '#E6ECF7',
  textMuted: '#9AA8C4',
  labelBg: 'rgba(22,29,45,0.92)',
  labelStroke: 'rgba(255,255,255,0.10)',
  holo: '#5CD6EE',
  holoFill: 'rgba(92,214,238,0.10)',
  select: '#7FA6FF',
};

export function groundColors(pal: Palette, theme: string): { top: string; alt: string } {
  switch (theme) {
    case 'urban':
      return { top: pal.urban, alt: pal.urbanAlt };
    case 'sand':
      return { top: pal.sand, alt: pal.sandAlt };
    case 'snow':
      return { top: pal.snow, alt: pal.snowAlt };
    default:
      return { top: pal.grass, alt: pal.grassAlt };
  }
}
