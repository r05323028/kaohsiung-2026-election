import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';

/** Minimal glTF 2.0 static-mesh reader for build-time asset verification. */
export type GlbAccessor = {
  count?: number;
  type?: string;
  componentType?: number;
  min?: number[];
  max?: number[];
};

export type GlbPrimitive = {
  attributes?: Record<string, number>;
  indices?: number;
  mode?: number;
  material?: number;
};

export type GlbNode = {
  name?: string;
  children?: number[];
  mesh?: number;
  matrix?: number[];
  translation?: number[];
  rotation?: number[];
  scale?: number[];
};

export type GlbJson = {
  asset?: { version?: string; generator?: string };
  scene?: number;
  scenes?: Array<{ nodes?: number[] }>;
  nodes?: GlbNode[];
  meshes?: Array<{ name?: string; primitives?: GlbPrimitive[] }>;
  accessors?: GlbAccessor[];
  materials?: Array<{ name?: string }>;
  skins?: unknown[];
  animations?: Array<{ name?: string }>;
  images?: unknown[];
};

export type Bounds = {
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
  minZ: number;
  maxZ: number;
};

export type GlbStats = {
  fileSizeBytes: number;
  sha256: string;
  generator: string;
  assetVersion: string;
  meshCount: number;
  primitiveCount: number;
  materialCount: number;
  triangleCount: number;
  meshNames: string[];
  materialNames: string[];
  nodeNames: string[];
  hasSkins: boolean;
  hasAnimations: boolean;
  hasImages: boolean;
  bounds: Bounds;
};

const IDENTITY = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];

/** Bounds-checked read: malformed matrices must not yield NaN silently. */
function at(values: number[], index: number): number {
  return values[index] ?? 0;
}

/** Column-major 4x4 multiply, matching the glTF matrix layout. */
function multiply(a: number[], b: number[]): number[] {
  const out = new Array<number>(16).fill(0);
  for (let col = 0; col < 4; col += 1) {
    for (let row = 0; row < 4; row += 1) {
      let sum = 0;
      for (let k = 0; k < 4; k += 1)
        sum += at(a, k * 4 + row) * at(b, col * 4 + k);
      out[col * 4 + row] = sum;
    }
  }
  return out;
}

function fromTrs(node: GlbNode): number[] {
  const [tx = 0, ty = 0, tz = 0] = node.translation ?? [];
  const [qx = 0, qy = 0, qz = 0, qw = 1] = node.rotation ?? [];
  const [sx = 1, sy = 1, sz = 1] = node.scale ?? [];
  const x2 = qx + qx;
  const y2 = qy + qy;
  const z2 = qz + qz;
  const xx = qx * x2;
  const xy = qx * y2;
  const xz = qx * z2;
  const yy = qy * y2;
  const yz = qy * z2;
  const zz = qz * z2;
  const wx = qw * x2;
  const wy = qw * y2;
  const wz = qw * z2;
  return [
    (1 - (yy + zz)) * sx,
    (xy + wz) * sx,
    (xz - wy) * sx,
    0,
    (xy - wz) * sy,
    (1 - (xx + zz)) * sy,
    (yz + wx) * sy,
    0,
    (xz + wy) * sz,
    (yz - wx) * sz,
    (1 - (xx + yy)) * sz,
    0,
    tx,
    ty,
    tz,
    1,
  ];
}

function localMatrix(node: GlbNode): number[] {
  if (node.matrix?.length === 16) return node.matrix;
  return fromTrs(node);
}

function transformPoint(m: number[], x: number, y: number, z: number) {
  return [
    at(m, 0) * x + at(m, 4) * y + at(m, 8) * z + at(m, 12),
    at(m, 1) * x + at(m, 5) * y + at(m, 9) * z + at(m, 13),
    at(m, 2) * x + at(m, 6) * y + at(m, 10) * z + at(m, 14),
  ] as const;
}

function emptyBounds(): Bounds {
  return {
    minX: Number.POSITIVE_INFINITY,
    maxX: Number.NEGATIVE_INFINITY,
    minY: Number.POSITIVE_INFINITY,
    maxY: Number.NEGATIVE_INFINITY,
    minZ: Number.POSITIVE_INFINITY,
    maxZ: Number.NEGATIVE_INFINITY,
  };
}

function grow(bounds: Bounds, point: readonly [number, number, number]) {
  bounds.minX = Math.min(bounds.minX, point[0]);
  bounds.maxX = Math.max(bounds.maxX, point[0]);
  bounds.minY = Math.min(bounds.minY, point[1]);
  bounds.maxY = Math.max(bounds.maxY, point[1]);
  bounds.minZ = Math.min(bounds.minZ, point[2]);
  bounds.maxZ = Math.max(bounds.maxZ, point[2]);
}

export function parseGlbChunks(buffer: Buffer, label: string) {
  if (buffer.byteLength < 20)
    throw new Error(`${label}: GLB is too small (${buffer.byteLength} bytes).`);
  if (buffer.readUInt32LE(0) !== 0x46546c67)
    throw new Error(`${label}: invalid GLB magic.`);
  if (buffer.readUInt32LE(4) !== 2)
    throw new Error(`${label}: GLB version must be 2.`);
  if (buffer.readUInt32LE(8) !== buffer.byteLength)
    throw new Error(`${label}: GLB length header does not match file size.`);
  let offset = 12;
  let json: GlbJson | undefined;
  while (offset + 8 <= buffer.byteLength) {
    const chunkLength = buffer.readUInt32LE(offset);
    const chunkType = buffer.readUInt32LE(offset + 4);
    const chunkStart = offset + 8;
    const chunkEnd = chunkStart + chunkLength;
    if (chunkEnd > buffer.byteLength)
      throw new Error(`${label}: GLB chunk exceeds file size.`);
    if (chunkType === 0x4e4f534a) {
      try {
        json = JSON.parse(
          buffer.subarray(chunkStart, chunkEnd).toString('utf8').trim(),
        ) as GlbJson;
      } catch (error) {
        throw new Error(
          `${label}: GLB JSON chunk is invalid: ${String(error)}`,
        );
      }
    }
    offset = chunkEnd;
  }
  if (!json?.asset?.version)
    throw new Error(`${label}: GLB JSON asset metadata is missing.`);
  return json;
}

function triangleCountFor(
  json: GlbJson,
  primitive: GlbPrimitive,
  label: string,
) {
  const mode = primitive.mode ?? 4;
  if (mode !== 4) return 0;
  const positionIndex = primitive.attributes?.POSITION;
  if (positionIndex === undefined)
    throw new Error(`${label}: mesh primitive has no POSITION attribute.`);
  const count =
    primitive.indices !== undefined
      ? json.accessors?.[primitive.indices]?.count
      : json.accessors?.[positionIndex]?.count;
  if (!count)
    throw new Error(`${label}: mesh primitive accessor has no count.`);
  return Math.floor(count / 3);
}

/** Walks the scene graph, applying node transforms so bounds are world-space. */
export function computeGlbStats(
  buffer: Buffer,
  json: GlbJson,
  label: string,
): GlbStats {
  const bounds = emptyBounds();
  let triangleCount = 0;
  let primitiveCount = 0;
  const nodes = json.nodes ?? [];
  const sceneRoots =
    json.scenes?.[json.scene ?? 0]?.nodes ??
    nodes
      .map((_, index) => index)
      .filter((index) => {
        return !nodes.some((node) => node.children?.includes(index));
      });

  const visit = (index: number, parent: number[]) => {
    const node = nodes[index];
    if (!node) return;
    const matrix = multiply(parent, localMatrix(node));
    if (node.mesh !== undefined) {
      const mesh = json.meshes?.[node.mesh];
      for (const primitive of mesh?.primitives ?? []) {
        primitiveCount += 1;
        triangleCount += triangleCountFor(json, primitive, label);
        const accessor = json.accessors?.[primitive.attributes?.POSITION ?? -1];
        if (!accessor?.min || !accessor?.max) continue;
        const [minX = 0, minY = 0, minZ = 0] = accessor.min;
        const [maxX = 0, maxY = 0, maxZ = 0] = accessor.max;
        for (const x of [minX, maxX]) {
          for (const y of [minY, maxY]) {
            for (const z of [minZ, maxZ])
              grow(bounds, transformPoint(matrix, x, y, z));
          }
        }
      }
    }
    for (const child of node.children ?? []) visit(child, matrix);
  };

  for (const root of sceneRoots) visit(root, IDENTITY);
  if (!Number.isFinite(bounds.minX))
    throw new Error(`${label}: no positioned mesh geometry found.`);

  const meshes = json.meshes ?? [];
  const materials = json.materials ?? [];
  return {
    fileSizeBytes: buffer.byteLength,
    sha256: createHash('sha256').update(buffer).digest('hex'),
    generator: json.asset?.generator ?? 'unknown',
    assetVersion: json.asset?.version ?? 'unknown',
    meshCount: meshes.length,
    primitiveCount,
    materialCount: materials.length,
    triangleCount,
    meshNames: meshes.map((mesh) => mesh.name ?? ''),
    materialNames: materials.map((material) => material.name ?? ''),
    nodeNames: nodes.map((node) => node.name ?? ''),
    hasSkins: (json.skins?.length ?? 0) > 0,
    hasAnimations: (json.animations?.length ?? 0) > 0,
    hasImages: (json.images?.length ?? 0) > 0,
    bounds,
  };
}

export async function readGlbStats(filePath: string) {
  const buffer = await readFile(filePath);
  const json = parseGlbChunks(buffer, filePath);
  return { json, stats: computeGlbStats(buffer, json, filePath) };
}
