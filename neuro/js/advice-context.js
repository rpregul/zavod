// Server-side preparation only. No provider calls or credentials in the browser.
export function buildAdviceContext({answers={},goal=null,exercises=[],results=[],readings=[]}={}) {
 const ids=['sch_f','sch_r','dob','mem','colors'];
 const numeric=v=>typeof v==='number'&&Number.isFinite(v)?v:null;
 return {version:1,answers:Object.fromEntries(Object.entries(answers).filter(([id])=>ids.includes(id)).map(([id,a])=>[id,{option:Number.isInteger(a?.option)?a.option:null,frequency:Number.isInteger(a?.frequency)?a.frequency:null}])),
 goal:goal?{ex:ids.includes(goal.ex)?goal.ex:null,baseline:numeric(goal.baseline),target:numeric(goal.target)}:null,
 exercises:exercises.filter(id=>ids.includes(id)),
 games:ids.map(ex=>({ex,attempts:results.filter(r=>r.ex===ex).sort((a,b)=>a.ts-b.ts).slice(-30).map(r=>({day:r.day,score:numeric(r.score),accuracy:numeric(r.meta?.accuracy),median_ms:numeric(r.meta?.median_ms)}))})),
 readings:readings.slice(-30).map(r=>({day:typeof r.created_at==='string'?r.created_at.slice(0,10):null,mode:r.mode==='aloud'?'aloud':r.mode==='silent'?'silent':'legacy',wpm:numeric(r.wpm),correct:numeric(r.correct),questions:numeric(r.questions)}))};
}
