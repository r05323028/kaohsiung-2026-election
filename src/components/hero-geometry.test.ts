import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import {
  HSR_CANOPY,
  STADIUM_ROOF_START,
  STADIUM_ROOF_SWEEP,
  WEIWUYING_ROOF,
  makeFlaredCrownGeometry,
  makePagodaTierRoofGeometry,
  makeRadialShellGeometry,
  makeRibbonRoofGeometry,
  makeStrutGeometry,
  stadiumRoofInnerLift,
  stadiumRoofInnerRadius,
  stadiumRoofOuterLift,
  stadiumRoofOuterRadius,
  stadiumRibbonPoint,
  strutTransform,
  superellipseRadius,
  weiwuyingRadiusAt,
  weiwuyingRoofHeight,
  weiwuyingRoofUnderside,
  wheelCabinPose,
} from './hero-geometry';

function vertices(geometry: THREE.BufferGeometry): THREE.Vector3[] {
  const position = geometry.getAttribute('position');
  const points: THREE.Vector3[] = [];
  for (let index = 0; index < position.count; index += 1) {
    points.push(
      new THREE.Vector3(
        position.getX(index),
        position.getY(index),
        position.getZ(index),
      ),
    );
  }
  return points;
}

function expectFinite(geometry: THREE.BufferGeometry) {
  const position = geometry.getAttribute('position');
  expect(position.count).toBeGreaterThan(0);
  for (let index = 0; index < position.count; index += 1) {
    expect(Number.isFinite(position.getX(index))).toBe(true);
    expect(Number.isFinite(position.getY(index))).toBe(true);
    expect(Number.isFinite(position.getZ(index))).toBe(true);
  }
}

describe('landmark kit: connecting structure', () => {
  it('places a strut so both endpoints are touched', () => {
    const from: [number, number, number] = [-0.2, 0.3, 0.1];
    const to: [number, number, number] = [0.25, 0.62, -0.4];
    const transform = strutTransform(from, to, 0.02);
    const quaternion = new THREE.Quaternion().setFromEuler(
      new THREE.Euler(...transform.rotation),
    );
    const scale = new THREE.Vector3(...transform.scale);
    const center = new THREE.Vector3(...transform.position);
    const half = new THREE.Vector3(0, scale.y / 2, 0).applyQuaternion(quaternion);
    const start = center.clone().sub(half);
    const end = center.clone().add(half);

    expect(start.distanceTo(new THREE.Vector3(...from))).toBeLessThan(1e-6);
    expect(end.distanceTo(new THREE.Vector3(...to))).toBeLessThan(1e-6);
  });

  it('merges a frame into one finite geometry', () => {
    const frame = makeStrutGeometry([
      { from: [0, 0, 0], to: [0, 0.4, 0], width: 0.02 },
      { from: [0, 0.4, 0], to: [0.3, 0.4, 0], width: 0.02 },
      { from: [0.3, 0.4, 0], to: [0.3, 0, 0], width: 0.02 },
    ]);
    expectFinite(frame);
    expect(frame.getIndex()?.count).toBeGreaterThanOrEqual(3 * 36);
  });
});

describe('landmark kit: Weiwuying shell', () => {
  it('keeps the plan radius smooth and closed', () => {
    let previous = weiwuyingRadiusAt(0);
    for (let step = 1; step <= 360; step += 1) {
      const radius = weiwuyingRadiusAt((step / 360) * Math.PI * 2);
      expect(radius).toBeGreaterThan(0.9);
      expect(Math.abs(radius - previous)).toBeLessThan(0.01);
      previous = radius;
    }
  });

  it('raises a plateau above the sweeping rim and keeps a real thickness', () => {
    const center = weiwuyingRoofHeight(0, 0);
    const rim = weiwuyingRoofHeight(0, WEIWUYING_ROOF.radiusZ * 0.98);
    expect(center).toBeGreaterThan(rim);
    expect(center - rim).toBeGreaterThan(0.08);
    expect(weiwuyingRoofUnderside(0, 0)).toBeCloseTo(
      center - WEIWUYING_ROOF.thickness,
      6,
    );
  });

  it('builds a watertight shell with no NaN vertices', () => {
    const shell = makeRadialShellGeometry({
      radiusX: WEIWUYING_ROOF.radiusX,
      radiusZ: WEIWUYING_ROOF.radiusZ,
      radiusAt: weiwuyingRadiusAt,
      heightAt: weiwuyingRoofHeight,
      thickness: WEIWUYING_ROOF.thickness,
      segments: 48,
      rings: 10,
    });
    expectFinite(shell);
    shell.computeBoundingBox();
    const box = shell.boundingBox;
    expect(box).not.toBeNull();
    if (!box) return;
    expect(box.min.x).toBeLessThan(-0.95);
    expect(box.max.x).toBeGreaterThan(0.95);
    expect(box.min.y).toBeLessThan(0.42);
    expect(box.max.y).toBeGreaterThan(0.68);
  });
});

describe('landmark kit: HSR canopy', () => {
  it('is a closed slab, not a single sheet', () => {
    const canopy = makeRadialShellGeometry({
      radiusX: HSR_CANOPY.radiusX,
      radiusZ: HSR_CANOPY.radiusZ,
      radiusAt: (angle) => superellipseRadius(angle, 6),
      heightAt: (x, z) => 0.63 + 0.022 * (1 - (x / HSR_CANOPY.radiusX) ** 2) + 0.018 * (z / HSR_CANOPY.radiusZ),
      thickness: HSR_CANOPY.thickness,
      segments: 32,
      rings: 5,
    });
    expectFinite(canopy);
    canopy.computeBoundingBox();
    const box = canopy.boundingBox;
    if (!box) throw new Error('missing bounds');
    expect(box.max.y - box.min.y).toBeGreaterThan(HSR_CANOPY.thickness);
    expect(box.max.x).toBeCloseTo(HSR_CANOPY.radiusX, 1);
  });
});

describe('landmark kit: stadium ribbon', () => {
  it('keeps the ribbon between the bowl and the truss envelope', () => {
    for (let step = 0; step <= 20; step += 1) {
      const angle = STADIUM_ROOF_START + (step / 20) * STADIUM_ROOF_SWEEP;
      expect(stadiumRoofInnerRadius(angle)).toBeLessThan(
        stadiumRoofOuterRadius(angle),
      );
      expect(stadiumRoofInnerLift(angle)).toBeGreaterThan(0.5);
      expect(stadiumRoofOuterLift(angle)).toBeLessThan(
        stadiumRoofInnerLift(angle),
      );
      const point = stadiumRibbonPoint(
        angle,
        stadiumRoofOuterRadius,
        stadiumRoofOuterLift,
      );
      expect(point[1]).toBeLessThan(0.82);
    }
  });

  it('closes the ribbon cross-section and caps both ends', () => {
    const ribbon = makeRibbonRoofGeometry({
      startAngle: STADIUM_ROOF_START,
      sweep: STADIUM_ROOF_SWEEP,
      segments: 24,
      thickness: 0.03,
      innerRadius: stadiumRoofInnerRadius,
      outerRadius: stadiumRoofOuterRadius,
      innerLift: stadiumRoofInnerLift,
      outerLift: stadiumRoofOuterLift,
      squashZ: 0.72,
    });
    expectFinite(ribbon);
    expect(ribbon.getIndex()?.count).toBeGreaterThan(24 * 4 * 6);
    ribbon.computeBoundingBox();
    const box = ribbon.boundingBox;
    if (!box) throw new Error('missing bounds');
    expect(box.max.y - box.min.y).toBeGreaterThan(0.03);
  });
});

describe('landmark kit: pagoda tier roof', () => {
  it('lifts the eave corners above the eave mid-edge', () => {
    const roof = makePagodaTierRoofGeometry({
      halfWidth: 0.2,
      rise: 0.06,
      upturn: 0.025,
      thickness: 0.012,
      segments: 32,
      rings: 5,
    });
    const points = vertices(roof);
    const eave = points.filter((point) => point.y > -0.02 && point.y < 0.06);
    const corner = points.filter(
      (point) =>
        Math.abs(Math.abs(point.x) - 0.2 * 1.06) < 0.01 &&
        Math.abs(Math.abs(point.z) - 0.2 * 1.06) < 0.01,
    );
    expect(corner.length).toBeGreaterThan(0);
    const cornerHeight = Math.max(...corner.map((point) => point.y));
    const midEdgeHeight = Math.min(...eave.map((point) => point.y));
    expect(cornerHeight).toBeGreaterThan(midEdgeHeight + 0.015);
  });

  it('has a visible underside', () => {
    const roof = makePagodaTierRoofGeometry({
      halfWidth: 0.2,
      rise: 0.06,
      upturn: 0.025,
      thickness: 0.012,
    });
    const ys = vertices(roof).map((point) => point.y);
    expect(Math.min(...ys)).toBeLessThan(-0.01);
  });
});

describe('landmark kit: Sky Tower crown', () => {
  it('flares outward and notches the front and back', () => {
    const crown = makeFlaredCrownGeometry({
      baseRadius: 0.1,
      topRadius: 0.16,
      height: 0.12,
      notch: 0.05,
    });
    expectFinite(crown);
    const points = vertices(crown);
    const front = points.filter(
      (point) => Math.abs(point.z) > 0.14 && Math.abs(point.x) < 0.05,
    );
    const side = points.filter(
      (point) => Math.abs(point.x) > 0.14 && Math.abs(point.z) < 0.05,
    );
    expect(front.length).toBeGreaterThan(0);
    expect(side.length).toBeGreaterThan(0);
    expect(Math.max(...points.map((point) => Math.abs(point.x)))).toBeGreaterThan(
      0.15,
    );
    expect(Math.max(...side.map((point) => point.y))).toBeGreaterThan(
      Math.max(...front.map((point) => point.y)),
    );
  });
});

describe('landmark kit: ferris wheel kinematics', () => {
  it('spaces cabins evenly on the rim', () => {
    const radius = 0.4;
    const count = 16;
    const poses = Array.from({ length: count }, (_, index) =>
      wheelCabinPose(index, count, radius, 0),
    );
    for (const pose of poses) {
      expect(Math.hypot(pose.x, pose.y)).toBeCloseTo(radius, 6);
    }
    const angles = poses.map((pose) => Math.atan2(pose.y, pose.x));
    for (let index = 1; index < angles.length; index += 1) {
      const current = angles[index] ?? 0;
      const previous = angles[index - 1] ?? 0;
      const wrapped =
        (current - previous + Math.PI * 2) % (Math.PI * 2);
      expect(wrapped).toBeCloseTo((Math.PI * 2) / count, 6);
    }
  });

  it('counter-rotates every cabin to stay upright', () => {
    const count = 16;
    const wheelAngle = 1.234;
    for (let index = 0; index < count; index += 1) {
      const pose = wheelCabinPose(index, count, 0.4, wheelAngle);
      expect(pose.counterRotation + wheelAngle).toBeCloseTo(0, 6);
    }
  });
});
