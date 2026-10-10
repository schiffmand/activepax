import { chromium } from 'playwright-core';
const H='file:///home/user/activepax/binaural-app/prototype/dist/index.html?screen=home&hour=10';
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--autoplay-policy=no-user-gesture-required'] });
async function run(clicks, label, wait=10000){
 const p=await browser.newPage({viewport:{width:390,height:844}});
 await p.addInitScript(()=>{
  const orig=AudioNode.prototype.connect;
  AudioNode.prototype.connect=function(t,...a){
    if (t instanceof AudioDestinationNode && !this.__m){ this.__m=1; const c=this.context; const sp=c.createChannelSplitter(2); window.__an=[c.createAnalyser(),c.createAnalyser()]; window.__an.forEach(x=>x.fftSize=32768); orig.call(this,sp); orig.call(sp,window.__an[0],0); orig.call(sp,window.__an[1],1);}
    return orig.call(this,t,...a);
  };
 });
 await p.goto(H); await p.waitForTimeout(600);
 for (const s of clicks){ await p.click(`[data-testid=${s}]`); await p.waitForTimeout(400);} 
 await p.waitForTimeout(wait);
 const r=await p.evaluate(()=>window.__an.map(a=>{const b=new Float32Array(a.fftSize);a.getFloatTimeDomainData(b);let s=0,pk=0;for(const v of b){s+=v*v;pk=Math.max(pk,Math.abs(v));}const f=new Float32Array(a.frequencyBinCount);a.getFloatFrequencyData(f);const sr=a.context.sampleRate;const bin=i=>Math.round(i*a.fftSize/sr);return {rms:(10*Math.log10(s/b.length)).toFixed(1),peak:(20*Math.log10(pk)).toFixed(1),at200:f[bin(200)].toFixed(1),at214:f[bin(214)].toFixed(1),at1k:f[bin(1000)].toFixed(1),at60:f[bin(60)].toFixed(1)}}));
 console.log(label, JSON.stringify(r));
 await p.close();
}
await run(['start'],'Focus medium');
await run(['start','level-full'],'Focus full');
await run(['start','level-quiet'],'Focus quiet');
await run(['readout','spec-noise','spec-done','start'],'Noise only medium');
await browser.close();
