/** Visual calibration only. Server positions, pickup heights and station rules stay authoritative. */
export type PropFrame = {
  width: number;
  height: number;
  anchorX: number;
  anchorY: number;
  groundFootprintDiameterPx: number;
};
export type StationFrame = PropFrame & {
  key: string;
  image: string;
  screenAngle: number;
  modelYaw: number;
};
export type StationDirections = { version: 1; frames: StationFrame[] };
export function validPropFrame(value: unknown): value is PropFrame {
  if (!value || typeof value !== "object") return false;
  const f = value as PropFrame;
  return (
    [
      f.width,
      f.height,
      f.anchorX,
      f.anchorY,
      f.groundFootprintDiameterPx,
    ].every(Number.isFinite) &&
    f.width > 0 &&
    f.height > 0 &&
    f.groundFootprintDiameterPx > 0 &&
    f.anchorX >= 0 &&
    f.anchorX <= 1 &&
    f.anchorY >= 0 &&
    f.anchorY <= 1
  );
}
export function selectStationFrame(
  value: unknown,
  position: { x: number; y: number },
): StationFrame | null {
  if (
    !value ||
    typeof value !== "object" ||
    ![position.x, position.y].every(Number.isFinite) ||
    (position.x === 0 && position.y === 0)
  )
    return null;
  const m = value as StationDirections;
  if (
    m.version !== 1 ||
    !Array.isArray(m.frames) ||
    m.frames.length !== 3 ||
    !m.frames.every(
      (f) =>
        validPropFrame(f) &&
        /^station-v3-[0-2]$/.test(f.key) &&
        f.image === `${f.key}.png` &&
        [f.screenAngle, f.modelYaw].every(Number.isFinite),
    ) ||
    new Set(m.frames.map((f) => f.key)).size !== 3
  )
    return null;
  const inward = Math.atan2(-position.y, -position.x);
  const distance = (f: StationFrame) =>
    Math.abs(
      Math.atan2(
        Math.sin(f.screenAngle - inward),
        Math.cos(f.screenAngle - inward),
      ),
    );
  return m.frames.reduce((best, f) =>
    distance(f) < distance(best) ? f : best,
  );
}
export function batteryDisplay(
  value: unknown,
): { width: number; height: number; anchorX: number; anchorY: number } | null {
  if (!validPropFrame(value)) return null;
  const m = value as PropFrame & {
    version: number;
    visibleHeightPx: number;
    worldVisibleHeight: number;
  };
  if (
    m.version !== 1 ||
    ![m.visibleHeightPx, m.worldVisibleHeight].every(Number.isFinite) ||
    m.visibleHeightPx <= 0 ||
    m.visibleHeightPx > m.height ||
    m.worldVisibleHeight <= 0
  )
    return null;
  const scale = m.worldVisibleHeight / m.visibleHeightPx;
  return {
    width: m.width * scale,
    height: m.height * scale,
    anchorX: m.anchorX,
    anchorY: m.anchorY,
  };
}
