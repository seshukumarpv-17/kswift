/* K-SWIFT model: lake data, water quality and the alert algorithm.
   Pure functions only (no page code), so they can be tested with Node:  node tests/model.test.js
   Sources for every number are listed in README.md and the project doc. */
"use strict";
const TMC = 28.3168e6; // m3 in one TMC
const CUSEC = 0.0283168; // m3/s
// ---------- Real data (sources in the project doc) ----------
const BASE = [
  {id:'osman', name:'Osman Sagar', place:'Gandipet', record:'Reservoir run by HMWSSB', built:'1920, dam on the Musi',
   ftl:545.59, mwl:null, area:24.786e6, vftl:3.90*TMC, maxDepth:null, catch:738.1, grid:[0,9.2], lat:17.383, lon:78.300,
   startFill:2.474/3.900, startNote:'2.474 of 3.900 TMC (HMWSSB, Aug 2025)', pH:null, DO:null, BOD:null, turb:null,
   other:'Moderate quality, NSF-WQI 57.1 (NIT Rourkela study; higher = better)', drains:'Musi river (15 gates)'},
  {id:'himayat', name:'Himayat Sagar', place:'Esi river', record:'Reservoir run by HMWSSB', built:'1927, dam on the Esi',
   ftl:537.51, mwl:null, area:19.684e6, vftl:2.97*TMC, maxDepth:null, catch:688.9, grid:[5.3,0], lat:17.300, lon:78.350,
   startFill:2.687/2.970, startNote:'2.687 of 2.970 TMC (HMWSSB, Aug 2025)', pH:null, DO:null, BOD:null, turb:null,
   other:'Moderate quality, NSF-WQI 56.7 (NIT Rourkela study; higher = better)', drains:'Musi river (17 gates)'},
  {id:'durgam', name:'Durgam Cheruvu', place:'Raidurg, Madhapur', record:'HMDA Lake ID 3706', built:'Qutb Shahi era (1518–1687)',
   ftl:null, mwl:null, area:0.34e6, vftl:1679430, maxDepth:8.5, catch:null, grid:[9.5,15.1], lat:17.4360, lon:78.3897,
   startFill:null, startNote:'No published level – using 85% until you enter a reading', pH:null, DO:0.3, BOD:12, turb:null,
   other:'CPCB Class E (TGPCB 2024); DO 0.3 mg/L and BOD 12 mg/L in May 2026', drains:'Storm drain + 6 hill streams in; 5 + 7 MLD treatment plants'},
  {id:'hussain', name:'Hussain Sagar', place:'Tank Bund', record:'HMDA Lake ID 4101', built:'1563',
   ftl:513.41, mwl:514.75, area:4.7e6, vftl:23.5e6, maxDepth:9.8, catch:240, grid:[18.4,13.7], lat:17.4237, lon:78.4741,
   startFill:(23.5e6-0.27*4.7e6)/23.5e6, startNote:'Level 513.14 m reported by GHMC', pH:null, DO:2.18, BOD:8, turb:null,
   other:'DO mean of 5 readings 1.2–3.2 mg/L (Springer 2026); BOD often above 8 (TSPCB); WQI 100–300', drains:'4 nalas in; 2 weirs + 4 sluices out to the Musi'},
  {id:'saroor', name:'Saroornagar Lake', place:'Saroornagar', record:'Not listed by this name (closest: “Large Tank”, ID 3613)', built:'1626',
   ftl:null, mwl:null, area:0.40e6, vftl:1.42e6, maxDepth:6.1, catch:null, grid:[24.1,6.2], lat:17.3558, lon:78.5271,
   startFill:null, startNote:'No published level – using 85% until you enter a reading', pH:7.24, DO:2.0, BOD:5.4, turb:null,
   other:'TSPCB Dec 2023: pH 7.24, DO 2.0, BOD 5.4, total coliform 540/100 mL. Volume is our estimate.', drains:'Rain and drains in'}
];
const DEFAULT_FILL = 0.85;
// ---------- Maths helpers ----------
const f = (x,d=2)=> (x==null||!isFinite(x)) ? '–' : Number(x).toLocaleString('en-IN',{maximumFractionDigits:d,minimumFractionDigits:0});
const levelOf = L => L.ftl==null ? null : L.ftl - (L.vftl*(1-L.fill))/L.area;
const QI = {pH:{s:8.5,i:7},DO:{s:5,i:14.6},BOD:{s:3,i:0},turb:{s:5,i:0}};
function wqi(L){
  let sw=0,swq=0,parts=[];
  for(const k of ['pH','DO','BOD','turb']){ const v=L[k]; if(v==null) continue;
    const {s,i}=QI[k]; const q=100*(v-i)/(s-i); const w=1/s; sw+=w; swq+=w*q; parts.push({k,v,q,w}); }
  return parts.length? {value:swq/sw, parts} : null;
}
function wqiBand(v){ if(v==null) return '–'; if(v<=25)return 'excellent'; if(v<=50)return 'good'; if(v<=75)return 'poor'; if(v<=100)return 'very poor'; return 'unfit'; }
// The alert algorithm from the project doc
function status(L, hoursToFtl){
  const why=[]; let s='green';
  const p=L.fill*100;
  if(p>=100){s='red';why.push('at or above FTL');}
  else if(hoursToFtl!=null && hoursToFtl<6){s='red';why.push(`reaches FTL in ${f(hoursToFtl,1)} h`);}
  if(s!=='red'){
    if(p>=90){s='amber';why.push(`${f(p,1)}% full`);}
    if(L.DO!=null && L.DO<4){s='amber';why.push(`DO ${f(L.DO,1)} mg/L (fish need 4)`);}
    if(L.pH!=null && (L.pH<6.5||L.pH>8.5)){s='amber';why.push(`pH ${f(L.pH,2)} outside 6.5–8.5`);}
  }
  if(!why.length) why.push('level and quality within limits');
  return {s,why};
}
const STATUS_WORD={green:'Safe',amber:'Watch',red:'Act'};

// ---------- Rate of rise and hours to FTL (Class 10: linear equations) ----------
// hist = [{t: milliseconds, fill: percent}], oldest first. timeScale = real hours per model hour
// (60 means 1 minute on the exhibition model stands for 1 hour on the real lake).
function risePerHour(hist, timeScale){
  if(!hist || hist.length<2) return null;
  const last = hist[hist.length-1];
  // use the oldest reading in the last 2 minutes, so one noisy reading does not decide
  let first = hist[0];
  for(const h of hist){ if(last.t - h.t <= 120000){ first = h; break; } }
  const realHours = (last.t - first.t)/3.6e6 * (timeScale||1);
  if(realHours <= 0) return null;
  return (last.fill - first.fill)/realHours;           // percent per real hour
}
function hoursToFtl(fillPercent, ratePerHour){
  if(ratePerHour==null || ratePerHour<=0 || fillPercent>=100) return null;
  return (100 - fillPercent)/ratePerHour;               // t = (FTL - now) / rate
}

// ---------- Where should surplus water go? ----------
// Only to a lake with a LOWER known FTL (water flows downhill), that is under 80% full.
// Among those, pick the one with the most free space. If none, release to the Musi.
function chooseTarget(list, L){
  if(L.ftl==null) return null;
  const c = list.filter(o=>o.id!==L.id && o.ftl!=null && o.ftl<L.ftl && o.fill<0.8)
                .sort((a,b)=>(b.vftl*(1-b.fill))-(a.vftl*(1-a.fill)));
  return c[0] || null;
}

// ---------- Class 10 coordinate geometry ----------
function distanceKm(A, B){ return Math.hypot(B.grid[0]-A.grid[0], B.grid[1]-A.grid[1]); }

if(typeof module!=='undefined'){
  module.exports = {TMC,CUSEC,BASE,DEFAULT_FILL,f,levelOf,QI,wqi,wqiBand,status,STATUS_WORD,
                    risePerHour,hoursToFtl,chooseTarget,distanceKm};
}
