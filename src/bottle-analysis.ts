import type { SoundFrame } from "./sound/contracts";

export type BottlePoint = { airVolumeMl: number; frequencyHz: number };
export type ToneResult = { frequencyHz: number; spreadHz: number; durationStable: number; quality: "stable"; valid: true };

export function calculateAirVolume(capacityMl: number, waterMl: number): number {
  if (!Number.isFinite(capacityMl) || capacityMl <= 0) throw new Error("Укажите объём бутылки больше нуля.");
  if (!Number.isFinite(waterMl) || waterMl < 0 || waterMl >= capacityMl) throw new Error("Количество воды должно быть больше или равно нулю и меньше объёма бутылки.");
  return capacityMl - waterMl;
}

const median = (values: number[]) => { const sorted = [...values].sort((a,b)=>a-b), mid = sorted.length >> 1; return sorted.length % 2 ? sorted[mid] : (sorted[mid-1]+sorted[mid])/2; };

/** Collects sustained, audible pitch frames and emits a robust median after 1.2 s. */
export class BottleToneDetector {
  private frames: Array<{ time: number; pitch: number; level: number }> = [];
  constructor(private readonly noiseFloorDb = -60, private readonly minDurationMs = 1200) {}
  reset() { this.frames = []; }
  add(frame: Pick<SoundFrame, "timestamp" | "pitch" | "level">): ToneResult | null {
    if (frame.pitch === null || frame.level < Math.max(-55, this.noiseFloorDb + 7)) { this.frames = []; return null; }
    if (this.frames.length >= 4) {
      const current = median(this.frames.map(item => item.pitch));
      if (Math.abs(frame.pitch-current)/current > 0.05) this.frames = [];
    }
    this.frames.push({time:frame.timestamp,pitch:frame.pitch,level:frame.level});
    this.frames = this.frames.filter(item => item.time >= frame.timestamp - this.minDurationMs);
    if (this.frames.length < 12 || frame.timestamp - this.frames[0].time < this.minDurationMs) return null;
    const frequencies = this.frames.map(item=>item.pitch), center=median(frequencies), spread=1.4826*median(frequencies.map(value=>Math.abs(value-center)));
    if (spread > Math.max(3, center * 0.025)) return null;
    return {frequencyHz:center,spreadHz:spread,durationStable:frame.timestamp-this.frames[0].time,quality:"stable",valid:true};
  }
}

export type Relationship = { distinctConditions:number; points:BottlePoint[]; candidates:null | { powerLawRmseHz:number; inverseRootRmseHz:number; linearRmseHz:number }; fit:null | { amplitude:number; exponent:number; rSquared:number|null; rmseHz:number }; supported:boolean; prediction:(targetHz:number)=>number|null };

/** Fits f = a V^b to condition medians; support is evidence-gated, never forced. */
export function analyzeBottleRelationship(input: readonly BottlePoint[], minimumConditions=4): Relationship {
  const groups = new Map<number,number[]>();
  for (const point of input) if (Number.isFinite(point.airVolumeMl)&&point.airVolumeMl>0&&Number.isFinite(point.frequencyHz)&&point.frequencyHz>0) {
    const values=groups.get(point.airVolumeMl)??[]; values.push(point.frequencyHz); groups.set(point.airVolumeMl,values);
  }
  const points=[...groups].map(([airVolumeMl,values])=>({airVolumeMl,frequencyHz:median(values)})).sort((a,b)=>a.airVolumeMl-b.airVolumeMl);
  const insufficient = (): Relationship => ({distinctConditions:points.length,points,candidates:null,fit:null,supported:false,prediction:()=>null});
  if(points.length<minimumConditions) return insufficient();
  const xs=points.map(p=>Math.log(p.airVolumeMl)), ys=points.map(p=>Math.log(p.frequencyHz)), xm=xs.reduce((a,b)=>a+b,0)/xs.length, ym=ys.reduce((a,b)=>a+b,0)/ys.length;
  const xx=xs.reduce((s,x)=>s+(x-xm)**2,0); if(xx===0)return insufficient();
  const exponent=xs.reduce((s,x,i)=>s+(x-xm)*(ys[i]-ym),0)/xx, amplitude=Math.exp(ym-exponent*xm);
  const predicted=points.map(p=>amplitude*p.airVolumeMl**exponent), mean=points.reduce((s,p)=>s+p.frequencyHz,0)/points.length,
    ss=points.reduce((s,p)=>s+(p.frequencyHz-mean)**2,0), rss=points.reduce((s,p,i)=>s+(p.frequencyHz-predicted[i])**2,0), rSquared=ss>0?1-rss/ss:null,
    rmseHz=Math.sqrt(rss/points.length), min=Math.min(...points.map(p=>p.airVolumeMl)), max=Math.max(...points.map(p=>p.airVolumeMl));
  const inverseRootAmplitude=Math.exp(points.reduce((s,p)=>s+Math.log(p.frequencyHz*Math.sqrt(p.airVolumeMl)),0)/points.length), inverseRoot=points.map(p=>inverseRootAmplitude/Math.sqrt(p.airVolumeMl));
  const volumes=points.map(p=>p.airVolumeMl),volumeMean=volumes.reduce((a,b)=>a+b,0)/volumes.length,volumeXX=volumes.reduce((s,x)=>s+(x-volumeMean)**2,0),linearSlope=volumes.reduce((s,x,i)=>s+(x-volumeMean)*(points[i].frequencyHz-mean),0)/volumeXX,linearIntercept=mean-linearSlope*volumeMean,linear=points.map(p=>linearIntercept+linearSlope*p.airVolumeMl);
  const rms=(values:number[])=>Math.sqrt(values.reduce((s,value,i)=>s+(points[i].frequencyHz-value)**2,0)/points.length),
    inverseRootRmseHz=rms(inverseRoot),linearRmseHz=rms(linear),powerLawRmseHz=rmseHz;
  const supported=exponent>=-0.8&&exponent<=-0.2&&(rSquared===null||rSquared>=0.8)&&powerLawRmseHz<=linearRmseHz*1.1;
  return {distinctConditions:points.length,points,candidates:{powerLawRmseHz,inverseRootRmseHz,linearRmseHz},fit:{amplitude,exponent,rSquared,rmseHz},supported,prediction:(targetHz)=>{
    if(!supported||!Number.isFinite(targetHz)||targetHz<=0)return null;
    const volume=(targetHz/amplitude)**(1/exponent);
    if(!Number.isFinite(volume)||volume<min*0.85||volume>max*1.15)return null;
    return volume;
  }};
}
