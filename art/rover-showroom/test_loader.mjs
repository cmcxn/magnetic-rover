/** Real Three GLTFLoader contract test; run after npm ci in client. */
import fs from 'node:fs';
import assert from 'node:assert/strict';
import {GLTFLoader} from '../../client/node_modules/three/examples/jsm/loaders/GLTFLoader.js';
import {Box3,Vector3} from '../../client/node_modules/three/build/three.module.js';
const root=new URL('../../client/public/assets/cartoon/rover-showroom/',import.meta.url);
const data=fs.readFileSync(new URL('rover.glb',root));
const manifest=JSON.parse(fs.readFileSync(new URL('manifest.json',root)));
const gltf=await new Promise((resolve,reject)=>new GLTFLoader().parse(data.buffer.slice(data.byteOffset,data.byteOffset+data.byteLength),'',resolve,reject));
gltf.scene.updateMatrixWorld(true);
const box=new Box3().setFromObject(gltf.scene,true);let meshes=0,triangles=0;const names=[];
gltf.scene.traverse(o=>{if(!o.isMesh)return;meshes++;triangles+=o.geometry.index.count/3;names.push(o.material.name);assert(o.geometry.attributes.normal);});
for(const end of ['min','max'])for(let k=0;k<3;k++)assert(Math.abs(box[end].getComponent(k)-manifest.bounds[end][k])<0.0001,`${end}[${k}] bounds`);
assert.equal(meshes,12);assert.equal(triangles,86348);for(const n of Object.values(manifest.themeMaterials))assert(names.includes(n));
console.log(JSON.stringify({loader:'Three GLTFLoader',meshes,triangles,bounds:{min:box.min.toArray(),max:box.max.toArray()},themeMaterials:manifest.themeMaterials},null,2));
