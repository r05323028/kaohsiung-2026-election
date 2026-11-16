"""(pyright: reportMissingImports=false, reportUnknownMemberType=false,
reportUnknownArgumentType=false, reportUnknownVariableType=false,
reportUnknownParameterType=false, reportMissingModuleSource=false)
Deterministic facial-proportion extractor for licensed likeness photos.

Reads the verified-photo record (``data/avatars/likeness/photos.json``), runs
MediaPipe FaceLandmarker (478-point mesh) on the ORIGINAL pixels of each
usable portrait, converts 2D landmark geometry into the normalized parameters
of ``src/data/avatars/likeness/schema.ts``, and writes:

  --out     data/avatars/likeness/appearances.json   (Zod-validated contract)
  --report  .cache/reports/avatar/face-extraction.json      (raw ratios + windows)
  --debug-dir tmp/avatar-pipeline/face-debug/<photoId>.png (human check)

Clipboard geometry, not identity
--------------------------------
Every number here is a ratio between two landmarks on one photograph. A single
frontal landmark set is a 2D projection of a head: it cannot see depth, so it
carries no skull volume, no brow ridge depth and no true 3D head geometry. The
output is therefore ``basis="estimated"`` at best and must never be labelled
``observed`` (a human looking at the photo) or treated as a verified likeness.
Nothing in this module performs identity matching; identity comes from
photos.json, which records the source-specific evidence separately.

Measured ratios (distances are computed in PIXEL space, never in normalized
[0,1] landmark coordinates, because x and y are normalized by different image
dimensions and mixing them silently skews every ratio by the aspect ratio):

  ratio             formula                                   anchors
  ---------------   ----------------------------------------  ------------------
  faceWidth         cheekWidth / faceHeight                   234-454 / 10-152
  faceLength        faceHeight / interpupillaryDistance        10-152 / 468-473
  jawWidth          jawWidth / cheekWidth                     172-397 / 234-454
  chinRoundness     sagitta(172, 152, 397) / jawWidth         172,152,397
  cheekFullness     cheekWidth / mouthWidth                   234-454 / 61-291
  eyeSize           meanEyeFissureWidth / cheekWidth          33-133,263-362
  eyeSpacing        intercanthalDistance / meanEyeFissureW.   133-362
  eyeHeight         meanEyelidAperture / meanEyeFissureWidth   159-145,386-374
  eyeTilt           mean(innerY - outerY) / meanEyeFissureW.  133-33, 362-263
  noseWidth         alarWidth / cheekWidth                    129-358
  noseLength        nasionToTip / faceHeight                  168-1 / 10-152
  mouthWidth        mouthCornerWidth / cheekWidth             61-291
  mouthFullness     outerLipHeight / mouthWidth               0-17 / 61-291
  foreheadWidth     foreheadWidth / cheekWidth                103-332
  (faceShape only; foreheadWidth is not a schema parameter)

chinRoundness is the sagitta of the chin arc: the perpendicular distance from
landmark 152 (menton) to the chord 172-397, divided by that chord. A pointed
chin pulls menton away from the jaw chord (large sagitta); a square jaw keeps
menton close to it (small sagitta).

Ratio windows (used only to clamp and rescale a ratio into [0,1])
-----------------------------------------------------------------
Each window is a named constant below. ``value = clamp((ratio-lo)/(hi-lo))``,
so a ratio at ``lo`` maps to 0 and at ``hi`` to 1. Windows were calibrated on
the 12 licensed portraits of this proof of concept, with roughly 5% margin
around the observed range, so no candidate saturates except at the extremes.
Ratios are relative measures: a wider window means a flatter, less assertive
parameter. The raw ratio is always written to the report so a reviewer can
recalibrate a window without re-running the model.

  FACE_WIDTH_RATIO_WINDOW      (0.78, 0.97)  observed 0.810-0.942
  FACE_LENGTH_RATIO_WINDOW     (2.40, 2.78)  observed 2.449-2.734
  JAW_WIDTH_RATIO_WINDOW       (0.72, 0.86)  observed 0.760-0.824
  CHIN_ROUNDNESS_RATIO_WINDOW  (0.22, 0.42)  observed 0.244-0.396
  CHEEK_FULLNESS_RATIO_WINDOW  (2.00, 2.80)  observed 2.072-2.712
  EYE_SIZE_RATIO_WINDOW        (0.155, 0.215) observed 0.165-0.206
  EYE_SPACING_RATIO_WINDOW     (1.28, 1.50)  observed 1.297-1.475
  EYE_HEIGHT_RATIO_WINDOW      (0.18, 0.37)  observed 0.203-0.346
  EYE_TILT_RATIO_WINDOW        (-0.05, 0.25) observed 0.047-0.215, signed
  NOSE_WIDTH_RATIO_WINDOW      (0.285, 0.345) observed 0.292-0.333
  NOSE_LENGTH_RATIO_WINDOW     (0.240, 0.310) observed 0.247-0.298
  MOUTH_WIDTH_RATIO_WINDOW     (0.35, 0.50)  observed 0.369-0.483
  MOUTH_FULLNESS_RATIO_WINDOW  (0.17, 0.48)  observed 0.183-0.464

eyeTilt is signed: +1 means the outer corner sits above the inner corner
(upward canthal tilt). This landmark set reports a systematically positive
tilt for all 12 portraits, so the window is placed over the observed range and
the value is a relative tilt, not an absolute clinical measure.

Face-shape rules (first match wins; the fired rule is written to the report)
--------------------------------------------------------------------------
Rule thresholds are ratios from the table above, ordered so each shape is
reachable. They are heuristic and coarse; face shape from one photo is the
least reliable output of this module.

  diamond  foreheadWidth < 0.690 and jawWidth < 0.790  (cheekbones widest)
  heart    jawWidth < 0.780                            (tapered jaw)
  round    faceWidth >= 0.820 and chinRoundness >= 0.345
  square   faceWidth >= 0.890 and jawWidth >= 0.795    (wide face, full jaw)
  oblong   faceWidth < 0.830                           (long face)
  oval     otherwise

Colour sampling
---------------
Skin: each cheek is a disc centred on the centroid of (outer eye corner, mouth
corner, cheek edge) with a radius of SKIN_PATCH_RADIUS x cheekWidth. The two
patch medians are averaged per LAB channel, so a side-lit portrait (one bright
cheek, one shadowed) does not turn into one bimodal sample. Hair: a rectangle
above landmark 10, its bottom edge kept HAIR_PATCH_BOTTOM_FRACTION of the face
height above the forehead centre so the hairline does not mix skin into the
sample; the brightest HAIR_TRIM_PERCENTILE percent of its pixels are dropped
because hair is the darker population in that box, and the remaining median is
measured. Clipped pixels (any sRGB channel within CLIP_MARGIN of 0 or 255) are
discarded before every median.

A hair sample is accepted only when it is at least HAIR_MIN_DARKER_L L* units
darker than the skin median and keeps HAIR_MIN_RETAINED_FRACTION of its
pixels; otherwise the observation's hairColor is copied with
source="observation", otherwise hair is null. LAB values are written to the
report in real L* a* b* units (L* 0-100, a*/b* around 0), not in OpenCV's
0-255 encoding. Colour confidence is a level plus score in [0,1]:
``score = clamp(1 - (MAD_L + MAD_b) / CONFIDENCE_SPREAD_LIMIT) * coverage``
with MAD measured in L*/b* units and coverage the retained pixel fraction.

Determinism
-----------
Same bytes in, same bytes out: fixed windows, fixed rounding, fixed iteration
order (photoId sort), no clock (extractedAt is derived from photos.json
retrievedAt), no randomness, no threads. JSON is written with two-space indent
and a trailing newline.

Usage
-----
    .venv-avatar/bin/python scripts/avatar/face/extract.py \\
        --photos data/avatars/likeness/photos.json \\
        --photo-dir tmp/avatar-pipeline/photos \\
        --observations data/avatars/likeness/observations.json \\
        --out data/avatars/likeness/appearances.json \\
        --report .cache/reports/avatar/face-extraction.json \\
        --debug-dir tmp/avatar-pipeline/face-debug
"""

# pyright: reportMissingImports=false, reportUnknownMemberType=false, reportUnknownArgumentType=false, reportUnknownVariableType=false, reportUnknownParameterType=false, reportGeneralTypeIssues=false, reportMissingModuleSource=false, reportPrivateImportUsage=false

from __future__ import annotations

import argparse
import hashlib
import json
import math
import os
import sys
from typing import Any

import cv2
import mediapipe as mp
import numpy as np
from mediapipe.tasks.python import BaseOptions
from mediapipe.tasks.python.vision import (
    FaceLandmarker,
    FaceLandmarkerOptions,
    RunningMode,
)

# --- Landmark anchors -------------------------------------------------------
# MediaPipe 478-point face mesh (468 mesh vertices + 10 iris points). Every
# index below was checked by drawing a labelled overlay on three portraits
# (see tmp/avatar-pipeline/face-debug) and reading the picture, not assumed.
FOREHEAD_CENTRE = 10
CHIN = 152
CHEEK_LEFT = 234
CHEEK_RIGHT = 454
JAW_LEFT = 172
JAW_RIGHT = 397
EYE_LEFT_OUTER = 33
EYE_LEFT_INNER = 133
EYE_RIGHT_INNER = 362
EYE_RIGHT_OUTER = 263
EYE_LEFT_UPPER = 159
EYE_LEFT_LOWER = 145
EYE_RIGHT_UPPER = 386
EYE_RIGHT_LOWER = 374
IRIS_LEFT = 468
IRIS_RIGHT = 473
NOSE_BRIDGE = 168
NOSE_TIP = 1
ALAR_LEFT = 129
ALAR_RIGHT = 358
MOUTH_LEFT = 61
MOUTH_RIGHT = 291
LIP_OUTER_TOP = 0
LIP_OUTER_BOTTOM = 17
FOREHEAD_LEFT = 103
FOREHEAD_RIGHT = 332

# --- Ratio windows (see module docstring for the measured ratio and why) ----
FACE_WIDTH_RATIO_WINDOW = (0.78, 0.97)
FACE_LENGTH_RATIO_WINDOW = (2.40, 2.78)
JAW_WIDTH_RATIO_WINDOW = (0.72, 0.86)
CHIN_ROUNDNESS_RATIO_WINDOW = (0.22, 0.42)
CHEEK_FULLNESS_RATIO_WINDOW = (2.00, 2.80)
EYE_SIZE_RATIO_WINDOW = (0.155, 0.215)
EYE_SPACING_RATIO_WINDOW = (1.28, 1.50)
EYE_HEIGHT_RATIO_WINDOW = (0.18, 0.37)
EYE_TILT_RATIO_WINDOW = (-0.05, 0.25)
NOSE_WIDTH_RATIO_WINDOW = (0.285, 0.345)
NOSE_LENGTH_RATIO_WINDOW = (0.240, 0.310)
MOUTH_WIDTH_RATIO_WINDOW = (0.35, 0.50)
MOUTH_FULLNESS_RATIO_WINDOW = (0.17, 0.48)

# --- Face-shape thresholds (see module docstring) ---------------------------
SHAPE_DIAMOND_FOREHEAD_MAX = 0.690
SHAPE_DIAMOND_JAW_MAX = 0.790
SHAPE_HEART_JAW_MAX = 0.780
SHAPE_ROUND_FACE_WIDTH_MIN = 0.820
SHAPE_ROUND_CHIN_MIN = 0.345
SHAPE_SQUARE_FACE_WIDTH_MIN = 0.890
SHAPE_SQUARE_JAW_MIN = 0.795
SHAPE_OBLONG_FACE_WIDTH_MAX = 0.830

# --- Colour sampling --------------------------------------------------------
# Cheek patch radius as a fraction of cheek width; small enough to stay on the
# cheekbone and off the hair, large enough for a stable median on 225px photos.
SKIN_PATCH_RADIUS_FRACTION = 0.085
# Hair rectangle above landmark 10, as fractions of face height: the bottom edge
# stays HAIR_PATCH_BOTTOM_FRACTION away from the forehead centre so the hairline
# (skin) cannot enter the sample.
HAIR_PATCH_TOP_FRACTION = 0.30
HAIR_PATCH_BOTTOM_FRACTION = 0.10
HAIR_PATCH_HALF_WIDTH_FRACTION = 0.26
# Percent of the hair box to drop from the bright end before taking the median.
HAIR_TRIM_PERCENTILE = 60
# Pixels this close to 0 or 255 in any sRGB channel are clipped and skipped.
CLIP_MARGIN = 4
# A hair sample must be at least this many L* units darker than the skin median.
HAIR_MIN_DARKER_L = 12.0
HAIR_MIN_RETAINED_FRACTION = 0.5
# Median absolute deviation (L* + b*) that maps colour confidence to 0 before
# coverage scaling; ~20 units separates clean cheek skin from shadowed skin.
CONFIDENCE_SPREAD_LIMIT = 20.0
CONFIDENCE_HIGH_MIN = 0.80
CONFIDENCE_MEDIUM_MIN = 0.55

# --- Fixed values required by the schema but not measurable from landmarks ---
GLASSES_FRAME_THICKNESS = 0.3
FACIAL_HAIR_DENSITY = 0.5

TOOL_NAME = 'mediapipe-face-landmarker'
SCRIPT_PATH = 'scripts/avatar/face/extract.py'
PROCESSED_USABILITY = ('usable', 'low-resolution')

# Mirrors FACE_DEFAULTS / GLASSES_DEFAULT / FACIAL_HAIR_DEFAULT in
# src/data/avatars/likeness/schema.ts. Duplicated as literals because this
# script runs outside the TypeScript build; keep both sides in sync by hand.
FACE_DEFAULTS: dict[str, Any] = {
    'faceShape': 'oval',
    'faceWidth': 0.5,
    'faceLength': 0.5,
    'jawWidth': 0.5,
    'chinRoundness': 0.6,
    'cheekFullness': 0.5,
    'eyeSize': 0.55,
    'eyeSpacing': 0.5,
    'eyeHeight': 0.48,
    'eyeTilt': 0,
    'eyebrowThickness': 0.4,
    'eyebrowAngle': 0,
    'noseWidth': 0.4,
    'noseLength': 0.45,
    'mouthWidth': 0.45,
    'mouthFullness': 0.45,
    'hairStyle': 'short-crop',
    'hairVolume': 0.5,
}
GLASSES_DEFAULT = {'enabled': False, 'style': 'none'}
FACIAL_HAIR_DEFAULT = {'enabled': False, 'style': 'none'}

PARAMETER_WINDOWS: dict[str, tuple[float, float]] = {
    'faceWidth': FACE_WIDTH_RATIO_WINDOW,
    'faceLength': FACE_LENGTH_RATIO_WINDOW,
    'jawWidth': JAW_WIDTH_RATIO_WINDOW,
    'chinRoundness': CHIN_ROUNDNESS_RATIO_WINDOW,
    'cheekFullness': CHEEK_FULLNESS_RATIO_WINDOW,
    'eyeSize': EYE_SIZE_RATIO_WINDOW,
    'eyeSpacing': EYE_SPACING_RATIO_WINDOW,
    'eyeHeight': EYE_HEIGHT_RATIO_WINDOW,
    'eyeTilt': EYE_TILT_RATIO_WINDOW,
    'noseWidth': NOSE_WIDTH_RATIO_WINDOW,
    'noseLength': NOSE_LENGTH_RATIO_WINDOW,
    'mouthWidth': MOUTH_WIDTH_RATIO_WINDOW,
    'mouthFullness': MOUTH_FULLNESS_RATIO_WINDOW,
}

# Schema parameters that cannot be estimated from 2D landmarks at all. They are
# emitted as FACE_DEFAULTS with basis "default" and no photoIds.
UNMEASURABLE_PARAMETERS = ('eyebrowThickness', 'eyebrowAngle', 'hairVolume')


def round3(value: float) -> float:
    return round(float(value) + 0.0, 3)


def clamp(value: float, lo: float, hi: float) -> float:
    return lo if value < lo else hi if value > hi else value


def remap(ratio: float, window: tuple[float, float], signed: bool = False) -> float:
    """Clamped linear remap of a measured ratio into [0,1] or [-1,1]."""
    lo, hi = window
    unit = clamp((ratio - lo) / (hi - lo), 0.0, 1.0)
    return round3(unit * 2.0 - 1.0) if signed else round3(unit)


def distance(a: tuple[float, float], b: tuple[float, float]) -> float:
    return math.hypot(a[0] - b[0], a[1] - b[1])


def pixel_landmarks(
    landmarks: list[Any], width: int, height: int
) -> list[tuple[float, float]]:
    """Landmark coordinates in pixels; ratios must never mix normalized axes."""
    return [(float(lm.x) * width, float(lm.y) * height) for lm in landmarks]


def measure_ratios(points: list[tuple[float, float]]) -> dict[str, float]:
    def at(index: int) -> tuple[float, float]:
        return points[index]

    cheek_width = distance(at(CHEEK_LEFT), at(CHEEK_RIGHT))
    face_height = distance(at(FOREHEAD_CENTRE), at(CHIN))
    jaw_width = distance(at(JAW_LEFT), at(JAW_RIGHT))
    mouth_width = distance(at(MOUTH_LEFT), at(MOUTH_RIGHT))
    interpupillary = distance(at(IRIS_LEFT), at(IRIS_RIGHT))
    eye_fissure_width = (
        distance(at(EYE_LEFT_OUTER), at(EYE_LEFT_INNER))
        + distance(at(EYE_RIGHT_OUTER), at(EYE_RIGHT_INNER))
    ) / 2.0
    intercanthal = distance(at(EYE_LEFT_INNER), at(EYE_RIGHT_INNER))
    eyelid_aperture = (
        abs(at(EYE_LEFT_UPPER)[1] - at(EYE_LEFT_LOWER)[1])
        + abs(at(EYE_RIGHT_UPPER)[1] - at(EYE_RIGHT_LOWER)[1])
    ) / 2.0
    # Positive mean(innerY - outerY) means the outer corner sits higher.
    eye_tilt = (
        (at(EYE_LEFT_INNER)[1] - at(EYE_LEFT_OUTER)[1])
        + (at(EYE_RIGHT_INNER)[1] - at(EYE_RIGHT_OUTER)[1])
    ) / 2.0 / eye_fissure_width
    lip_height = abs(at(LIP_OUTER_BOTTOM)[1] - at(LIP_OUTER_TOP)[1])

    (ax, ay), (bx, by), (cx, cy) = at(JAW_LEFT), at(JAW_RIGHT), at(CHIN)
    jaw_chord = distance(at(JAW_LEFT), at(JAW_RIGHT))
    # Sagitta: perpendicular distance from menton to the jaw chord / chord.
    sagitta = (
        abs((bx - ax) * (ay - cy) - (ax - cx) * (by - ay))
        / math.hypot(bx - ax, by - ay)
        / jaw_chord
    )

    return {
        'faceWidth': round(cheek_width / face_height, 4),
        'faceLength': round(face_height / interpupillary, 4),
        'jawWidth': round(jaw_width / cheek_width, 4),
        'chinRoundness': round(sagitta, 4),
        'cheekFullness': round(cheek_width / mouth_width, 4),
        'eyeSize': round(eye_fissure_width / cheek_width, 4),
        'eyeSpacing': round(intercanthal / eye_fissure_width, 4),
        'eyeHeight': round(eyelid_aperture / eye_fissure_width, 4),
        'eyeTilt': round(eye_tilt, 4),
        'noseWidth': round(distance(at(ALAR_LEFT), at(ALAR_RIGHT)) / cheek_width, 4),
        'noseLength': round(distance(at(NOSE_BRIDGE), at(NOSE_TIP)) / face_height, 4),
        'mouthWidth': round(mouth_width / cheek_width, 4),
        'mouthFullness': round(lip_height / mouth_width, 4),
        'foreheadWidth': round(distance(at(FOREHEAD_LEFT), at(FOREHEAD_RIGHT)) / cheek_width, 4),
    }


def classify_face_shape(ratios: dict[str, float]) -> tuple[str, dict[str, Any]]:
    face_width = ratios['faceWidth']
    jaw = ratios['jawWidth']
    chin = ratios['chinRoundness']
    forehead = ratios['foreheadWidth']

    if forehead < SHAPE_DIAMOND_FOREHEAD_MAX and jaw < SHAPE_DIAMOND_JAW_MAX:
        rule = 'diamond: foreheadWidth < 0.690 and jawWidth < 0.790'
        shape = 'diamond'
    elif jaw < SHAPE_HEART_JAW_MAX:
        rule = 'heart: jawWidth < 0.780'
        shape = 'heart'
    elif face_width >= SHAPE_ROUND_FACE_WIDTH_MIN and chin >= SHAPE_ROUND_CHIN_MIN:
        rule = 'round: faceWidth >= 0.820 and chinRoundness >= 0.345'
        shape = 'round'
    elif face_width >= SHAPE_SQUARE_FACE_WIDTH_MIN and jaw >= SHAPE_SQUARE_JAW_MIN:
        rule = 'square: faceWidth >= 0.890 and jawWidth >= 0.795'
        shape = 'square'
    elif face_width < SHAPE_OBLONG_FACE_WIDTH_MAX:
        rule = 'oblong: faceWidth < 0.830'
        shape = 'oblong'
    else:
        rule = 'oval: no other rule matched'
        shape = 'oval'

    return shape, {
        'rule': rule,
        'inputs': {
            'faceWidth': face_width,
            'jawWidth': jaw,
            'chinRoundness': chin,
            'foreheadWidth': forehead,
        },
    }


def to_hex(bgr: tuple[int, int, int]) -> str:
    b, g, r = (int(clamp(channel, 0, 255)) for channel in bgr)
    return f'#{r:02x}{g:02x}{b:02x}'


def lab_units(lab_u8: tuple[float, float, float]) -> list[float]:
    """OpenCV encodes L* as 0-255 and a*/b* with a +128 offset; report real units."""
    lightness, a_channel, b_channel = lab_u8
    return [
        round(lightness / 255.0 * 100.0, 1),
        round(a_channel - 128.0, 1),
        round(b_channel - 128.0, 1),
    ]


def lab_units_to_hex(lab: list[float]) -> str:
    lightness, a_channel, b_channel = lab
    pixel = np.array(
        [[[round(lightness / 100.0 * 255.0), round(a_channel + 128.0), round(b_channel + 128.0)]]],
        dtype=np.uint8,
    )
    bgr = cv2.cvtColor(pixel, cv2.COLOR_LAB2BGR)[0, 0]
    return to_hex((int(bgr[0]), int(bgr[1]), int(bgr[2])))


def median_lab(pixels_bgr: np.ndarray) -> dict[str, Any]:
    lab = cv2.cvtColor(pixels_bgr.reshape(-1, 1, 3), cv2.COLOR_BGR2LAB).reshape(-1, 3)
    median_u8 = (
        float(np.median(lab[:, 0])),
        float(np.median(lab[:, 1])),
        float(np.median(lab[:, 2])),
    )
    units = lab_units(median_u8)
    # Robust spread in L*/b* units: median absolute deviation from the median.
    mad_l = float(np.median(np.abs(lab[:, 0] - median_u8[0]))) / 255.0 * 100.0
    mad_b = float(np.median(np.abs(lab[:, 2] - median_u8[2])))
    return {
        'hex': lab_units_to_hex(units),
        'lab': units,
        'mad': {'L': round(mad_l, 1), 'b': round(mad_b, 1)},
    }


def unclipped(pixels_bgr: np.ndarray) -> np.ndarray:
    low = pixels_bgr.min(axis=1) < CLIP_MARGIN
    high = pixels_bgr.max(axis=1) > 255 - CLIP_MARGIN
    return pixels_bgr[~(low | high)]


def confidence_report(
    retained: int, sampled: int, mad_l: float, mad_b: float
) -> dict[str, Any]:
    retained_fraction = retained / sampled if sampled else 0.0
    spread = mad_l + mad_b
    score = clamp(1.0 - spread / CONFIDENCE_SPREAD_LIMIT, 0.0, 1.0) * retained_fraction
    if score >= CONFIDENCE_HIGH_MIN:
        level = 'high'
    elif score >= CONFIDENCE_MEDIUM_MIN:
        level = 'medium'
    else:
        level = 'low'
    return {
        'level': level,
        'score': round3(score),
        'retainedFraction': round3(retained_fraction),
    }


def disc_pixels(
    bgr: np.ndarray, centre: tuple[float, float], radius: int
) -> np.ndarray:
    height, width = bgr.shape[:2]
    cx, cy = int(round(centre[0])), int(round(centre[1]))
    x0, x1 = max(0, cx - radius), min(width, cx + radius + 1)
    y0, y1 = max(0, cy - radius), min(height, cy + radius + 1)
    if x0 >= x1 or y0 >= y1:
        return np.empty((0, 3), dtype=np.uint8)
    patch = bgr[y0:y1, x0:x1].reshape(-1, 3)
    xs = np.arange(x0, x1)[None, :] - cx
    ys = np.arange(y0, y1)[:, None] - cy
    mask = (xs * xs + ys * ys <= radius * radius).reshape(-1)
    return patch[mask]


def sample_skin(
    bgr: np.ndarray, points: list[tuple[float, float]], cheek_width: float
) -> dict[str, Any]:
    radius = max(4, int(round(cheek_width * SKIN_PATCH_RADIUS_FRACTION)))
    patches: list[dict[str, Any]] = []
    patch_labs: list[list[float]] = []
    patch_mads: list[dict[str, float]] = []
    sampled_total = 0
    retained_total = 0

    for outer_eye, mouth_corner, cheek_edge in (
        (EYE_LEFT_OUTER, MOUTH_LEFT, CHEEK_LEFT),
        (EYE_RIGHT_OUTER, MOUTH_RIGHT, CHEEK_RIGHT),
    ):
        centre = (
            (points[outer_eye][0] + points[mouth_corner][0] + points[cheek_edge][0]) / 3.0,
            (points[outer_eye][1] + points[mouth_corner][1] + points[cheek_edge][1]) / 3.0,
        )
        pixels = disc_pixels(bgr, centre, radius)
        sampled_total += int(len(pixels))
        kept = unclipped(pixels) if len(pixels) else pixels
        retained_total += int(len(kept))
        patch: dict[str, Any] = {
            'centre': [round(centre[0], 1), round(centre[1], 1)],
            'radiusPx': radius,
            'sampledPx': int(len(pixels)),
            'retainedPx': int(len(kept)),
            'hex': None,
        }
        if len(kept):
            stats = median_lab(kept)
            patch['hex'] = stats['hex']
            patch_labs.append(stats['lab'])
            patch_mads.append(stats['mad'])
        patches.append(patch)

    result: dict[str, Any] = {
        'hex': None,
        'source': 'none',
        'patches': patches,
        'sampledPx': sampled_total,
        'retainedPx': retained_total,
    }
    if not patch_labs:
        result['confidence'] = {'level': 'none', 'score': 0.0, 'retainedFraction': 0.0}
        return result

    # Average the per-cheek medians so side lighting does not create one
    # bimodal sample. Two patches, so the average is the median of medians.
    averaged = [round(sum(values) / len(patch_labs), 1) for values in zip(*patch_labs)]
    mean_mad_l = sum(mad['L'] for mad in patch_mads) / len(patch_mads)
    mean_mad_b = sum(mad['b'] for mad in patch_mads) / len(patch_mads)
    result.update({
        'hex': lab_units_to_hex(averaged),
        'source': 'measured',
        'labMedian': averaged,
        'mad': {'L': round(mean_mad_l, 1), 'b': round(mean_mad_b, 1)},
        'confidence': confidence_report(retained_total, sampled_total, mean_mad_l, mean_mad_b),
    })
    return result


def sample_hair(
    bgr: np.ndarray,
    points: list[tuple[float, float]],
    cheek_width: float,
    face_height: float,
    skin_lightness: float | None,
    fallback_hex: str | None,
) -> dict[str, Any]:
    height, width = bgr.shape[:2]
    centre_x = points[FOREHEAD_CENTRE][0]
    forehead_y = points[FOREHEAD_CENTRE][1]
    top = int(round(forehead_y - HAIR_PATCH_TOP_FRACTION * face_height))
    bottom = int(round(forehead_y - HAIR_PATCH_BOTTOM_FRACTION * face_height))
    half_width = int(round(HAIR_PATCH_HALF_WIDTH_FRACTION * cheek_width))
    x0, x1 = max(0, int(round(centre_x)) - half_width), min(width, int(round(centre_x)) + half_width)
    y0, y1 = max(0, top), min(height, bottom)
    rect = {
        'x': x0,
        'y': y0,
        'width': max(0, x1 - x0),
        'height': max(0, y1 - y0),
    }
    result: dict[str, Any] = {
        'hex': None,
        'source': 'none',
        'rect': rect,
        'sampledPx': rect['width'] * rect['height'],
        'retainedPx': 0,
        'clusterPx': 0,
        'rejected': None,
    }
    if result['sampledPx'] == 0:
        result['rejected'] = 'hair patch fell outside the photo'
    else:
        patch = bgr[y0:y1, x0:x1].reshape(-1, 3)
        kept = unclipped(patch)
        result['retainedPx'] = int(len(kept))
        if len(kept) == 0:
            result['rejected'] = 'every hair-patch pixel was clipped'
        elif len(kept) / result['sampledPx'] < HAIR_MIN_RETAINED_FRACTION:
            result['rejected'] = 'more than half the hair patch was clipped'
        else:
            lab = cv2.cvtColor(kept.reshape(-1, 1, 3), cv2.COLOR_BGR2LAB).reshape(-1, 3)
            # Hair is the darker population in a box that contains skull edge and
            # possibly background; keep the darker percentile before measuring.
            threshold = float(np.percentile(lab[:, 0], HAIR_TRIM_PERCENTILE))
            cluster = kept[lab[:, 0] <= threshold]
            result['clusterPx'] = int(len(cluster))
            stats = median_lab(cluster)
            lightness = stats['lab'][0]
            result['labMedian'] = stats['lab']
            result['mad'] = stats['mad']
            if skin_lightness is None:
                result['rejected'] = 'no skin sample to compare against'
            elif lightness > skin_lightness - HAIR_MIN_DARKER_L:
                result['rejected'] = (
                    f'hair L* {lightness} is not {HAIR_MIN_DARKER_L} below skin L* {skin_lightness}'
                )
            else:
                result.update({
                    'hex': stats['hex'],
                    'source': 'measured',
                    'confidence': confidence_report(
                        len(kept), result['sampledPx'], stats['mad']['L'], stats['mad']['b']
                    ),
                })
                return result

    if fallback_hex:
        result.update({'hex': fallback_hex, 'source': 'observation'})
    return result


def build_appearance(
    photo: dict[str, Any],
    observation: dict[str, Any],
    points: list[tuple[float, float]],
    bgr: np.ndarray,
    tool_version: str,
    extracted_at: str,
) -> tuple[dict[str, Any], dict[str, Any]]:
    photo_id = photo['photoId']
    ratios = measure_ratios(points)
    face_shape, shape_rule = classify_face_shape(ratios)

    values: dict[str, Any] = {}
    windows_used: dict[str, Any] = {}
    parameters: dict[str, Any] = {}
    defaulted: list[str] = []

    for name in (
        'faceWidth',
        'faceLength',
        'jawWidth',
        'chinRoundness',
        'cheekFullness',
        'eyeSize',
        'eyeSpacing',
        'eyeHeight',
        'eyeTilt',
        'noseWidth',
        'noseLength',
        'mouthWidth',
        'mouthFullness',
    ):
        window = PARAMETER_WINDOWS[name]
        value = remap(ratios[name], window, signed=name == 'eyeTilt')
        values[name] = value
        windows_used[name] = {'lo': window[0], 'hi': window[1], 'ratio': ratios[name]}
        parameters[name] = {
            'value': value,
            'basis': 'estimated',
            'photoIds': [photo_id],
        }

    for name in UNMEASURABLE_PARAMETERS:
        parameters[name] = {
            'value': FACE_DEFAULTS[name],
            'basis': 'default',
            'photoIds': [],
        }
        defaulted.append(name)

    hair_style = observation.get('hairStyle') or FACE_DEFAULTS['hairStyle']
    hair_style_basis = 'default' if hair_style == FACE_DEFAULTS['hairStyle'] else 'estimated'
    if hair_style_basis == 'default':
        defaulted.append('hairStyle')

    glasses_observation = observation.get('glasses') or GLASSES_DEFAULT
    glasses_style = glasses_observation.get('style') or GLASSES_DEFAULT['style']
    glasses_enabled = bool(glasses_observation.get('enabled', False))
    glasses_basis = (
        'default'
        if (not glasses_enabled and glasses_style == GLASSES_DEFAULT['style'])
        else 'estimated'
    )
    if glasses_basis == 'default':
        defaulted.append('glasses')

    facial_hair_observation = observation.get('facialHair') or FACIAL_HAIR_DEFAULT
    facial_hair_style = facial_hair_observation.get('style') or FACIAL_HAIR_DEFAULT['style']
    facial_hair_enabled = bool(facial_hair_observation.get('enabled', False))
    facial_hair_basis = (
        'default'
        if (not facial_hair_enabled and facial_hair_style == FACIAL_HAIR_DEFAULT['style'])
        else 'estimated'
    )
    if facial_hair_basis == 'default':
        defaulted.append('facialHair')

    cheek_width = distance(points[CHEEK_LEFT], points[CHEEK_RIGHT])
    face_height = distance(points[FOREHEAD_CENTRE], points[CHIN])
    skin = sample_skin(bgr, points, cheek_width)
    skin_lightness = skin['labMedian'][0] if 'labMedian' in skin else None
    hair = sample_hair(
        bgr,
        points,
        cheek_width,
        face_height,
        skin_lightness,
        observation.get('hairColor'),
    )

    appearance: dict[str, Any] = {
        'appearanceId': photo['candidateId'].removeprefix('official-'),
        'candidateId': photo['candidateId'],
        'schemaVersion': 1,
        'faceShape': face_shape,
        'faceWidth': parameters['faceWidth'],
        'faceLength': parameters['faceLength'],
        'jawWidth': parameters['jawWidth'],
        'chinRoundness': parameters['chinRoundness'],
        'cheekFullness': parameters['cheekFullness'],
        'eyeSize': parameters['eyeSize'],
        'eyeSpacing': parameters['eyeSpacing'],
        'eyeHeight': parameters['eyeHeight'],
        'eyeTilt': parameters['eyeTilt'],
        'eyebrowThickness': parameters['eyebrowThickness'],
        'eyebrowAngle': parameters['eyebrowAngle'],
        'noseWidth': parameters['noseWidth'],
        'noseLength': parameters['noseLength'],
        'mouthWidth': parameters['mouthWidth'],
        'mouthFullness': parameters['mouthFullness'],
        'hairStyle': hair_style,
        'hairVolume': parameters['hairVolume'],
        'glasses': {
            'enabled': glasses_enabled,
            'style': glasses_style,
            'frameThickness': GLASSES_FRAME_THICKNESS,
        },
        'facialHair': {
            'enabled': facial_hair_enabled,
            'style': facial_hair_style,
            'density': FACIAL_HAIR_DENSITY,
        },
        'observedColors': {
            'hair': hair['hex'],
            'skin': skin['hex'],
        },
        'categoricalEvidence': {
            'faceShape': {'basis': 'estimated', 'photoIds': [photo_id]},
            'hairStyle': {
                'basis': hair_style_basis,
                'photoIds': [photo_id] if hair_style_basis == 'estimated' else [],
            },
            'glasses': {
                'basis': glasses_basis,
                'photoIds': [photo_id] if glasses_basis == 'estimated' else [],
            },
            'facialHair': {
                'basis': facial_hair_basis,
                'photoIds': [photo_id] if facial_hair_basis == 'estimated' else [],
            },
        },
        'sourcePhotoIds': [photo_id],
        'defaultedParameters': defaulted,
        'extraction': {
            'tool': TOOL_NAME,
            'toolVersion': tool_version,
            'extractedAt': extracted_at,
            'script': SCRIPT_PATH,
        },
        'reviewStatus': 'extracted',
    }

    report_entry: dict[str, Any] = {
        'candidateId': photo['candidateId'],
        'appearanceId': appearance['appearanceId'],
        'photoId': photo_id,
        'usability': photo['usability'],
        'view': photo['view'],
        'identityConfidence': photo['identityConfidence'],
        'imageWidth': photo['width'],
        'imageHeight': photo['height'],
        'measuredRatios': ratios,
        'windows': windows_used,
        'values': values,
        'defaultedParameters': defaulted,
        'faceShape': face_shape,
        'faceShapeRule': shape_rule,
        'categorical': {
            'hairStyle': {'value': hair_style, 'basis': hair_style_basis},
            'glasses': {'enabled': glasses_enabled, 'style': glasses_style, 'basis': glasses_basis},
            'facialHair': {
                'enabled': facial_hair_enabled,
                'style': facial_hair_style,
                'basis': facial_hair_basis,
            },
        },
        'colors': {'skin': skin, 'hair': hair},
        'lowConfidence': photo['usability'] == 'low-resolution',
    }
    return appearance, report_entry


def find_photo_file(photo_dir: str, photo_id: str) -> str:
    for extension in ('.jpg', '.jpeg', '.png', '.webp'):
        candidate = os.path.join(photo_dir, photo_id + extension)
        if os.path.isfile(candidate):
            return candidate
    raise SystemExit(f'error: no image file for {photo_id} in {photo_dir}')


def face_box_from_points(
    points: list[tuple[float, float]], width: int, height: int
) -> dict[str, float]:
    xs = [point[0] / width for point in points]
    ys = [point[1] / height for point in points]
    return {
        'x': round(min(xs), 3),
        'y': round(min(ys), 3),
        'width': round(max(xs) - min(xs), 3),
        'height': round(max(ys) - min(ys), 3),
    }


FACE_BOX_TOLERANCE = 0.1


def check_face_box(
    photo_id: str, recorded: dict[str, float] | None, detected: dict[str, float]
) -> dict[str, Any]:
    if recorded is None:
        return {
            'photoId': photo_id,
            'recorded': None,
            'detected': detected,
            'status': 'no-recorded-faceBox',
            'maxDelta': None,
        }
    deltas = {
        key: abs(float(recorded[key]) - detected[key])
        for key in ('x', 'y', 'width', 'height')
    }
    max_delta = round(max(deltas.values()), 3)
    status = 'match' if max_delta <= FACE_BOX_TOLERANCE else 'mismatch'
    return {
        'photoId': photo_id,
        'recorded': recorded,
        'detected': detected,
        'status': status,
        'maxDelta': max_delta,
        'deltas': {key: round(value, 3) for key, value in deltas.items()},
    }


DEBUG_MAX_SIDE = 900


def write_debug_overlay(
    path: str,
    bgr: np.ndarray,
    points: list[tuple[float, float]],
    photo_id: str,
    candidate_id: str,
    appearance: dict[str, Any],
    skin: dict[str, Any],
    hair: dict[str, Any],
    detected_box: dict[str, float],
) -> None:
    height, width = bgr.shape[:2]
    scale = min(1.0, DEBUG_MAX_SIDE / max(width, height))
    canvas = cv2.resize(bgr, (int(round(width * scale)), int(round(height * scale))), interpolation=cv2.INTER_AREA)
    canvas = canvas.copy()

    for x, y in points:
        cv2.circle(canvas, (int(round(x * scale)), int(round(y * scale))), 1, (0, 255, 255), -1)

    anchors = {
        FOREHEAD_CENTRE: '10',
        CHIN: '152',
        CHEEK_LEFT: '234',
        CHEEK_RIGHT: '454',
        JAW_LEFT: '172',
        JAW_RIGHT: '397',
        EYE_LEFT_OUTER: '33',
        EYE_LEFT_INNER: '133',
        EYE_RIGHT_INNER: '362',
        EYE_RIGHT_OUTER: '263',
        EYE_LEFT_UPPER: '159',
        EYE_LEFT_LOWER: '145',
        EYE_RIGHT_UPPER: '386',
        EYE_RIGHT_LOWER: '374',
        IRIS_LEFT: '468',
        IRIS_RIGHT: '473',
        NOSE_BRIDGE: '168',
        NOSE_TIP: '1',
        ALAR_LEFT: '129',
        ALAR_RIGHT: '358',
        MOUTH_LEFT: '61',
        MOUTH_RIGHT: '291',
        LIP_OUTER_TOP: '0',
        LIP_OUTER_BOTTOM: '17',
        FOREHEAD_LEFT: '103',
        FOREHEAD_RIGHT: '332',
    }
    for index, label in anchors.items():
        x = int(round(points[index][0] * scale))
        y = int(round(points[index][1] * scale))
        cv2.circle(canvas, (x, y), 4, (0, 0, 255), -1)
        cv2.putText(canvas, label, (x + 5, y - 5), cv2.FONT_HERSHEY_SIMPLEX, 0.4, (0, 200, 0), 1, cv2.LINE_AA)

    for sample, colour in ((skin, (0, 255, 0)), (hair, (255, 128, 0))):
        for patch in sample.get('patches', []):
            centre = (int(round(patch['centre'][0] * scale)), int(round(patch['centre'][1] * scale)))
            cv2.circle(canvas, centre, max(2, int(round(patch['radiusPx'] * scale))), colour, 1)
        rect = sample.get('rect')
        if rect:
            cv2.rectangle(
                canvas,
                (int(round(rect['x'] * scale)), int(round(rect['y'] * scale))),
                (int(round((rect['x'] + rect['width']) * scale)), int(round((rect['y'] + rect['height']) * scale))),
                colour,
                1,
            )

    cv2.rectangle(
        canvas,
        (int(round(detected_box['x'] * width * scale)), int(round(detected_box['y'] * height * scale))),
        (
            int(round((detected_box['x'] + detected_box['width']) * width * scale)),
            int(round((detected_box['y'] + detected_box['height']) * height * scale)),
        ),
        (255, 0, 255),
        1,
    )

    caption = (
        f'{photo_id} | {candidate_id} | {appearance["faceShape"]} | '
        f'skin {skin["hex"]} ({skin["confidence"]["level"]}) | '
        f'hair {hair["hex"]} ({hair["source"]})'
    )
    banner_height = 28
    canvas = cv2.copyMakeBorder(canvas, banner_height, 0, 0, 0, cv2.BORDER_CONSTANT, value=(32, 32, 32))
    cv2.putText(canvas, caption, (8, 19), cv2.FONT_HERSHEY_SIMPLEX, 0.45, (255, 255, 255), 1, cv2.LINE_AA)
    cv2.imwrite(path, canvas)


def load_json(path: str) -> Any:
    try:
        with open(path, encoding='utf-8') as handle:
            return json.load(handle)
    except OSError as error:
        raise SystemExit(f'error: cannot read {path}: {error}') from error


def sha256_file(path: str) -> str:
    digest = hashlib.sha256()
    with open(path, 'rb') as handle:
        for chunk in iter(lambda: handle.read(1 << 20), b''):
            digest.update(chunk)
    return digest.hexdigest()


def write_json(path: str, payload: Any) -> None:
    os.makedirs(os.path.dirname(path) or '.', exist_ok=True)
    with open(path, 'w', encoding='utf-8') as handle:
        json.dump(payload, handle, indent=2, ensure_ascii=False)
        handle.write('\n')


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description='Extract facial proportions from licensed portraits.')
    parser.add_argument('--photos', default='data/avatars/likeness/photos.json')
    parser.add_argument('--photo-dir', default='tmp/avatar-pipeline/photos')
    parser.add_argument('--observations', default='data/avatars/likeness/observations.json')
    parser.add_argument('--out', default='data/avatars/likeness/appearances.json')
    parser.add_argument('--report', default='.cache/reports/avatar/face-extraction.json')
    parser.add_argument('--model', default='tmp/avatar-pipeline/models/face_landmarker.task')
    parser.add_argument('--debug-dir', default=None)
    args = parser.parse_args(argv)

    photo_file = load_json(args.photos)
    observation_file = load_json(args.observations)
    observations = {
        entry['candidateId']: entry for entry in observation_file['observations']
    }
    extracted_at = f"{photo_file['retrievedAt']}T00:00:00+08:00"
    tool_version = getattr(mp, '__version__', 'unknown')

    photos = [photo for photo in photo_file['photos'] if photo['usability'] in PROCESSED_USABILITY]
    photos.sort(key=lambda photo: photo['photoId'])

    observations_schema_version = observation_file.get('schemaVersion')
    if observations_schema_version != 1:
        raise SystemExit(
            f'error: unsupported observations schemaVersion {observations_schema_version}'
        )

    if args.debug_dir:
        os.makedirs(args.debug_dir, exist_ok=True)

    appearances: list[dict[str, Any]] = []
    report_entries: list[dict[str, Any]] = []
    box_checks: list[dict[str, Any]] = []

    options = FaceLandmarkerOptions(
        base_options=BaseOptions(model_asset_path=args.model),
        running_mode=RunningMode.IMAGE,
        num_faces=1,
    )
    with FaceLandmarker.create_from_options(options) as landmarker:
        for photo in photos:
            photo_id = photo['photoId']
            image_path = find_photo_file(args.photo_dir, photo_id)
            bgr = cv2.imread(image_path, cv2.IMREAD_COLOR)
            if bgr is None:
                raise SystemExit(f'error: cannot decode {image_path}')
            height, width = bgr.shape[:2]
            if (width, height) != (photo['width'], photo['height']):
                raise SystemExit(
                    f'error: {photo_id} is {width}x{height} but photos.json records '
                    f"{photo['width']}x{photo['height']}; photo/record mismatch"
                )

            rgb = cv2.cvtColor(bgr, cv2.COLOR_BGR2RGB)
            image = mp.Image(image_format=mp.ImageFormat.SRGB, data=np.ascontiguousarray(rgb))
            result = landmarker.detect(image)
            if not result.face_landmarks:
                raise SystemExit(f'error: 0 faces detected in {photo_id}; refusing to guess')
            landmarks = result.face_landmarks[0]
            if len(landmarks) < 478:
                raise SystemExit(
                    f'error: {photo_id} produced {len(landmarks)} landmarks, expected 478'
                )

            points = pixel_landmarks(landmarks, width, height)
            detected_box = face_box_from_points(points, width, height)
            box_check = check_face_box(photo_id, photo['faceBox'], detected_box)
            box_checks.append(box_check)
            if box_check['status'] == 'mismatch':
                raise SystemExit(
                    f"error: detected face box for {photo_id} differs from photos.json by "
                    f"{box_check['maxDelta']} normalized units (> {FACE_BOX_TOLERANCE}); "
                    'photo/record mismatch'
                )

            observation = observations.get(photo['candidateId'], {})
            appearance, report_entry = build_appearance(
                photo, observation, points, bgr, tool_version, extracted_at
            )
            appearances.append(appearance)
            report_entries.append(report_entry)

            if args.debug_dir:
                write_debug_overlay(
                    os.path.join(args.debug_dir, f'{photo_id}.png'),
                    bgr,
                    points,
                    photo_id,
                    photo['candidateId'],
                    appearance,
                    report_entry['colors']['skin'],
                    report_entry['colors']['hair'],
                    detected_box,
                )
            print(f'extracted {photo_id}', file=sys.stderr)

    if not appearances:
        raise SystemExit('error: no usable photos found; nothing written')

    write_json(args.out, {'schemaVersion': 1, 'appearances': appearances})

    report = {
        'tool': {'name': TOOL_NAME, 'version': tool_version, 'script': SCRIPT_PATH},
        'model': {'path': args.model, 'sha256': sha256_file(args.model)},
        'inputs': {
            'photos': args.photos,
            'observations': args.observations,
            'photoDir': args.photo_dir,
        },
        'extractedAt': extracted_at,
        'candidateCount': len(report_entries),
        'lowConfidencePhotoIds': [
            entry['photoId'] for entry in report_entries if entry['lowConfidence']
        ],
        'faceBoxCheck': box_checks,
        'candidates': report_entries,
        'limitations': [
            'Single-photo 478-point landmarks are a 2D projection: no skull depth, brow ridge depth or head volume is measured, so these are proportion estimates, not 3D head geometry.',
            'Nothing here is a verified likeness. reviewStatus stays "extracted" until a named human compares a rendered head kit against the licensed photograph.',
            'faceShape comes from coarse ratio thresholds on one photograph and is the least reliable output; a reviewer may override it.',
            'eyeTilt is systematically positive for this landmark set, so it is a relative canthal tilt, not an absolute measurement.',
            'Width ratios are distorted by head yaw: the three-quarter-view portrait (commons-bai-ciao-yin) and any slight head turn widen or narrow the cheek measurement.',
            'mouthFullness uses outer lip height, so an open-mouth smile inflates it (see per-candidate measuredRatios for the raw value).',
            'Hair colour falls back to observations.json hairColor when the hairline patch is not measurably darker than skin; the per-candidate colors.hair.source records which path was taken.',
            'eyebrowThickness, eyebrowAngle and hairVolume are not measurable from these landmarks and are always schema defaults (basis "default", no photoIds).',
            'Hair style, glasses and facial hair are copied from the machine-assisted observations.json labels and remain basis "estimated"; they are never upgraded to "observed".',
        ],
    }
    write_json(args.report, report)
    print(f'wrote {len(appearances)} appearances to {args.out}', file=sys.stderr)
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
