import { createHash } from 'node:crypto';
import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import manifestInput from '../data/avatars/manifest.json';
import {
  type AvatarAsset,
  validateAvatarManifest,
} from '../src/data/avatars/schema';

const rootDir = process.cwd();
const publicDir = path.join(rootDir, 'public');
const manifest = validateAvatarManifest(manifestInput);
const errors: string[] = [];

type JsonChunk = {
  asset?: { version?: string };
  meshes?: Array<{
    primitives?: Array<{
      indices?: number;
      attributes?: { POSITION?: number };
      mode?: number;
    }>;
  }>;
  accessors?: Array<{ count?: number }>;
  materials?: unknown[];
  animations?: Array<{ name?: string }>;
};

function assetFile(asset: AvatarAsset) {
  const relative = asset.modelPath.replace(/^\//u, '');
  const resolved = path.resolve(publicDir, relative);
  const publicRoot = `${publicDir}${path.sep}`;
  if (!resolved.startsWith(publicRoot))
    throw new Error(`Avatar path escapes public directory: ${asset.modelPath}`);
  return resolved;
}

function parseGlb(
  buffer: Buffer,
  asset: AvatarAsset,
  filePath: string,
): JsonChunk {
  if (buffer.byteLength < 20)
    throw new Error(`${asset.avatarId}: GLB is too small (${filePath}).`);
  if (buffer.readUInt32LE(0) !== 0x46546c67)
    throw new Error(`${asset.avatarId}: invalid GLB magic.`);
  if (buffer.readUInt32LE(4) !== 2)
    throw new Error(`${asset.avatarId}: GLB version must be 2.`);
  if (buffer.readUInt32LE(8) !== buffer.byteLength)
    throw new Error(
      `${asset.avatarId}: GLB length header does not match file size.`,
    );
  let offset = 12;
  let json: JsonChunk | undefined;
  while (offset + 8 <= buffer.byteLength) {
    const chunkLength = buffer.readUInt32LE(offset);
    const chunkType = buffer.readUInt32LE(offset + 4);
    const chunkStart = offset + 8;
    const chunkEnd = chunkStart + chunkLength;
    if (chunkEnd > buffer.byteLength)
      throw new Error(`${asset.avatarId}: GLB chunk exceeds file size.`);
    if (chunkType === 0x4e4f534a) {
      try {
        json = JSON.parse(
          buffer.subarray(chunkStart, chunkEnd).toString('utf8').trim(),
        ) as JsonChunk;
      } catch (error) {
        throw new Error(
          `${asset.avatarId}: GLB JSON chunk is invalid: ${String(error)}`,
        );
      }
    }
    offset = chunkEnd;
  }
  if (!json?.asset?.version)
    throw new Error(`${asset.avatarId}: GLB JSON asset metadata is missing.`);
  return json;
}

function accessorCount(
  json: JsonChunk,
  index: number | undefined,
  asset: AvatarAsset,
) {
  if (index === undefined)
    throw new Error(`${asset.avatarId}: mesh accessor is missing.`);
  const count = json.accessors?.[index]?.count;
  if (!count)
    throw new Error(`${asset.avatarId}: mesh accessor ${index} has no count.`);
  return count;
}

function verifyAsset(asset: AvatarAsset) {
  let filePath: string;
  try {
    filePath = assetFile(asset);
  } catch (error) {
    errors.push(String(error));
    return;
  }
  return stat(filePath)
    .then(async (fileStat) => {
      if (fileStat.size !== asset.fileSizeBytes) {
        errors.push(
          `${asset.avatarId}: manifest size ${asset.fileSizeBytes} does not match file size ${fileStat.size}.`,
        );
      }
      const buffer = await readFile(filePath);
      const sha256 = createHash('sha256').update(buffer).digest('hex');
      if (sha256 !== asset.sha256)
        errors.push(
          `${asset.avatarId}: SHA-256 mismatch; manifest ${asset.sha256}, actual ${sha256}.`,
        );
      const json = parseGlb(buffer, asset, filePath);
      const meshCount = json.meshes?.length ?? 0;
      if (meshCount !== asset.meshCount)
        errors.push(
          `${asset.avatarId}: mesh count ${asset.meshCount} does not match GLB ${meshCount}.`,
        );
      const materialCount = json.materials?.length ?? 0;
      if (materialCount !== asset.materialCount)
        errors.push(
          `${asset.avatarId}: material count ${asset.materialCount} does not match GLB ${materialCount}.`,
        );
      const animationClips = (json.animations ?? [])
        .map((animation) => animation.name)
        .filter((name): name is string => Boolean(name));
      for (const animation of asset.animationClips) {
        if (!animationClips.includes(animation))
          errors.push(
            `${asset.avatarId}: missing animation clip ${animation}.`,
          );
      }
      let triangleCount = 0;
      for (const mesh of json.meshes ?? []) {
        for (const primitive of mesh.primitives ?? []) {
          if (primitive.mode !== undefined && primitive.mode !== 4)
            errors.push(
              `${asset.avatarId}: unsupported non-triangle primitive mode ${primitive.mode}.`,
            );
          const count =
            primitive.indices === undefined
              ? accessorCount(json, primitive.attributes?.POSITION, asset)
              : accessorCount(json, primitive.indices, asset);
          triangleCount += Math.floor(count / 3);
        }
      }
      if (triangleCount !== asset.triangleCount)
        errors.push(
          `${asset.avatarId}: triangle count ${asset.triangleCount} does not match GLB ${triangleCount}.`,
        );
    })
    .catch((error) => {
      errors.push(
        `${asset.avatarId}: cannot read ${filePath}: ${String(error)}`,
      );
    });
}

if (manifest.assets.length < 4)
  errors.push(
    'Manifest must contain a base asset and at least three variants.',
  );
if (!manifest.assets.some((asset) => asset.avatarId === 'avatar-base'))
  errors.push('Manifest is missing avatar-base.');
if (
  manifest.appearances.filter((appearance) => appearance.candidateId !== null)
    .length < 3
)
  errors.push('Manifest must map at least three candidate appearances.');

const assetIds = new Set(manifest.assets.map((asset) => asset.avatarId));
for (const appearance of manifest.appearances) {
  if (!assetIds.has(appearance.avatarId))
    errors.push(`Appearance ${appearance.avatarId} has no asset.`);
  if (appearance.candidateId !== null && !appearance.isFictional)
    errors.push(
      `Mapped demo appearance ${appearance.avatarId} must be explicitly fictional.`,
    );
}

await Promise.all(manifest.assets.map((asset) => verifyAsset(asset)));
if (errors.length > 0)
  throw new Error(`Avatar validation failed:\n- ${errors.join('\n- ')}`);

const totalBytes = manifest.assets.reduce(
  (sum, asset) => sum + asset.fileSizeBytes,
  0,
);
const totalTriangles = manifest.assets.reduce(
  (sum, asset) => sum + asset.triangleCount,
  0,
);
console.log(
  `Avatar validation passed: ${manifest.assets.length} GLBs, ${manifest.appearances.filter((appearance) => appearance.candidateId !== null).length} fictional mappings, ${totalBytes} bytes, ${totalTriangles} triangles.`,
);
