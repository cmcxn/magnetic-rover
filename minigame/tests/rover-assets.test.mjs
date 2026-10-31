import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import path from 'node:path';
const root=path.resolve(import.meta.dirname,'../..');
test('mini-game invokes shared atlas preloader with art base, H5 uses assets base',()=>{
 const mini=fs.readFileSync(path.join(root,'minigame/src/main.ts'),'utf8');
 const world=fs.readFileSync(path.join(root,'client/src/world.ts'),'utf8');
 assert.match(mini,/this\.preloadRoverAssets\("art\/cartoon\/rover-v3"\)/);
 assert.match(world,/this\.preloadRoverAssets\("\/assets\/cartoon\/rover-v3"\)/);
 assert.match(world,/this\.load\.atlas\(\s*atlas\.key/);
});
test('mini-game recursively packages every manifest atlas PNG and JSON',()=>{
 const manifest=JSON.parse(fs.readFileSync(path.join(root,'client/public/assets/cartoon/rover-v3/manifest.json'),'utf8'));
 const build=fs.readFileSync(path.join(root,'minigame/build.mjs'),'utf8');
 assert.match(build,/cp\("client\/public\/assets\/cartoon", "minigame\/dist\/art\/cartoon", \{\s*recursive: true/);
 for(const atlas of manifest.atlases)for(const name of [atlas.image,atlas.data]){
  assert.ok(fs.statSync(path.join(root,'client/public/assets/cartoon/rover-v3',name)).size>0,name);
  const dist=path.join(root,'minigame/dist/art/cartoon/rover-v3',name);
  if(fs.existsSync(path.join(root,'minigame/dist/art/cartoon/rover-v3')))assert.equal(fs.statSync(dist).size,fs.statSync(path.join(root,'client/public/assets/cartoon/rover-v3',name)).size);
 }
});
test('both platforms preload calibrated battery and three station directions from their own base',()=>{
 const mini=fs.readFileSync(path.join(root,'minigame/src/main.ts'),'utf8');
 const world=fs.readFileSync(path.join(root,'client/src/world.ts'),'utf8');
 for(const helper of ['Station','Battery']) {
  assert.ok(mini.includes(`this.preload${helper}Assets("art/cartoon")`));
  assert.ok(world.includes(`this.preload${helper}Assets("/assets/cartoon")`));
 }
 const base=path.join(root,'client/public/assets/cartoon');
 const directions=JSON.parse(fs.readFileSync(path.join(base,'station-v3-directions.json')));
 const names=['battery-v3.png','battery-v3.json','station-v3-directions.json',...directions.frames.map(f=>f.image)];
 for(const name of names){
  assert.ok(fs.statSync(path.join(base,name)).size>0);
  const dist=path.join(root,'minigame/dist/art/cartoon',name);
  if(fs.existsSync(dist)) assert.deepEqual(fs.readFileSync(dist),fs.readFileSync(path.join(base,name)));
 }
});
