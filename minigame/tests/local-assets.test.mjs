import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const source=fs.readFileSync(new URL('../vendor/weapp-adapter.js',import.meta.url),'utf8');
const body=source.split('/* 18 */')[1].split('/***/ (function(module, exports) {')[1].split('/***/ })')[0];
function adapter(wx){const exports={};vm.runInNewContext(body,{exports,wx,ArrayBuffer});return exports.default;}
test('packaged JSON uses filesystem and completes XHR for Phaser',()=>{
 let network=0,read;
 const XHR=adapter({request(){network++},getFileSystemManager(){return {readFile(options){read=options;options.success({data:'{"version":1}'});}}}});
 const xhr=new XHR();let loaded=0;xhr.onload=(event)=>{assert.equal(event.target,xhr);loaded++;};
 xhr.open('GET','art/cartoon/rover-v3/manifest.json');xhr.send();
 assert.equal(network,0);assert.equal(read.filePath,'art/cartoon/rover-v3/manifest.json');assert.equal(xhr.status,200);assert.equal(xhr.readyState,4);assert.equal(JSON.parse(xhr.responseText).version,1);assert.equal(loaded,1);
});
test('missing packaged JSON emits error and remote URLs retain wx.request',()=>{
 const urls=[];const XHR=adapter({request(o){urls.push(o.url)},getFileSystemManager(){return {readFile(o){o.fail({errMsg:'missing file'})}}}});
 const local=new XHR();let errors=0;local.onerror=()=>errors++;local.open('GET','art/missing.json');local.send();assert.equal(errors,1);
 const remote=new XHR();remote.open('GET','https://example.com/a.json');remote.send();assert.deepEqual(urls,['https://example.com/a.json']);
});
