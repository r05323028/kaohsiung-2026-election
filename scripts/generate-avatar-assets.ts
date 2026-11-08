import { createHash } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import * as THREE from 'three';
import { GLTFExporter } from 'three/examples/jsm/exporters/GLTFExporter.js';

// Three's browser-oriented exporter uses FileReader for Blob conversion. Keep the
// generator deterministic and offline by providing the smallest Node-compatible
// adapter instead of adding a browser runtime dependency.
if (typeof globalThis.FileReader === 'undefined') {
  class NodeFileReader {
    result: ArrayBuffer | string | null = null;
    onloadend: (() => void) | null = null;

    readAsArrayBuffer(blob: Blob) {
      void blob.arrayBuffer().then((buffer) => {
        this.result = buffer;
        this.onloadend?.();
      });
    }

    readAsDataURL(blob: Blob) {
      void blob.arrayBuffer().then((buffer) => {
        const encoded = Buffer.from(buffer).toString('base64');
        this.result = `data:${blob.type || 'application/octet-stream'};base64,${encoded}`;
        this.onloadend?.();
      });
    }
  }
  Object.assign(globalThis, { FileReader: NodeFileReader });
}

const rootDir = process.cwd();
const publicDir = path.join(rootDir, 'public/assets/avatars');
const manifestPath = path.join(rootDir, 'data/avatars/manifest.json');
const snapshotDate = process.env.AVATAR_SNAPSHOT_DATE ?? '2026-11-06';
const generatedAt = `${snapshotDate}T00:00:00.000Z`;
const animationNames = ['Idle', 'Selected', 'Greeting', 'Walking'] as const;

type Variant = {
  avatarId: string;
  fileName: string;
  candidateId: string | null;
  hairPreset: 'short-cap' | 'bob' | 'side-sweep' | 'hat-crop';
  hairColor: string;
  skinColor: string;
  outfitColor: string;
  bottomColor: string;
  accentColor: string;
  accessories: Array<'glasses' | 'scarf' | 'hat'>;
};

const variants: Variant[] = [
  {
    avatarId: 'avatar-base',
    fileName: 'avatar-base.glb',
    candidateId: null,
    hairPreset: 'short-cap',
    hairColor: '#294858',
    skinColor: '#F5C6A5',
    outfitColor: '#4CAFA8',
    bottomColor: '#294858',
    accentColor: '#E99679',
    accessories: [],
  },
  {
    avatarId: 'avatar-lantern',
    fileName: 'avatar-lantern.glb',
    candidateId: 'candidacy-lin-haixing-2026-demo',
    hairPreset: 'bob',
    hairColor: '#294858',
    skinColor: '#F5C6A5',
    outfitColor: '#E99679',
    bottomColor: '#294858',
    accentColor: '#FFD895',
    accessories: ['scarf'],
  },
  {
    avatarId: 'avatar-reading',
    fileName: 'avatar-reading.glb',
    candidateId: 'candidacy-zhou-qingyu-2026-demo',
    hairPreset: 'side-sweep',
    hairColor: '#6D4437',
    skinColor: '#E9B994',
    outfitColor: '#4CAFA8',
    bottomColor: '#F5E8D4',
    accentColor: '#FFF9F0',
    accessories: ['glasses'],
  },
  {
    avatarId: 'avatar-civic',
    fileName: 'avatar-civic.glb',
    candidateId: 'candidacy-shen-anbo-2026-demo',
    hairPreset: 'hat-crop',
    hairColor: '#6D4437',
    skinColor: '#F2C29E',
    outfitColor: '#FFD895',
    bottomColor: '#294858',
    accentColor: '#E99679',
    accessories: ['hat'],
  },
  {
    avatarId: 'avatar-harbor',
    fileName: 'avatar-harbor.glb',
    candidateId: 'candidacy-xu-shanhe-2026-demo',
    hairPreset: 'short-cap',
    hairColor: '#294858',
    skinColor: '#F3C5A5',
    outfitColor: '#8BCAC1',
    bottomColor: '#6D4437',
    accentColor: '#FFF9F0',
    accessories: [],
  },
];

const materialCache = new Map<string, THREE.MeshStandardMaterial>();
function material(color: string) {
  const cached = materialCache.get(color);
  if (cached) return cached;
  const created = new THREE.MeshStandardMaterial({
    color,
    roughness: 0.86,
    metalness: 0,
  });
  materialCache.set(color, created);
  return created;
}

function mesh(
  parent: THREE.Object3D,
  name: string,
  geometry: THREE.BufferGeometry,
  color: string,
  position: [number, number, number],
  scale?: [number, number, number],
  rotation?: [number, number, number],
) {
  const item = new THREE.Mesh(geometry, material(color));
  item.name = name;
  item.position.set(...position);
  if (scale) item.scale.set(...scale);
  if (rotation) item.rotation.set(...rotation);
  item.castShadow = true;
  item.receiveShadow = true;
  parent.add(item);
  return item;
}

function createAnimationClips(
  body: THREE.Object3D,
  rightArm: THREE.Object3D,
  leftLeg: THREE.Object3D,
  rightLeg: THREE.Object3D,
) {
  const identity = [0, 0, 0, 1];
  const raised = new THREE.Quaternion().setFromEuler(
    new THREE.Euler(0, 0, -0.65),
  );
  const relaxed = new THREE.Quaternion().setFromEuler(
    new THREE.Euler(0, 0, -0.08),
  );
  const leftStep = new THREE.Quaternion().setFromEuler(
    new THREE.Euler(0.35, 0, 0),
  );
  const rightStep = new THREE.Quaternion().setFromEuler(
    new THREE.Euler(-0.35, 0, 0),
  );
  return [
    new THREE.AnimationClip('Idle', 1.6, [
      new THREE.NumberKeyframeTrack(
        `${body.name}.scale`,
        [0, 0.8, 1.6],
        [1, 1, 1, 1, 1.02, 1, 1, 1, 1],
      ),
    ]),
    new THREE.AnimationClip('Selected', 0.72, [
      new THREE.NumberKeyframeTrack(
        `${body.name}.scale`,
        [0, 0.18, 0.72],
        [1, 1, 1, 1.08, 1.08, 1.08, 1, 1, 1],
      ),
    ]),
    new THREE.AnimationClip('Greeting', 0.86, [
      new THREE.QuaternionKeyframeTrack(
        `${rightArm.name}.quaternion`,
        [0, 0.18, 0.43, 0.86],
        [...identity, ...raised.toArray(), ...relaxed.toArray(), ...identity],
      ),
    ]),
    new THREE.AnimationClip('Walking', 0.9, [
      new THREE.QuaternionKeyframeTrack(
        `${leftLeg.name}.quaternion`,
        [0, 0.45, 0.9],
        [...identity, ...leftStep.toArray(), ...identity],
      ),
      new THREE.QuaternionKeyframeTrack(
        `${rightLeg.name}.quaternion`,
        [0, 0.45, 0.9],
        [...rightStep.toArray(), ...identity, ...rightStep.toArray()],
      ),
    ]),
  ];
}

function createCharacter(variant: Variant) {
  const character = new THREE.Group();
  character.name = 'Character';
  character.scale.setScalar(1.2);
  character.userData.assetRole = 'fictional-chibi-demo';

  const body = new THREE.Group();
  body.name = 'Body';
  body.position.y = 0.78;
  character.add(body);
  mesh(
    body,
    'Torso',
    new THREE.BoxGeometry(0.5, 0.78, 0.34),
    variant.outfitColor,
    [0, 0, 0],
  );

  const leftArm = new THREE.Group();
  leftArm.name = 'LeftArm';
  leftArm.position.set(-0.34, 0.91, 0);
  character.add(leftArm);
  mesh(
    leftArm,
    'LeftSleeve',
    new THREE.CylinderGeometry(0.08, 0.1, 0.58, 8),
    variant.outfitColor,
    [0, -0.18, 0],
    undefined,
    [0, 0, -0.22],
  );
  mesh(
    leftArm,
    'LeftHand',
    new THREE.SphereGeometry(0.105, 8, 6),
    variant.skinColor,
    [0, -0.5, 0],
  );

  const rightArm = new THREE.Group();
  rightArm.name = 'RightArm';
  rightArm.position.set(0.34, 0.91, 0);
  character.add(rightArm);
  mesh(
    rightArm,
    'RightSleeve',
    new THREE.CylinderGeometry(0.08, 0.1, 0.58, 8),
    variant.outfitColor,
    [0, -0.18, 0],
    undefined,
    [0, 0, 0.22],
  );
  mesh(
    rightArm,
    'RightHand',
    new THREE.SphereGeometry(0.105, 8, 6),
    variant.skinColor,
    [0, -0.5, 0],
  );

  const leftLeg = new THREE.Group();
  leftLeg.name = 'LeftLeg';
  leftLeg.position.set(-0.13, 0.34, 0);
  character.add(leftLeg);
  mesh(
    leftLeg,
    'LeftTrouser',
    new THREE.CylinderGeometry(0.09, 0.105, 0.42, 8),
    variant.bottomColor,
    [0, -0.12, 0],
  );
  mesh(
    leftLeg,
    'LeftShoe',
    new THREE.BoxGeometry(0.18, 0.1, 0.28),
    variant.accentColor,
    [0, -0.35, 0.03],
  );

  const rightLeg = new THREE.Group();
  rightLeg.name = 'RightLeg';
  rightLeg.position.set(0.13, 0.34, 0);
  character.add(rightLeg);
  mesh(
    rightLeg,
    'RightTrouser',
    new THREE.CylinderGeometry(0.09, 0.105, 0.42, 8),
    variant.bottomColor,
    [0, -0.12, 0],
  );
  mesh(
    rightLeg,
    'RightShoe',
    new THREE.BoxGeometry(0.18, 0.1, 0.28),
    variant.accentColor,
    [0, -0.35, 0.03],
  );

  const head = new THREE.Group();
  head.name = 'Head';
  head.position.y = 1.58;
  character.add(head);
  mesh(
    head,
    'Face',
    new THREE.SphereGeometry(0.42, 14, 10),
    variant.skinColor,
    [0, 0, 0],
    [1, 1.04, 0.92],
  );
  mesh(
    head,
    'LeftEye',
    new THREE.SphereGeometry(0.032, 8, 6),
    '#294858',
    [-0.13, -0.02, 0.39],
  );
  mesh(
    head,
    'RightEye',
    new THREE.SphereGeometry(0.032, 8, 6),
    '#294858',
    [0.13, -0.02, 0.39],
  );
  mesh(
    head,
    'Nose',
    new THREE.SphereGeometry(0.025, 6, 4),
    variant.accentColor,
    [0, -0.12, 0.405],
  );

  const hair = new THREE.Group();
  hair.name = 'Hair';
  character.add(hair);
  mesh(
    hair,
    'HairCap',
    new THREE.SphereGeometry(0.43, 12, 8),
    variant.hairColor,
    [0, 1.91, -0.02],
    [1.03, 0.58, 0.98],
  );
  if (variant.hairPreset === 'bob') {
    mesh(
      hair,
      'LeftBob',
      new THREE.SphereGeometry(0.2, 10, 7),
      variant.hairColor,
      [-0.34, 1.68, -0.02],
      [0.8, 1.25, 0.85],
    );
    mesh(
      hair,
      'RightBob',
      new THREE.SphereGeometry(0.2, 10, 7),
      variant.hairColor,
      [0.34, 1.68, -0.02],
      [0.8, 1.25, 0.85],
    );
  }
  if (variant.hairPreset === 'side-sweep') {
    mesh(
      hair,
      'SideSweep',
      new THREE.BoxGeometry(0.34, 0.18, 0.22),
      variant.hairColor,
      [0.2, 1.99, 0.29],
      undefined,
      [0, 0, -0.16],
    );
    mesh(
      hair,
      'SideTail',
      new THREE.SphereGeometry(0.18, 10, 7),
      variant.hairColor,
      [0.37, 1.68, -0.05],
      [0.8, 1.3, 0.85],
    );
  }
  if (variant.hairPreset === 'hat-crop') {
    mesh(
      hair,
      'HatBrim',
      new THREE.CylinderGeometry(0.5, 0.5, 0.09, 12),
      variant.accentColor,
      [0, 2.12, 0],
    );
    mesh(
      hair,
      'HatCrown',
      new THREE.CylinderGeometry(0.31, 0.36, 0.22, 12),
      variant.accentColor,
      [0, 2.26, 0],
    );
  }

  if (variant.accessories.includes('glasses')) {
    mesh(
      head,
      'LeftGlasses',
      new THREE.TorusGeometry(0.11, 0.018, 6, 14),
      '#294858',
      [-0.13, -0.02, 0.41],
      undefined,
      [0, 0, 0],
    );
    mesh(
      head,
      'RightGlasses',
      new THREE.TorusGeometry(0.11, 0.018, 6, 14),
      '#294858',
      [0.13, -0.02, 0.41],
      undefined,
      [0, 0, 0],
    );
    mesh(
      head,
      'GlassesBridge',
      new THREE.BoxGeometry(0.1, 0.02, 0.02),
      '#294858',
      [0, -0.02, 0.41],
    );
  }
  if (variant.accessories.includes('scarf')) {
    mesh(
      character,
      'Scarf',
      new THREE.BoxGeometry(0.58, 0.1, 0.06),
      variant.accentColor,
      [0, 1.24, 0.34],
      undefined,
      [0.1, 0, 0],
    );
    mesh(
      character,
      'ScarfTail',
      new THREE.BoxGeometry(0.1, 0.28, 0.06),
      variant.accentColor,
      [0.2, 1.08, 0.34],
      undefined,
      [0.1, 0, 0],
    );
  }

  const clips = createAnimationClips(body, rightArm, leftLeg, rightLeg);
  const box = new THREE.Box3().setFromObject(character);
  const heightMeters = Number((box.max.y - box.min.y).toFixed(3));
  let meshCount = 0;
  let triangleCount = 0;
  const materials = new Set<THREE.Material>();
  character.traverse((object) => {
    if (!(object instanceof THREE.Mesh)) return;
    meshCount += 1;
    materials.add(object.material);
    const index = object.geometry.index;
    const position = object.geometry.getAttribute('position');
    triangleCount += Math.floor((index?.count ?? position.count) / 3);
  });
  return {
    character,
    clips,
    heightMeters,
    meshCount,
    triangleCount,
    materialCount: materials.size,
  };
}

function exportGlb(scene: THREE.Object3D, clips: THREE.AnimationClip[]) {
  return new Promise<ArrayBuffer>((resolve, reject) => {
    const exporter = new GLTFExporter();
    exporter.parse(
      scene,
      (result) => {
        if (result instanceof ArrayBuffer) resolve(result);
        else
          reject(
            new Error('GLTFExporter returned JSON instead of binary GLB.'),
          );
      },
      (error) =>
        reject(error instanceof Error ? error : new Error(String(error))),
      { binary: true, animations: clips },
    );
  });
}

await mkdir(publicDir, { recursive: true });
await mkdir(path.dirname(manifestPath), { recursive: true });

const assets = [];
const appearances = [];
for (const variant of variants) {
  const {
    character,
    clips,
    heightMeters,
    meshCount,
    triangleCount,
    materialCount,
  } = createCharacter(variant);
  const binary = Buffer.from(await exportGlb(character, clips));
  const outputPath = path.join(publicDir, variant.fileName);
  await writeFile(outputPath, binary);
  assets.push({
    avatarId: variant.avatarId,
    modelPath: `/assets/avatars/${variant.fileName}`,
    state: 'validated',
    assetVersion: '1.0.0',
    generatedAt,
    generator: 'scripts/generate-avatar-assets.ts:three-primitives-v1',
    sha256: createHash('sha256').update(binary).digest('hex'),
    fileSizeBytes: binary.byteLength,
    meshCount,
    triangleCount,
    materialCount,
    heightMeters,
    animationClips: [...animationNames],
    note: 'Original fictional chibi asset generated from deterministic Three.js primitives; not a real-person likeness.',
  });
  appearances.push({
    candidateId: variant.candidateId,
    avatarId: variant.avatarId,
    bodyPreset: 'compact-adult',
    facePreset:
      variant.avatarId === 'avatar-reading' ? 'round-neutral' : 'soft-neutral',
    hairPreset: variant.hairPreset,
    hairColor: variant.hairColor,
    skinMaterial:
      variant.avatarId === 'avatar-reading' ? 'soft-umber' : 'warm-peach',
    outfitPreset:
      variant.avatarId === 'avatar-lantern'
        ? 'coral-sand'
        : variant.avatarId === 'avatar-reading'
          ? 'harbor-teal'
          : variant.avatarId === 'avatar-civic'
            ? 'warm-sand'
            : 'civic-blue',
    accessories: variant.accessories,
    modelPath: `/assets/avatars/${variant.fileName}`,
    animationSet: {
      idle: 'Idle',
      selected: 'Selected',
      greeting: 'Greeting',
      walking: 'Walking',
    },
    referenceIds: [],
    visualReviewStatus: 'not-applicable-fictional',
    assetVersion: '1.0.0',
    isFictional: true,
  });
}

const manifest = {
  schemaVersion: '1',
  generatedAt,
  generator: 'scripts/generate-avatar-assets.ts:three-primitives-v1',
  coordinateSystem: {
    up: 'Y',
    forward: '-Z',
    units: 'meters',
    targetHeightMeters: 2.7,
  },
  assets,
  appearances,
  references: [],
  note: 'Technical avatar manifest for fictional demonstration characters only. Real candidate likenesses require suitable references, human visual review, and separate publication approval.',
};
await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
console.log(
  `Generated ${assets.length} GLB assets and ${appearances.filter((item) => item.candidateId).length} fictional demo mappings.`,
);
