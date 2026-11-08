import * as THREE from 'three';

/**
 * A deliberately small, shared material palette.
 *
 * Every city mesh points at one of these singleton materials so the merged
 * world can render in a few dozen draw calls. Colours are sampled from warm
 * Kaohsiung daylight: sand-coloured plaster, glazed teal roofs, coral accents
 * and harbour water.
 */
const standard = (
  color: string,
  options: Partial<THREE.MeshStandardMaterialParameters> = {},
) =>
  new THREE.MeshStandardMaterial({
    color,
    roughness: 0.86,
    metalness: 0,
    envMapIntensity: 0.55,
    ...options,
  });

export const MATERIALS = {
  // Plaster / concrete walls
  plasterCream: standard('#f8ead4', { roughness: 0.94 }),
  plasterSand: standard('#f2ddc2', { roughness: 0.92 }),
  plasterPeach: standard('#f4cfb9', { roughness: 0.9 }),
  plasterMint: standard('#d7e6d5', { roughness: 0.93 }),
  plasterSky: standard('#cfdfe7', { roughness: 0.9 }),
  plasterWhite: standard('#fdf8ee', { roughness: 0.95 }),
  concrete: standard('#d9d1c2', { roughness: 0.96 }),
  concreteShadow: standard('#c3b9a8', { roughness: 0.97 }),

  // Roofs
  roofTerracotta: standard('#b85c45', { roughness: 0.78 }),
  roofClay: standard('#9c5340', { roughness: 0.84 }),
  roofSlate: standard('#65727a', { roughness: 0.72 }),
  roofTeal: standard('#3d6f6b', { roughness: 0.42, metalness: 0.12 }),
  roofGold: standard('#c8973f', { roughness: 0.38, metalness: 0.35 }),
  roofIvory: standard('#efe0c4', { roughness: 0.82 }),

  // Facades / glazing
  glass: standard('#79aeb4', {
    roughness: 0.16,
    metalness: 0.38,
    envMapIntensity: 1.5,
  }),
  glassDark: standard('#416d78', {
    roughness: 0.12,
    metalness: 0.42,
    envMapIntensity: 1.7,
  }),
  glassWarm: standard('#d9b98d', {
    roughness: 0.22,
    metalness: 0.2,
    envMapIntensity: 1.1,
  }),

  // Timber / metal / stone
  wood: standard('#a9764f', { roughness: 0.82 }),
  woodDark: standard('#7b5238', { roughness: 0.86 }),
  metal: standard('#b7c2c4', { roughness: 0.42, metalness: 0.35 }),
  metalDark: standard('#58666b', { roughness: 0.5, metalness: 0.5 }),
  stone: standard('#d6cdbd', { roughness: 0.9 }),
  stoneDark: standard('#a89e8e', { roughness: 0.92 }),

  // Civic accents
  templeRed: standard('#c8503c', { roughness: 0.66 }),
  templeRedDark: standard('#9c3c2f', { roughness: 0.72 }),
  gold: standard('#dfa93f', { roughness: 0.32, metalness: 0.55 }),
  coral: standard('#e99679', { roughness: 0.78 }),
  teal: standard('#4cafa8', { roughness: 0.6 }),
  tealDeep: standard('#2f7f7c', { roughness: 0.62 }),
  cream: standard('#fff7e8', { roughness: 0.9 }),
  ink: standard('#2a4552', { roughness: 0.8 }),

  // Landscape
  grass: standard('#a9ca8d', { roughness: 1 }),
  grassDark: standard('#8fb877', { roughness: 1 }),
  grassWarm: standard('#b9d49a', { roughness: 1 }),
  soil: standard('#c7a67c', { roughness: 1 }),
  sand: standard('#e6d4b2', { roughness: 1 }),
  trunk: standard('#8a6247', { roughness: 0.94 }),
  trunkLight: standard('#a67d58', { roughness: 0.94 }),
  foliageDeep: standard('#4f8a55', { roughness: 0.95, flatShading: true }),
  foliage: standard('#6aa55f', { roughness: 0.95, flatShading: true }),
  foliageLight: standard('#8cbe74', { roughness: 0.95, flatShading: true }),
  foliageTeal: standard('#5c9c7f', { roughness: 0.95, flatShading: true }),
  foliageWarm: standard('#a7b95f', { roughness: 0.95, flatShading: true }),
  reed: standard('#b7c47a', { roughness: 0.95 }),
  lotusLeaf: standard('#7fae6a', {
    roughness: 0.82,
    side: THREE.DoubleSide,
  }),
  lotusFlower: standard('#f2a7bd', { roughness: 0.7 }),
  blossom: standard('#e78aa8', { roughness: 0.8, flatShading: true }),

  // Urban surfaces
  road: standard('#6f7d84', { roughness: 0.98 }),
  roadEdge: standard('#88939a', { roughness: 0.96 }),
  sidewalk: standard('#e6dcc9', { roughness: 0.98 }),
  curb: standard('#c8bda9', { roughness: 0.98 }),
  crosswalk: standard('#f4efe3', { roughness: 0.9 }),
  roadLine: standard('#eadcc0', { roughness: 0.9 }),
  rail: standard('#7d8b91', { roughness: 0.6, metalness: 0.4 }),

  // Vehicles / props
  vehicleCream: standard('#f2e6cf', { roughness: 0.55 }),
  vehicleTeal: standard('#7fb7ad', { roughness: 0.5 }),
  vehicleCoral: standard('#d98469', { roughness: 0.55 }),
  vehicleYellow: standard('#e8c05c', { roughness: 0.55 }),
  vehicleBlue: standard('#7d9fb5', { roughness: 0.55 }),
  tyre: standard('#3c4549', { roughness: 0.9 }),
  lightWarm: standard('#ffd79a', {
    roughness: 0.3,
    emissive: '#ffbe6b',
    emissiveIntensity: 0.55,
  }),
  lightCool: standard('#dff0f2', {
    roughness: 0.3,
    emissive: '#cfeaec',
    emissiveIntensity: 0.4,
  }),
} as const;

export type MaterialKey = keyof typeof MATERIALS;

export const MATERIAL_KEYS = Object.keys(MATERIALS) as MaterialKey[];

/** Shared canvas textures are created lazily on the client only. */
export function createRippleTexture(size = 128) {
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;
  const image = ctx.createImageData(size, size);
  // Deterministic multi-octave sine interference -> soft ripple normal map.
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const u = (x / size) * Math.PI * 2;
      const v = (y / size) * Math.PI * 2;
      const h =
        Math.sin(u * 3 + Math.cos(v * 2) * 0.8) * 0.5 +
        Math.sin(v * 5 + Math.sin(u * 2) * 0.6) * 0.3 +
        Math.sin((u + v) * 7) * 0.2;
      const nx = Math.cos(h * 3) * 0.35;
      const ny = Math.sin(h * 3) * 0.35;
      const i = (y * size + x) * 4;
      image.data[i] = 128 + nx * 127;
      image.data[i + 1] = 128 + ny * 127;
      image.data[i + 2] = 255;
      image.data[i + 3] = 255;
    }
  }
  ctx.putImageData(image, 0, 0);
  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(6, 4);
  return texture;
}

export function createGroundNoiseTexture(size = 128) {
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, size, size);
  let seed = 1337;
  const random = () => {
    seed = (seed * 1664525 + 1013904223) % 4294967296;
    return seed / 4294967296;
  };
  for (let i = 0; i < 900; i += 1) {
    const alpha = 0.04 + random() * 0.07;
    ctx.fillStyle = `rgba(90, 110, 80, ${alpha})`;
    const radius = 1 + random() * 2.4;
    ctx.beginPath();
    ctx.arc(random() * size, random() * size, radius, 0, Math.PI * 2);
    ctx.fill();
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(18, 14);
  return texture;
}
