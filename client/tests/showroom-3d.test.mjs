import test from "node:test";
import assert from "node:assert/strict";
import * as THREE from "three";
import {
  applyShowroomColor,
  disposeShowroomObject,
  parseShowroomGLB,
} from "../src/showroom-3d.ts";
test("only exact three theme materials recolor; fixed magnet, rubber, shell are invariant", () => {
  const root = new THREE.Group();
  const names = [
    "theme_shellaccent",
    "theme_hub",
    "theme_light",
    "fixed_magnet_n",
    "fixed_magnet_s",
    "connector",
    "pole_letters",
    "fixed_shell",
    "rubber",
  ];
  const materials = names.map((name) => {
    const m = new THREE.MeshStandardMaterial({
      color: 0x123456,
      emissive: 0x000000,
      emissiveIntensity: 0.37,
    });
    m.name = name;
    return m;
  });
  root.add(new THREE.Mesh(new THREE.BoxGeometry(), materials));
  applyShowroomColor(root, "fb7185");
  for (let i = 0; i < materials.length; i++) {
    assert.equal(
      materials[i].color.getHexString(),
      i < 3 ? "fb7185" : "123456",
    );
    assert.equal(materials[i].emissiveIntensity, 0.37);
  }
  assert.equal(materials[1].emissive.getHexString(), "fb7185");
  assert.equal(materials[2].emissive.getHexString(), "fb7185");
  assert.equal(materials[0].emissive.getHexString(), "000000");
});
test("resource cleanup disposes each shared geometry, material and texture once", () => {
  const root = new THREE.Group(),
    geo = new THREE.BoxGeometry(),
    texture = new THREE.Texture(),
    mat = new THREE.MeshStandardMaterial({ map: texture });
  const counts = { geometry: 0, material: 0, texture: 0 };
  geo.addEventListener("dispose", () => counts.geometry++);
  mat.addEventListener("dispose", () => counts.material++);
  texture.addEventListener("dispose", () => counts.texture++);
  root.add(new THREE.Mesh(geo, mat), new THREE.Mesh(geo, [mat, mat]));
  disposeShowroomObject(root);
  assert.deepEqual(counts, { geometry: 1, material: 1, texture: 1 });
});
function glb() {
  const json = {
    asset: { version: "2.0" },
    scene: 0,
    scenes: [{ nodes: [0] }],
    nodes: [{ name: "Rover" }],
  };
  const content = new TextEncoder().encode(JSON.stringify(json));
  const padded = (content.length + 3) & ~3;
  const b = new ArrayBuffer(20 + padded),
    v = new DataView(b);
  v.setUint32(0, 0x46546c67, true);
  v.setUint32(4, 2, true);
  v.setUint32(8, b.byteLength, true);
  v.setUint32(12, padded, true);
  v.setUint32(16, 0x4e4f534a, true);
  new Uint8Array(b, 20).fill(32);
  new Uint8Array(b, 20, content.length).set(content);
  return b;
}
test("actual GLB parser accepts embedded scene and rejects invalid bytes", async () => {
  const root = await parseShowroomGLB(glb());
  assert.equal(root.children[0].name, "Rover");
  await assert.rejects(parseShowroomGLB(new ArrayBuffer(8)));
});

test("yaw-invariant camera fit uses tight projected cylinder bounds, not a loose bounding sphere", async () => {
  const { fitShowroomCamera } = await import("../src/showroom-3d.ts");
  const size = new THREE.Vector3(3.34136665, 1.53912121, 2.73500013);
  const camera = new THREE.OrthographicCamera();
  fitShowroomCamera(camera, size, 172 / 52);
  const elevation = Math.atan2(1.45, Math.SQRT2 * 2.1);
  const horizontal = Math.hypot(size.x / 2, size.z / 2);
  const expected =
    Math.max(
      (size.y * Math.cos(elevation)) / 2 + horizontal * Math.sin(elevation),
      horizontal / (172 / 52),
    ) * 1.08;
  assert.ok(Math.abs(camera.top - expected) < 1e-10);
  assert.ok(
    camera.top < (size.length() / 2) * 1.12 * 0.75,
    "must materially enlarge old 43px presentation",
  );
});
test("fixed-camera fit safely contains all bounding corners at sixteen yaw angles and both viewport shapes", async () => {
  const { fitShowroomCamera } = await import("../src/showroom-3d.ts");
  const size = new THREE.Vector3(3.34136665, 1.53912121, 2.73500013);
  let previousCamera;
  for (const aspect of [172 / 52, 192 / 84, 1, 0.5]) {
    const camera = new THREE.OrthographicCamera();
    fitShowroomCamera(camera, size, aspect);
    const pose = [...camera.position.toArray(), ...camera.quaternion.toArray()];
    if (previousCamera)
      assert.deepEqual(
        pose,
        previousCamera,
        "resize may fit frustum but never orbit camera",
      );
    previousCamera = pose;
    for (let h = 0; h < 16; h++)
      for (const x of [-size.x / 2, size.x / 2])
        for (const y of [0, size.y])
          for (const z of [-size.z / 2, size.z / 2]) {
            const p = new THREE.Vector3(x, y, z)
              .applyAxisAngle(new THREE.Vector3(0, 1, 0), (h * Math.PI) / 8)
              .project(camera);
            assert.ok(
              Math.abs(p.x) <= 1 / 1.08 + 1e-9,
              "horizontal crop at yaw " + h,
            );
            assert.ok(
              Math.abs(p.y) <= 1 / 1.08 + 1e-9,
              "vertical crop at yaw " + h,
            );
            assert.ok(Math.abs(p.z) < 1, "near/far crop");
          }
  }
});
