import { Euler, Quaternion, Vector3, MathUtils } from "three";
import type { SensorSample } from "../contracts";
// W3C device basis: x right, y toward top, z out of screen; intrinsic Z-X-Y.
// Scene: x east/right, y up, z south/toward viewer. Thus rotate world basis -90° about X.
// The hardware mesh stays in the natural device frame. Its screen content alone uses screenAngle.
export function deviceQuaternion(
  o: SensorSample["orientation"],
): Quaternion | null {
  if (o.alpha === null || o.beta === null || o.gamma === null) return null;
  const r = MathUtils.degToRad;
  return new Quaternion()
    .setFromAxisAngle(new Vector3(1, 0, 0), -Math.PI / 2)
    .multiply(
      new Quaternion().setFromEuler(
        new Euler(r(o.beta), r(o.gamma), r(o.alpha), "ZXY"),
      ),
    );
}
export function screenRotation(angle: number | null) {
  return MathUtils.degToRad(angle ?? 0);
}
