/** Presentation-only rover pose selection. Angles are screen-space: +Y down. */
export type Steer = -1 | 0 | 1;
export type VisualState = {
  x: number;
  y: number;
  angle: number;
  heading: number;
  /** Signed continuous wheel cycles; quantized only when resolving artwork. */
  phase: number;
  steer: Steer;
  steerSignal?: number;
  steerAgeMs?: number;
  /** Rebase after inactive or invalid samples, including the first resumed sample. */
  active?: boolean;
};
export type VisualInput = {
  x: number;
  y: number;
  angle: number;
  dtMs: number;
  active: boolean;
  reset: boolean;
  worldUnitsPerTurn: number;
};
export type LayerRecord = {
  texture: string;
  frame: string;
  width: number;
  height: number;
  anchorX: number;
  anchorY: number;
  offsetX: number;
  offsetY: number;
  depthOrder: number;
  role?: string;
  id?: string;
};
export type WheelPoses = Record<string, Record<string, LayerRecord[]>>;
export type WheelRecord = {
  id: string;
  front: boolean;
  groundAnchor?: number[];
  poses: WheelPoses;
  accents?: Record<string, WheelPoses>;
};
export type HeadingRecord = {
  screenAngle: number;
  modelYaw: number;
  wheelTravelPerCycle?: number;
  cargoProjection?: {
    origin: number[];
    xAxis: number[];
    yAxis: number[];
    legacyXScale: number;
    legacyXOffset: number;
    legacyYScale: number;
  };
  body: Record<string, LayerRecord[]>;
  wheels: WheelRecord[];
};
export type RoverManifest = {
  version: 1;
  palettes: string[];
  referenceSize: number;
  worldWidth: number;
  wheelTravelPerCycle?: number;
  atlases: { key: string; image: string; data: string }[];
  headings: HeadingRecord[];
  /** Converts screen-space steering to the fixed Blender camera's local Z. */
  steeringSign?: -1 | 1;
};
const TAU = Math.PI * 2,
  STEP = TAU / 16;
const wrap = (a: number) => Math.atan2(Math.sin(a), Math.cos(a));
const mod = (n: number, d: number) => ((n % d) + d) % d;
const validHeading = (h: unknown): h is number =>
  typeof h === "number" && Number.isInteger(h) && h >= 0 && h < 16;

export function selectHeading(angle: number, previous: number | null): number {
  if (!Number.isFinite(angle)) return validHeading(previous) ? previous : 0;
  // A small deadband keeps a car parked near a sector boundary from flickering.
  if (
    validHeading(previous) &&
    Math.abs(wrap(angle - previous * STEP)) <= STEP / 2 + 0.04
  )
    return previous;
  return mod(Math.round(wrap(angle) / STEP), 16);
}

export function stepRoverVisual(
  previous: VisualState | null,
  input: VisualInput,
): VisualState {
  const finitePose = [input.x, input.y, input.angle].every(Number.isFinite);
  const x = Number.isFinite(input.x) ? input.x : (previous?.x ?? 0);
  const y = Number.isFinite(input.y) ? input.y : (previous?.y ?? 0);
  const angle = Number.isFinite(input.angle)
    ? wrap(input.angle)
    : (previous?.angle ?? 0);
  const dt = input.dtMs / 1000;
  const circumferenceValid =
    Number.isFinite(input.worldUnitsPerTurn) && input.worldUnitsPerTurn > 0;
  const sampleValid =
    finitePose &&
    Number.isFinite(dt) &&
    dt > 0 &&
    dt <= 0.25 &&
    circumferenceValid;
  const travel = previous ? Math.hypot(x - previous.x, y - previous.y) : 0;
  // Same stale-frame and displacement guard as the existing VehicleMotion visual.
  const valid =
    previous &&
    previous.active !== false &&
    input.active &&
    !input.reset &&
    sampleValid &&
    travel <= Math.max(100, 6000 * dt);
  let phase = Number.isFinite(previous?.phase) ? previous!.phase : 0;
  let steer: Steer = 0;
  let signal = 0;
  let age = (previous?.steerAgeMs ?? 150) + input.dtMs;
  if (valid) {
    const yaw = wrap(angle - previous.angle);
    const midpoint = previous.angle + yaw / 2;
    let longitudinal =
      (x - previous.x) * Math.cos(midpoint) +
      (y - previous.y) * Math.sin(midpoint);
    // Exact perpendicular travel may have a floating-point residue.
    if (Math.abs(longitudinal) < 1e-9) longitudinal = 0;
    phase += longitudinal / input.worldUnitsPerTurn;
    let target = 0;
    if (Math.abs(longitudinal) / dt > 5 || travel < 1e-9) {
      target =
        Math.max(-0.42, Math.min(0.42, (yaw / dt) * 0.12)) *
        (Math.sign(longitudinal) || 1);
    }
    const oldSignal = previous.steerSignal ?? 0;
    signal =
      previous.steerSignal === undefined
        ? target
        : oldSignal + (target - oldSignal) * (1 - Math.exp(-dt / 0.12));
    const old = previous.steer;
    steer =
      signal > 0.05
        ? 1
        : signal < -0.05
          ? -1
          : Math.abs(signal) < 0.018
            ? 0
            : old;
    if (steer !== old && age < 150) steer = old;
    if (steer !== old) age = 0;
  }
  return {
    x,
    y,
    angle,
    heading: selectHeading(angle, previous?.heading ?? null),
    phase,
    steer,
    steerSignal: valid ? signal : undefined,
    steerAgeMs: valid ? age : 150,
    active: input.active && sampleValid,
  };
}

function validLayer(
  layer: unknown,
  textures: Set<string>,
): layer is LayerRecord {
  if (!layer || typeof layer !== "object") return false;
  const l = layer as LayerRecord;
  return (
    typeof l.texture === "string" &&
    textures.has(l.texture) &&
    typeof l.frame === "string" &&
    l.frame.length > 0 &&
    [
      l.width,
      l.height,
      l.anchorX,
      l.anchorY,
      l.offsetX,
      l.offsetY,
      l.depthOrder,
    ].every(Number.isFinite) &&
    l.width > 0 &&
    l.height > 0
  );
}

/** Fail closed: renderer retains its complete old-car fallback, never half a car. */
export function resolveRoverLayers(
  manifest: unknown,
  palette: string,
  visual: VisualState,
): LayerRecord[] {
  if (!manifest || typeof manifest !== "object") return [];
  const m = manifest as RoverManifest;
  palette = palette.replace(/^#/, "").toLowerCase();
  if (
    m.version !== 1 ||
    !Array.isArray(m.palettes) ||
    m.palettes.length !== 8 ||
    !m.palettes.every(
      (c) => typeof c === "string" && /^[0-9a-f]{6}$/i.test(c),
    ) ||
    !m.palettes.includes(palette) ||
    m.referenceSize !== 192 ||
    !Number.isFinite(m.worldWidth) ||
    m.worldWidth <= 0 ||
    !Array.isArray(m.atlases) ||
    !m.atlases.length ||
    !m.atlases.every(
      (a) =>
        a &&
        typeof a.key === "string" &&
        typeof a.image === "string" &&
        typeof a.data === "string",
    ) ||
    !Array.isArray(m.headings) ||
    m.headings.length !== 16 ||
    !visual ||
    !validHeading(visual.heading) ||
    !Number.isFinite(visual.phase) ||
    ![-1, 0, 1].includes(visual.steer) ||
    (m.steeringSign !== undefined &&
      m.steeringSign !== 1 &&
      m.steeringSign !== -1)
  )
    return [];
  const heading = m.headings[visual.heading];
  if (
    !heading ||
    !Number.isFinite(heading.screenAngle) ||
    !Number.isFinite(heading.modelYaw) ||
    !heading.body ||
    !Array.isArray(heading.wheels) ||
    heading.wheels.length !== 4
  )
    return [];
  const textures = new Set(m.atlases.map((a) => a.key));
  const layers: LayerRecord[] = [];
  const append = (records: unknown): boolean => {
    if (
      !Array.isArray(records) ||
      !records.length ||
      !records.every((l) => validLayer(l, textures))
    )
      return false;
    layers.push(...records);
    return true;
  };
  if (!append(heading.body[palette])) return [];
  const phase = mod(Math.floor(visual.phase * 4), 4);
  const ids = new Set<string>();
  for (const wheel of heading.wheels) {
    if (
      !wheel ||
      typeof wheel.id !== "string" ||
      ids.has(wheel.id) ||
      typeof wheel.front !== "boolean"
    )
      return [];
    ids.add(wheel.id);
    const steer = wheel.front ? visual.steer * (m.steeringSign ?? 1) : 0;
    if (!append(wheel.poses?.[steer]?.[phase])) return [];
    if (
      wheel.accents !== undefined &&
      !append(wheel.accents?.[palette]?.[steer]?.[phase])
    )
      return [];
  }
  return layers.sort((a, b) => a.depthOrder - b.depthOrder);
}
