import test from 'node:test';
import assert from 'node:assert/strict';
import { allVehicles, vehicleContact, vehicleBody, beginVehicleFrame, resolveVehicleFrame, turnRollover, sideImpactRollover, recoverRollover } from '../src/vehicle-physics.js';
function car(x=0,z=0,more={}) {
  return { x,z,y:0,heading:0,W:1.8,L:4.4,tall:1.5,kind:'car',speed:0,steer:0, vx:0,vz:0,
    get fx(){return Math.sin(this.heading)}, get fz(){return Math.cos(this.heading)},
    circles(){return [-1.2,1.2].map((t)=>({x:this.x+this.fx*t,z:this.z+this.fz*t,r:this.W/2+.1}))}, sync(){},...more };
}
function world(cars=[], parked=[], police=[]) {
  return { traffic:{cars,parked},police:{cars:police},player:{},tanks:{list:[]},crime:{motos:[]} };
}
function separated(cars,tolerance=.002) {
  for(let i=0;i<cars.length;i++) for(let j=i+1;j<cars.length;j++) {
    const hit=vehicleContact(cars[i],cars[j]);
    assert.ok(!hit || hit.depth<tolerance, `Autos ${i}/${j} se solapan ${hit?.depth} m`);
  }
  for(const v of cars) assert.ok([v.x,v.z,v.speed].every(Number.isFinite));
}
test('centros idénticos, autos girados, estacionados y patrulleros quedan separados',()=>{
  const cars=[car(),car(0,0,{heading:Math.PI/4}),car(.2,1.5,{kind:'bus',L:10,W:2.4,tall:3.2})];
  const parked=[car(.3,-1),car(-1,2,{heading:Math.PI/2})],police=[car(1,1,{police:true})];
  const w=world(cars,parked,police);resolveVehicleFrame(w);separated([...cars,...parked,...police]);
});
test('un auto registrado dos veces se procesa una sola vez',()=>{
  const v=car();const w=world([v],[v],[v]);w.player.vehicle=v;
  assert.equal(allVehicles(w).length,1);resolveVehicleFrame(w);assert.equal(v.x,0);
});
test('autos en el puente y debajo no chocan',()=>{
  const a=car(),b=car(0,0,{y:-5.4});const w=world([a,b]);
  assert.equal(vehicleContact(a,b),null);resolveVehicleFrame(w);assert.equal(a.x,0);assert.equal(b.x,0);
});
test('choque frontal rápido no atraviesa al otro entre cuadros, incluso terminando solapado',()=>{
  for(const advance of [2,4,5]) {
    const a=car(0,-3,{driver:true,vz:40,speed:40}),b=car(0,3,{driver:true,heading:Math.PI,vz:-40,speed:40});
    const w=world([a,b]);const poses=beginVehicleFrame(w,.05);a.z+=advance;b.z-=advance;
    resolveVehicleFrame(w,poses);separated([a,b]);assert.ok(a.z<b.z);assert.ok(a.vz<=0);assert.ok(b.vz>=0);
    assert.ok(a.vz**2+b.vz**2 <= 3200);
  }
});
test('un choque contra una fila al lado de una pared no mete autos en la pared',()=>{
  const cars=Array.from({length:6},(_,i)=>car(1.1+i*1.85,0,{driver:true,vx:i===5?-30:0,heading:Math.PI/2}));
  const w=world(cars);
  w.colliders={resolveCircle(p,r){if(p.x>=r)return null;p.x=r;return {nx:1,nz:0}}};
  cars[5].x=cars[4].x+.8;resolveVehicleFrame(w);
  separated(cars,.015);for(const v of cars) assert.ok(v.x>=.9999);
});
test('300 cuadros de tráfico cruzado mantienen cuerpos sólidos',()=>{
  const cars=[car(-8,0,{heading:Math.PI/2,ai:{},speed:12}),car(0,-8,{ai:{},speed:12}),car(8,0,{heading:-Math.PI/2,ai:{},speed:12}),car(0,8,{heading:Math.PI,ai:{},speed:12})];
  const w=world(cars);
  for(let t=0;t<300;t++) {
    const poses=beginVehicleFrame(w,1/30);
    for(const v of cars) {v.speed=Math.min(12,v.speed+.1);v.x+=v.fx*v.speed/30+(v.shove?.vx||0)/30;v.z+=v.fz*v.speed/30+(v.shove?.vz||0)/30;if(v.shove){v.shove.vx*=.8;v.shove.vz*=.8}}
    resolveVehicleFrame(w,poses);separated(cars);
  }
});
test('curva normal no vuelca; giro cerrado sostenido a velocidad sí; derrape no se confunde con vuelco',()=>{
  for(const options of [{speed:12,yaw:.9},{speed:30,yaw:1.3,handbrake:true},{speed:25,yaw:1.1,slick:true}]) {
    const v=car(0,0,{speed:options.speed,steer:1,driver:true});
    for(let i=0;i<120;i++)turnRollover(v,1/60,options.yaw,options);
    assert.ok(!v.rollover);
  }
  const v=car(0,0,{driver:true,vz:30,speed:30,steer:1}),w=world([v]);w.player.vehicle=v;
  for(let i=0;i<90&&!v.rollover;i++)turnRollover(v,1/60,1.3);
  assert.ok(v.rollover);
  for(let i=0;i<90;i++){beginVehicleFrame(w,1/60);assert.ok(vehicleBody(v).low>=-1e-8);resolveVehicleFrame(w)}
  assert.ok(v.overturned);assert.equal(v.speed,0);assert.equal(v.rollover,null);
  for(let i=0;i<60;i++)recoverRollover(v,1/60,1);assert.equal(v.rollover,null);
  recoverRollover(v,1/60,0);
  for(let i=0;i<40;i++)recoverRollover(v,1/60,-1);assert.ok(v.rollover?.recover);
  for(let i=0;i<70;i++)beginVehicleFrame(w,1/60);
  assert.equal(v.overturned,false);assert.equal(v.tilt,null);
});
test('sólo golpes laterales fuertes vuelcan; tanques, motos y chatarra no usan el vuelco de autos',()=>{
  assert.equal(sideImpactRollover(car(),1,0,5),false);assert.equal(sideImpactRollover(car(),0,1,40),false);
  assert.equal(sideImpactRollover(car(),1,0,30),true);
  for(const more of [{kind:'tank'},{kind:'moto'},{wreck:true},{blast:{}}])assert.equal(sideImpactRollover(car(0,0,more),1,0,40),false);
});
test('el auto que vuelca sigue chocando con paredes',()=>{
  const v=car(1,0,{driver:true,vx:-30,speed:30}),w=world([v]);
  w.colliders={resolveCircle(p,r){if(p.x>=r)return null;p.x=r;return {nx:1,nz:0}}};
  sideImpactRollover(v,1,0,30);
  for(let i=0;i<90;i++){const poses=beginVehicleFrame(w,1/60);resolveVehicleFrame(w,poses);assert.ok(v.x>=.9999)}
});
test('200 vehículos distribuidos: simulación repetida sin crecimiento ni penetración',()=>{
  const cars=Array.from({length:200},(_,i)=>car(i%20*8,Math.floor(i/20)*12,{ai:{},speed:10}));const w=world(cars);
  const started=performance.now();
  for(let i=0;i<120;i++){const poses=beginVehicleFrame(w,1/60);for(const v of cars)v.z+=v.speed/60;resolveVehicleFrame(w,poses)}
  separated(cars);console.log(`Física de 200 vehículos: ${((performance.now()-started)/120).toFixed(2)} ms/cuadro (Node, CPU local).`);
});
