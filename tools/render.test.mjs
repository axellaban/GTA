import test from 'node:test';
import assert from 'node:assert/strict';
import { cameraInsideVehicle, renderGameView } from '../src/camera-occlusion.js';
import { Post } from '../src/post.js';
const vehicle=(extra={})=>({x:0,y:0,z:0,heading:0,W:2.5,L:10,tall:3.2,mesh:{visible:true},...extra});
const world=(v)=>({camera:{near:.3,position:{x:0,y:2.2,z:.6}},player:{x:0,y:0,z:0,vehicle:v,h:{root:{visible:false}}},traffic:{cars:[v],parked:[]}});
test('la pared puede comprimir la cámara dentro del colectivo propio',()=>{
 const v=vehicle(),w=world(v);
 assert.equal(cameraInsideVehicle(w.camera.position,v),true);
 renderGameView(w,()=>assert.equal(v.mesh.visible,false));
 assert.equal(v.mesh.visible,true);assert.equal(w.player.h.root.visible,false);
});
test('también protege del plano cercano, autos ajenos y carrocerías giradas',()=>{
 const v=vehicle({heading:Math.PI/2});
 assert.equal(cameraInsideVehicle({x:4.9,y:2,z:0},v),true);
 assert.equal(cameraInsideVehicle({x:0,y:2,z:1.6},v),true);
 assert.equal(cameraInsideVehicle({x:0,y:2,z:2},v),false);
 const w=world(v);w.player.vehicle=null;w.player.x=20;
 renderGameView(w,()=>assert.equal(v.mesh.visible,false));
 assert.equal(v.mesh.visible,true);
});
test('altura real: puente, bajo nivel, techo y vuelco',()=>{
 const v=vehicle({y:-5.4});
 assert.equal(cameraInsideVehicle({x:0,y:2,z:0},v),false);
 assert.equal(cameraInsideVehicle({x:0,y:-3,z:0},v),true);
 const rolled=vehicle({tall:1.5,tilt:{z:Math.PI,y:1.5}});
 assert.equal(cameraInsideVehicle({x:0,y:.7,z:0},rolled),true);
 assert.equal(cameraInsideVehicle({x:0,y:3,z:0},rolled),false);
});
test('el render restaura exactamente los visibles incluso cuando falla',()=>{
 const v=vehicle(),w=world(v);const other=vehicle({mesh:{visible:false}});w.traffic.parked.push(other);
 assert.throws(()=>renderGameView(w,()=>{throw Error('fallo de GPU');}),/fallo/);
 assert.equal(v.mesh.visible,true);assert.equal(other.mesh.visible,false);
});
test('un fallo del compositor vuelve al framebuffer de pantalla y continúa dibujando',()=>{
 let native=0,composed=0,target='buffer';const scene={},camera={};
 const p=Object.create(Post.prototype);Object.assign(p,{enabled:true,scene,camera,composer:{render(){composed++;p.renderer.autoClear=false;p.renderer.xr.enabled=false;throw Error('pase roto');}},renderer:{autoClear:true,xr:{enabled:true},setRenderTarget(t){target=t;},render(s,c){assert.equal(s,scene);assert.equal(c,camera);assert.equal(target,null);assert.equal(p.renderer.autoClear,true);assert.equal(p.renderer.xr.enabled,true);native++;}}});
 const error=console.error;console.error=()=>{};
 try{p.render();p.render();assert.equal(native,2);assert.equal(composed,1);assert.match(p.renderError.message,/pase roto/);}finally{console.error=error;}
});
test('un render sano conserva todos los efectos',()=>{
 let composed=0;const p=Object.create(Post.prototype);Object.assign(p,{enabled:true,composer:{render(){composed++;}},renderer:{render(){assert.fail('no debe cambiar el look');}}});
 p.render();assert.equal(composed,1);assert.equal(p.renderError,undefined);
});
