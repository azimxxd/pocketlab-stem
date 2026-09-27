import test from "node:test";
import assert from "node:assert/strict";
import { analyzeBottleRelationship, BottleToneDetector, calculateAirVolume } from "../src/bottle-analysis";

test("calculates air volume and rejects unusable conditions",()=>{
  assert.equal(calculateAirVolume(500,150),350);
  assert.equal(calculateAirVolume(500,0),500);
  assert.throws(()=>calculateAirVolume(500,500));
  assert.throws(()=>calculateAirVolume(500,501));
  assert.throws(()=>calculateAirVolume(500,-1));
});

test("stable sustained tone is accepted; unstable or short/quiet sound is rejected",()=>{
  const detector=new BottleToneDetector(-65), start=1000;
  let result=null;
  for(let i=0;i<25;i++) result=detector.add({timestamp:start+i*50,pitch:440+(i%2?0.3:-0.3),level:-25});
  assert.ok(result); assert.ok(Math.abs(result.frequencyHz-440)<1);
  detector.reset();
  for(let i=0;i<25;i++) result=detector.add({timestamp:start+i*50,pitch:i%2?440:520,level:-25});
  assert.equal(result,null);
  detector.reset();
  for(let i=0;i<10;i++) result=detector.add({timestamp:start+i*50,pitch:440,level:-25});
  assert.equal(result,null);
  assert.equal(detector.add({timestamp:2000,pitch:440,level:-80}),null);
});

test("relationship fit handles repeated conditions, insufficient data, and synthetic inverse-root law",()=>{
  const volumes=[100,160,250,400,640],points=volumes.flatMap(v=>[{airVolumeMl:v,frequencyHz:900/Math.sqrt(v)},{airVolumeMl:v,frequencyHz:902/Math.sqrt(v)}]);
  assert.equal(analyzeBottleRelationship(points.slice(0,4)).fit,null);
  const fit=analyzeBottleRelationship(points); assert.ok(fit.supported); assert.ok(Math.abs(fit.fit!.exponent+0.5)<0.01);
  assert.ok(fit.candidates!.inverseRootRmseHz<fit.candidates!.linearRmseHz);
  assert.equal(fit.points.length,5); assert.ok(fit.prediction(900/Math.sqrt(330))!==null);
  assert.equal(fit.prediction(1),null);
  const noisy=points.map((p,i)=>({...p,frequencyHz:p.frequencyHz*(1+(i%3-1)*0.03)}));
  assert.ok(analyzeBottleRelationship(noisy).fit);
});
