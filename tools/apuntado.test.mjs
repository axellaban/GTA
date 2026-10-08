import test from 'node:test';
import assert from 'node:assert/strict';
import { Input } from '../src/input.js';
import * as THREE from 'three';
import { canAim, updateAiming, updateAimHud, shotSpread, FLY_AIM, flyAimDir } from '../src/aim.js';
class El extends EventTarget {
  constructor(btn){super();this.dataset={btn};this.style={};this.classList={add(){},remove(){},toggle(){}};this.tagName='BUTTON'}
  closest(){return this}
}
const gun={gun:true,spread:.08},melee={gun:false};
function fixture(){
  const win=new EventTarget(),doc=new EventTarget();
  const elements={stick:new El(),knob:new El(),aim:new El('aim'),attack:new El('attack'),ctx:new El('e')};
  doc.getElementById=(id)=>elements[id]||null;doc.querySelectorAll=()=>[elements.aim,elements.attack,elements.ctx];
  globalThis.addEventListener=win.addEventListener.bind(win);globalThis.document=doc;globalThis.innerWidth=844;
  const canvas=new El(),input=new Input(canvas),p={speed:0};
  const send=(el,type,data={})=>{const e=new Event(type,{cancelable:true});Object.assign(e,data);el.dispatchEvent(e)};
  const touch=(el,type,id,x=720,y=230)=>send(el,type,{changedTouches:[{identifier:id,clientX:x,clientY:y,target:el}]});
  return {win,doc,canvas,input,p,send,touch,...elements};
}
test('botón derecho mantenido activa mira; clic izquierdo se puede usar con o sin apuntado',()=>{
  const f=fixture();f.send(f.canvas,'mousedown',{button:0});updateAiming(f.p,f.input,gun);
  assert.equal(f.p.aiming,false);assert.ok(f.input.down('mouse0'));
  f.send(f.canvas,'mousedown',{button:2});updateAiming(f.p,f.input,gun);assert.equal(f.p.aiming,true);
  f.send(f.win,'mouseup',{button:0});assert.equal(f.input.dragging,true);assert.ok(f.input.down('mouse2'));
  f.send(f.win,'mouseup',{button:2});updateAiming(f.p,f.input,gun);assert.equal(f.p.aiming,false);assert.equal(f.input.dragging,false);
});
test('clic derecho corto (dos dedos en el trackpad) deja la mira prendida y el clic tira; otro toque la apaga',()=>{
  const f=fixture();f.send(f.canvas,'mousedown',{button:2});f.send(f.win,'mouseup',{button:2});
  updateAiming(f.p,f.input,gun);f.input.endFrame();assert.equal(f.p.aiming,true);assert.ok(f.input.aimToggled);
  f.send(f.canvas,'mousedown',{button:0});assert.ok(f.input.hit('mouse0'));updateAiming(f.p,f.input,gun);assert.equal(f.p.aiming,true);
  f.send(f.win,'mouseup',{button:0});f.input.endFrame();
  f.send(f.canvas,'mousedown',{button:2});f.send(f.win,'mouseup',{button:2});updateAiming(f.p,f.input,gun);
  assert.equal(f.p.aiming,false);assert.equal(f.input.aimToggled,false);
});
test('celular: toque de apuntado queda activado y disparar permite mover cámara con el mismo dedo',()=>{
  const f=fixture();f.touch(f.aim,'touchstart',1);updateAiming(f.p,f.input,gun);f.input.endFrame();f.touch(f.aim,'touchend',1);
  assert.equal(f.p.aiming,true);assert.ok(f.input.aimToggled);
  f.touch(f.attack,'touchstart',2);f.touch(f.attack,'touchmove',2,750,240);
  assert.ok(f.input.down('attack'));assert.equal(f.input.look.dx,48);assert.equal(f.input.look.dy,16);
  f.touch(f.aim,'touchstart',3);updateAiming(f.p,f.input,gun);f.input.endFrame();f.touch(f.aim,'touchend',3);
  assert.equal(f.p.aiming,false);assert.ok(f.input.down('attack'));
  f.touch(f.attack,'touchcancel',2);assert.equal(f.input.down('attack'),false);
});
test('no se suelta un botón por otro dedo ni queda la tecla contextual anterior pegada',()=>{
  const f=fixture();f.touch(f.ctx,'touchstart',7);f.ctx.dataset.btn='f';f.touch(f.ctx,'touchend',8);
  assert.ok(f.input.down('e'));f.touch(f.ctx,'touchend',7);assert.equal(f.input.down('e'),false);assert.equal(f.input.down('f'),false);
});
test('al perder foco o pointer lock se sueltan teclado, disparo, apuntado y joystick',()=>{
  for(const reason of ['blur','pointerlockchange']) {
    const f=fixture();f.touch(f.aim,'touchstart',1);updateAiming(f.p,f.input,gun);f.touch(f.attack,'touchstart',2);
    f.send(f.canvas,'mousedown',{button:2});f.send(f.win,'keydown',{key:'w'});f.input.move={x:1,y:1};
    if(reason==='pointerlockchange'){f.input.locked=true;f.doc.pointerLockElement=null;f.send(f.doc,reason)}else f.send(f.win,reason);
    updateAiming(f.p,f.input,gun);assert.equal(f.p.aiming,false);assert.equal(f.input.aimToggled,false);
    assert.equal(f.input.keys.size,0);assert.equal(f.input.touchButtons.size,0);assert.deepEqual(f.input.move,{x:0,y:0});
  }
});
test('mira sólo con arma y al apuntar; no en auto, durante diálogo, muerte o caída',()=>{
  const f=fixture();let pressed;
  const crosshair={},button={setAttribute(_k,v){pressed=v},classList:{toggle(){}}};
  updateAimHud(f.p,gun,{crosshair,button});assert.equal(crosshair.hidden,true);assert.equal(button.hidden,false);
  f.p.aiming=true;updateAimHud(f.p,gun,{crosshair,button});assert.equal(crosshair.hidden,false);assert.equal(pressed,'true');
  for(const state of [{vehicle:{}},{riding:true},{ufo:{}},{exitAnim:{}},{dead:true},{jack:{}},{downT:1},{cutscene:true},{busted:1}]) {
    assert.equal(canAim({...f.p,...state},gun),false);f.input.aimToggled=true;updateAiming({...f.p,...state},f.input,gun);assert.equal(f.input.aimToggled,false);
  }
  updateAimHud(f.p,gun,{crosshair,button},true);assert.equal(crosshair.hidden,true);assert.equal(button.hidden,true);
  updateAimHud(f.p,melee,{crosshair,button});assert.equal(crosshair.hidden,true);
});
test('volando (helicóptero o plato) la mira va arriba de la nave, como en los GTA, y vuelve al centro al bajar',()=>{
  const f=fixture();
  const crosshair={style:{left:'',top:''}},hitmark={style:{left:'',top:''}},button={setAttribute(){},classList:{toggle(){}}};
  updateAimHud({...f.p,ufo:{}},melee,{crosshair,button,hitmark});
  assert.equal(crosshair.hidden,false);assert.equal(crosshair.style.top,`${FLY_AIM.y*100}%`);assert.equal(hitmark.style.top,crosshair.style.top);
  assert.ok(FLY_AIM.y<0.45,'más arriba que el centro');
  updateAimHud(f.p,melee,{crosshair,button,hitmark});
  assert.equal(crosshair.style.top,'');assert.equal(hitmark.style.left,'');
});
test('el tiro en vuelo sale por el punto de la mira, no por el centro',()=>{
  const cam=new THREE.PerspectiveCamera(62,16/9,0.1,1000);cam.position.set(0,10,20);cam.lookAt(0,0,0);cam.updateMatrixWorld();
  const d=flyAimDir(cam,new THREE.Vector3());const c=cam.getWorldDirection(new THREE.Vector3());
  assert.ok(Math.abs(d.length()-1)<1e-6);assert.ok(d.y>c.y,'apunta más arriba que el centro de la pantalla');
  const p=cam.position.clone().addScaledVector(d,10).project(cam);
  assert.ok(Math.abs(p.x-(FLY_AIM.x*2-1))<1e-4&&Math.abs(p.y-(1-FLY_AIM.y*2))<1e-4,'pasa por la mira');
});
test('apuntar reduce dispersión; caminar rápido sigue empeorando la precisión',()=>{
  const p={speed:0,aiming:false};const hip=shotSpread(p,gun);p.aiming=true;assert.equal(shotSpread(p,gun),hip/2);
  p.speed=5;assert.ok(shotSpread(p,gun)>hip/2);
});
