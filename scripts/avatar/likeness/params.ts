import type {
  LikenessAppearance,
  NormalizedParameter,
  SignedParameter,
} from '../../../src/data/avatars/likeness/schema';

export type HeadKitParams = Record<string, unknown>;

/**
 * Translates a validated appearance record into the flat parameter object
 * `scripts/avatar/blender/head_kit.py` consumes. Kept pure so the mapping can
 * be unit-tested without Blender.
 */
export function headKitParamsFor(
  appearance: LikenessAppearance,
): HeadKitParams {
  const value = (parameter: NormalizedParameter | SignedParameter) =>
    parameter.value;
  const params: HeadKitParams = {
    faceShape: appearance.faceShape,
    faceWidth: value(appearance.faceWidth),
    faceLength: value(appearance.faceLength),
    jawWidth: value(appearance.jawWidth),
    chinRoundness: value(appearance.chinRoundness),
    cheekFullness: value(appearance.cheekFullness),
    eyeSize: value(appearance.eyeSize),
    eyeSpacing: value(appearance.eyeSpacing),
    eyeHeight: value(appearance.eyeHeight),
    eyeTilt: value(appearance.eyeTilt),
    eyebrowThickness: value(appearance.eyebrowThickness),
    eyebrowAngle: value(appearance.eyebrowAngle),
    noseWidth: value(appearance.noseWidth),
    noseLength: value(appearance.noseLength),
    mouthWidth: value(appearance.mouthWidth),
    mouthFullness: value(appearance.mouthFullness),
    hairStyle: appearance.hairStyle,
    hairVolume: value(appearance.hairVolume),
    glasses: {
      enabled: appearance.glasses.enabled,
      style: appearance.glasses.enabled ? appearance.glasses.style : 'none',
      frameThickness: appearance.glasses.frameThickness,
    },
    facialHair: {
      enabled: appearance.facialHair.enabled,
      style: appearance.facialHair.enabled
        ? appearance.facialHair.style
        : 'none',
      density: appearance.facialHair.density,
    },
  };
  if (appearance.observedColors.hair)
    params.hairColor = appearance.observedColors.hair;
  if (appearance.observedColors.skin)
    params.skinColor = appearance.observedColors.skin;
  return params;
}
