/* K-SWIFT model: preset lake data, links, substations, water quality and the alert algorithm.
   The exhibition model has no sensors: every value is either PUBLISHED (with its source)
   or PRESET (a demo value the model uses, marked "preset" in the app).
   Pure functions only, so they can be tested with Node:  node tests/model.test.js */
"use strict";
const TMC = 28.3168e6;      // m³ in one TMC
const CUSEC = 0.0283168;    // m³/s in one cusec
const ACRE = 4046.86;       // m² in one acre
const FT = 0.3048;          // m in one foot

// grid: origin (0,0) = 17.30°N, 78.30°E ; x = (lon − 78.30) × 106 , y = (lat − 17.30) × 111  (km)
const toGrid = (lat, lon) => [+((lon - 78.30) * 106).toFixed(1), +((lat - 17.30) * 111).toFixed(1)];
const toLatLon = (x, y) => [+(17.30 + y / 111).toFixed(4), +(78.30 + x / 106).toFixed(4)];

// src: 'pub' = published figure, 'preset' = demo value used by the model, 'est' = our estimate
const BASE = [
  {id:'osman', grid:[0,9.2], code:'O', name:'Osman Sagar', alias:'Gandipet', place:'Gandipet, Rangareddy', record:'Reservoir run by HMWSSB',
   built:'1920 – dam on the Musi', lat:17.383, lon:78.300, zoom:12,
   ftl:545.59, ftlSrc:'pub', ftlNote:'1,790 ft (HMWSSB)', area:24.786e6, vftl:3.90*TMC, maxDepth:null, damH:35.97, catch:738.1,
   fill:2.474/3.900, fillNote:'2.474 of 3.900 TMC (HMWSSB, Aug 2025)', fillSrc:'pub',
   q:{pH:[7.8,'preset'], DO:[6.4,'preset'], BOD:[2.2,'preset'], turb:[6,'preset'], TDS:[320,'preset'], temp:[26,'preset']},
   doSeries:[6.8,6.1,6.5,5.9,6.6,6.5], doSrc:'preset',
   other:'Published index: NSF-WQI 57.1, "moderate" (NIT Rourkela study; higher is better).',
   inflow:'Musi river and its catchment streams', outflow:'15 crest gates to the Musi', use:'Drinking water for Hyderabad',
   silt:{what:'capacity',unit:'TMC',a:5.541,later:3.90,years:105,y0:1920,target:3.0}},
  {id:'himayat', grid:[5.3,0], code:'M', name:'Himayat Sagar', alias:'', place:'Himayat Sagar, Rangareddy', record:'Reservoir run by HMWSSB',
   built:'1927 – dam on the Esi', lat:17.300, lon:78.350, zoom:12,
   ftl:537.51, ftlSrc:'pub', ftlNote:'1,763.5 ft (HMWSSB)', area:19.684e6, vftl:2.97*TMC, maxDepth:null, damH:33.83, catch:688.9,
   fill:2.687/2.970, fillNote:'2.687 of 2.970 TMC (HMWSSB, Aug 2025)', fillSrc:'pub',
   q:{pH:[7.9,'preset'], DO:[6.1,'preset'], BOD:[2.6,'preset'], turb:[8,'preset'], TDS:[350,'preset'], temp:[26,'preset']},
   doSeries:[6.3,5.8,6.4,5.7,6.2,6.2], doSrc:'preset',
   other:'Published index: NSF-WQI 56.7, "moderate" (NIT Rourkela study; higher is better).',
   inflow:'Esi river and catchment streams', outflow:'17 crest gates to the Esi, which joins the Musi', use:'Drinking water for Hyderabad',
   silt:{what:'capacity',unit:'TMC',a:4.251,later:2.967,years:98,y0:1927,target:2.0}},
  {id:'durgam', grid:[9.5,15.1], code:'D', name:'Durgam Cheruvu', alias:'Secret Lake / Raidurgam Cheruvu', place:'Raidurg, Madhapur', record:'HMDA Lake ID 3706',
   built:'Qutb Shahi era (1518–1687)', lat:17.4360, lon:78.3897, zoom:15,
   ftl:577, ftlSrc:'preset', ftlNote:'≈1,893 ft average ground height (topographic-map.com) – no official FTL published', area:0.34e6, vftl:1679430, maxDepth:8.5, damH:null, catch:null,
   fill:0.70, fillNote:'No level published – model preset 70%', fillSrc:'preset',
   q:{pH:[8.0,'preset'], DO:[0.3,'pub'], BOD:[12,'pub'], turb:[26,'preset'], TDS:[780,'preset'], temp:[28,'preset']},
   doSeries:[0.3,0.5,0.2,0.4,0.3,0.1], doSrc:'preset (mean = published 0.3)',
   other:'CPCB Class E (TGPCB 2024). DO 0.3 mg/L and BOD 12 mg/L in May 2026.',
   inflow:'Storm drain and 6 hill streams', outflow:'Outlet weir to the downstream nala', use:'Recreation, boating, bridge tourism',
   silt:{what:'area',unit:'acres',a:160,later:116,years:25,y0:2000,target:100}},
  {id:'hussain', grid:[18.4,13.7], code:'H', name:'Hussain Sagar', alias:'Tank Bund', place:'Tank Bund, Hyderabad–Secunderabad', record:'HMDA Lake ID 4101',
   built:'1563 – Ibrahim Quli Qutb Shah', lat:17.4237, lon:78.4741, zoom:14,
   ftl:513.41, ftlSrc:'pub', ftlNote:'GHMC / HMDA', mwl:514.75, area:4.7e6, vftl:23.5e6, maxDepth:9.8, damH:null, catch:240,
   fill:(23.5e6-0.27*4.7e6)/23.5e6, fillNote:'Level 513.14 m reported by GHMC', fillSrc:'pub',
   q:{pH:[7.6,'preset'], DO:[2.18,'pub'], BOD:[8,'pub'], turb:[18,'preset'], TDS:[650,'preset'], temp:[27,'preset']},
   doSeries:[2.5,1.4,3.2,2.6,1.2], doSrc:'published (Springer 2026)',
   other:'DO mean of 5 readings 1.2–3.2 mg/L (Springer 2026); BOD often above 8 (TSPCB).',
   inflow:'4 nalas: Kukatpally, Picket, Banjara, Balkapur', outflow:'2 weirs + 4 sluices to the Musi via the surplus nala', use:'Recreation, Buddha statue, events',
   silt:{what:'area',unit:'ha',a:550,later:349,years:30,y0:null,target:300}},
  {id:'saroor', grid:[24.1,6.2], code:'S', name:'Saroornagar Lake', alias:'', place:'Saroornagar, Hyderabad', record:'Not in the HMDA list by this name (closest: "Large Tank", ID 3613)',
   built:'1626 – Qutb Shahi era', lat:17.3558, lon:78.5271, zoom:15,
   ftl:487, ftlSrc:'preset', ftlNote:'≈487 m ground height of Saroornagar (Wikipedia) – no official FTL published', area:0.40e6, vftl:1.42e6, maxDepth:6.1, damH:null, catch:null,
   fill:0.60, fillNote:'No level published – model preset 60%', fillSrc:'preset',
   q:{pH:[7.24,'pub'], DO:[2.0,'pub'], BOD:[5.4,'pub'], turb:[14,'preset'], TDS:[540,'preset'], temp:[27,'preset']},
   doSeries:[2.0,2.4,1.6,2.1,1.9,2.0], doSrc:'preset (mean = published 2.0)',
   other:'TSPCB Dec 2023: pH 7.24, DO 2.0, BOD 5.4, total coliform 540/100 mL. Volume is our estimate (0.58 × A × max depth).',
   inflow:'Rain and storm drains', outflow:'Surplus weir to the Musi side', use:'Recreation, Ganesh immersion (restricted)',
   silt:{what:'area',unit:'acres',a:250,later:99,years:null,y0:null,target:null}}
];  // grid points as worked out in the project doc (Calculations, part B)
const LK = Object.fromEntries(BASE.map(b => [b.id, b]));

// Musi river course (approximate, for orientation only)
const MUSI = [[17.383,78.318],[17.375,78.360],[17.372,78.405],[17.366,78.440],[17.367,78.470],[17.380,78.488],[17.388,78.515],[17.375,78.560],[17.370,78.600]];
const ESI = [[17.300,78.350],[17.325,78.375],[17.352,78.395],[17.372,78.405]];
const MUSI_POINTS = {
  musiH:{name:'Musi river near Amberpet (approx.)', lat:17.388, lon:78.515},
  musiS:{name:'Musi river near Nagole (approx.)', lat:17.375, lon:78.560}
};

// Interconnections. Gravity links go downhill (higher FTL → lower FTL).
// L2 climbs about 39 m, so it is a PUMPED link: the gravity-only routing rule never uses it for flood surplus.
const LINKS = [
  {id:'L1', from:'osman',   to:'himayat', kind:'Proposed transfer canal'},
  {id:'L2', from:'himayat', to:'durgam',  kind:'Proposed pumped pipeline (uphill)', pumped:true},
  {id:'L3', from:'durgam',  to:'hussain', kind:'Existing nala chain, gated'},
  {id:'L4', from:'hussain', to:'saroor',  kind:'Proposed transfer pipeline'},
  {id:'L5', from:'hussain', to:'musiH',   kind:'Existing surplus nala to the Musi'},
  {id:'L6', from:'saroor',  to:'musiS',   kind:'Surplus weir channel to the Musi'}
];
const nodeOf = id => LK[id] || {...MUSI_POINTS[id], id, ftl:null, grid:toGrid(MUSI_POINTS[id].lat, MUSI_POINTS[id].lon)};

// Substations: one in the middle of each link (section formula, ratio 1:1). Monitored values are PRESET.
const SUB_PRESET = {
  L1:{flow:0,   depth:0.0, gate:0,  pH:7.8, DO:6.3, BOD:2.3, turb:7,  TDS:325, temp:26},
  L2:{flow:0,   depth:0.0, gate:0,  pH:7.9, DO:6.1, BOD:2.6, turb:8,  TDS:350, temp:26},
  L3:{flow:42,  depth:0.6, gate:30, pH:7.9, DO:0.8, BOD:11,  turb:24, TDS:760, temp:28},
  L4:{flow:0,   depth:0.0, gate:0,  pH:7.6, DO:2.3, BOD:7.6, turb:17, TDS:640, temp:27},
  L5:{flow:310, depth:1.1, gate:60, pH:7.5, DO:2.6, BOD:7.2, turb:19, TDS:655, temp:27},
  L6:{flow:12,  depth:0.3, gate:20, pH:7.3, DO:2.1, BOD:5.2, turb:15, TDS:545, temp:27}
};
const SUBSTATIONS = LINKS.map((k, i) => {
  const A = nodeOf(k.from), B = nodeOf(k.to);
  const mx = (A.grid[0] + B.grid[0]) / 2, my = (A.grid[1] + B.grid[1]) / 2;
  const [lat, lon] = toLatLon(mx, my);
  return {id:'SS-' + (i + 1), link:k, grid:[+mx.toFixed(2), +my.toFixed(2)], lat, lon, v:SUB_PRESET[k.id]};
});

// ---------- Maths helpers ----------
const f = (x,d=2)=> (x==null||!isFinite(x)) ? '–' : Number(x).toLocaleString('en-IN',{maximumFractionDigits:d,minimumFractionDigits:0});
const val = (L,k) => L.q[k] ? L.q[k][0] : null;
const levelOf = L => L.ftl==null ? null : L.ftl - (L.vftl*(1-L.fill))/L.area;
const QI = {pH:{s:8.5,i:7},DO:{s:5,i:14.6},BOD:{s:3,i:0},turb:{s:5,i:0}};
// weighted arithmetic WQI: q = 100(V − ideal)/(S − ideal), w = 1/S, WQI = Σwq / Σw
function wqi(o){
  let sw=0,swq=0; const parts=[];
  for(const k of ['pH','DO','BOD','turb']){ const v=o[k]; if(v==null||!isFinite(v)) continue;
    const {s,i}=QI[k]; const q=100*(v-i)/(s-i); const w=1/s; sw+=w; swq+=w*q; parts.push({k,v,q,w}); }
  return parts.length? {value:swq/sw, parts, sw, swq} : null;
}
const qObj = L => ({pH:val(L,'pH'), DO:val(L,'DO'), BOD:val(L,'BOD'), turb:val(L,'turb')});
function wqiBand(v){ if(v==null) return '–'; if(v<=25)return 'excellent'; if(v<=50)return 'good'; if(v<=75)return 'poor'; if(v<=100)return 'very poor'; return 'unfit'; }
function cpcbClass(o){ // CPCB designated-best-use, simplified to DO and BOD
  if(o.DO==null) return '–';
  if(o.DO>=6 && (o.BOD??0)<=2) return 'A (drinking after disinfection)';
  if(o.DO>=5 && (o.BOD??0)<=3) return 'B (outdoor bathing)';
  if(o.DO>=4 && (o.BOD??0)<=3) return 'C (drinking after treatment)';
  if(o.DO>=4) return 'D (fish and wildlife)';
  return 'E (irrigation, industry only)';
}

// The alert algorithm from the project doc
function status(L, hoursToFtl){
  const why=[]; let s='green'; const p=L.fill*100; const pH=val(L,'pH'), DO=val(L,'DO');
  if(p>=100){s='red';why.push('at or above FTL');}
  else if(hoursToFtl!=null && hoursToFtl<6){s='red';why.push(`reaches FTL in ${f(hoursToFtl,1)} h`);}
  if(s!=='red'){
    if(p>=90){s='amber';why.push(`${f(p,1)}% full`);}
    if(DO!=null && DO<4){s='amber';why.push(`DO ${f(DO,1)} mg/L (fish need 4)`);}
    if(pH!=null && (pH<6.5||pH>8.5)){s='amber';why.push(`pH ${f(pH,2)} outside 6.5–8.5`);}
  }
  if(!why.length) why.push('level and quality within limits');
  return {s,why};
}
const STATUS_WORD={green:'Safe',amber:'Watch',red:'Act'};
function hoursToFtl(L, netCusecs){
  if(!(netCusecs>0) || L.fill>=1) return null;
  return (L.vftl*(1-L.fill)) / (netCusecs*CUSEC*3600);
}
// Where should surplus go? Only to a linked lake with a LOWER FTL that is under 80% full,
// choosing the one with the most free space; otherwise release to the Musi.
function chooseTarget(list, L){
  const byId = Object.fromEntries(list.map(x=>[x.id,x]));
  const c = LINKS.filter(k=>k.from===L.id && byId[k.to]).map(k=>byId[k.to])
    .filter(o=>o.ftl!=null && L.ftl!=null && o.ftl<L.ftl && o.fill<0.8)   // pumped (uphill) links fail o.ftl < L.ftl
    .sort((a,b)=>(b.vftl*(1-b.fill))-(a.vftl*(1-a.fill)));
  return c[0] || null;
}
function substationStatus(S){
  const v=S.v; const why=[];
  let s='green';
  if(v.DO<4){ s='amber'; why.push(`DO ${v.DO} mg/L below 4`); }
  if(v.BOD>3){ s='amber'; why.push(`BOD ${v.BOD} mg/L above 3`); }
  if(v.pH<6.5||v.pH>8.5){ s='amber'; why.push('pH out of range'); }
  if(!why.length) why.push('water passing is within limits');
  return {s,why};
}
const distanceKm = (A,B) => Math.hypot(B.grid[0]-A.grid[0], B.grid[1]-A.grid[1]);
const mean = a => a.reduce((p,c)=>p+c,0)/a.length;
function median(a){ const s=[...a].sort((x,y)=>x-y), n=s.length; return n%2? s[(n-1)/2] : (s[n/2-1]+s[n/2])/2; }
function mode(a){ const c={}; a.forEach(x=>c[x]=(c[x]||0)+1); const m=Math.max(...Object.values(c)); return m>1? Object.keys(c).filter(k=>c[k]===m).map(Number) : []; }

// ---------- Pollution control (published facts with sources in README) ----------
const POLLUTION = {
  osman:{level:'Low', sources:['Farm run-off (fertiliser, pesticide) from the catchment','Silt from the catchment','Growing settlements and resorts in the catchment'],
         now:['Catchment protection rules (G.O. 111 of 1996, since relaxed)','Treatment at HMWSSB water plants before drinking','Fencing and patrolling of the reservoir'],
         kswift:['Watch BOD and turbidity at SS-1 before any transfer','Desilting estimate with AP (storage loss per year)']},
  himayat:{level:'Low', sources:['Farm run-off from the Esi catchment','Silt','Sewage from villages upstream'],
         now:['Catchment protection rules (G.O. 111, since relaxed)','Treatment at HMWSSB water plants before drinking'],
         kswift:['Quality gate at SS-1: no transfer if DO is under 4 mg/L','SS-2 pumps one way only (Himayat → Durgam), so Durgam’s polluted water can never flow back into this drinking-water reservoir']},
  durgam:{level:'Very high', sources:['Sewage from 4 major inlets (found by HMWSSB, Sep 2026)','Storm drain carrying waste from offices and colonies','Solid waste and plastic','Water hyacinth and algae'],
         now:['Sewage treatment plants of 5 MLD and 7 MLD near the lake','Diversion of sewage inlets','Weed and trash removal'],
         kswift:['Aerator ON when DO < 4 mg/L','Gate at SS-3 closes so Class E water is not sent into Hussain Sagar untreated','SS-2 can pump cleaner Himayat Sagar water in to dilute the lake and raise its oxygen (needs a pump: 39 m lift)']},
  hussain:{level:'High', sources:['About 155 MLD of sewage once came through the Kukatpally nala alone','Picket, Banjara and Balkapur nalas','Idol immersion (paint, plaster of Paris)','Floating waste and weeds'],
         now:['STPs: 30 MLD Picket nala, 20 MLD Balkapur nala, 5 MLD Rangadhamini – being upgraded to 60, 40 and 10 MLD','7 interception-and-diversion works that send nala sewage away from the lake','Dredging of sediment, aeration','Trash skimmers and idol removal after immersion'],
         kswift:['Aerator ON when DO < 4 mg/L','Monitor quality at SS-5 before surplus leaves for the Musi']},
  saroor:{level:'High', sources:['Storm drains with sewage','Ganesh idol immersion','Encroachment in FTL and buffer (once about 250 acres, now 99)'],
         now:['Restored by HUDA in 2003–04 at a cost of ₹20 crore','Immersion moved to a separate pond','Buffer protection under HMDA rules'],
         kswift:['Aerator ON when DO < 4 mg/L','Area loss tracked with AP']}
};
const METHODS = [
  {t:'Screens and trash racks', stage:'Physical', how:'Metal bars and nets at the inlet catch plastic, leaves and floating waste before it enters the lake.', removes:'Solid waste', model:'Mesh at every inlet of the model'},
  {t:'Settling (sedimentation) tank', stage:'Physical', how:'Water slows down in a wide tank so silt and heavy particles sink to the bottom.', removes:'Silt, turbidity', model:'Clear box before the filter'},
  {t:'Sewage treatment plant (STP)', stage:'Biological', how:'Bacteria eat the dissolved waste while air is blown in; the clean water is sent on, the sludge removed.', removes:'BOD, ammonia, bacteria', model:'Shown as a labelled block'},
  {t:'Interception and diversion (I&D)', stage:'Engineering', how:'Sewage in a nala is caught before the lake and piped to an STP instead.', removes:'Stops new pollution', model:'Bypass pipe around the lake'},
  {t:'Aeration and fountains', stage:'Physical', how:'Pumps and fountains push air into the water, raising dissolved oxygen so fish survive.', removes:'Low DO, bad smell', model:'Aquarium air pump turns on when DO < 4'},
  {t:'Sand and charcoal filter', stage:'Physical / chemical', how:'Layers of gravel, sand and activated charcoal trap fine particles and absorb colour and smell.', removes:'Turbidity, colour, some chemicals', model:'Bottle filter between two lakes'},
  {t:'Floating wetlands (phytoremediation)', stage:'Biological', how:'Plants such as vetiver and canna grow on floating rafts; their roots take up nitrogen and phosphorus.', removes:'Nutrients, algae growth', model:'Small raft of real plants'},
  {t:'Bioremediation', stage:'Biological', how:'Helpful microbes are added to the water to break down organic waste faster.', removes:'BOD, sludge', model:'Explained on the chart'},
  {t:'Weed harvesting', stage:'Physical', how:'Machines and boats remove water hyacinth, which blocks sunlight and uses up oxygen.', removes:'Weeds', model:'Net scoop'},
  {t:'Desilting / dredging', stage:'Physical', how:'Mud and toxic sediment are dug out, which also brings back lost storage.', removes:'Silt, heavy metals', model:'Removable silt tray'},
  {t:'Immersion ponds', stage:'Management', how:'Idols are immersed in separate small ponds so paint and plaster do not reach the main lake.', removes:'Paint, heavy metals, plaster', model:'Separate small tank'},
  {t:'Quality gate (K-SWIFT)', stage:'Decision', how:'A substation closes the transfer gate when the water passing is too polluted, so a dirty lake never pollutes a cleaner one.', removes:'Stops pollution spreading', model:'Valve at each substation'}
];

if(typeof module!=='undefined'){
  module.exports = {TMC,CUSEC,ACRE,FT,toGrid,toLatLon,BASE,LK,MUSI,ESI,MUSI_POINTS,LINKS,nodeOf,SUBSTATIONS,
    f,val,levelOf,QI,wqi,qObj,wqiBand,cpcbClass,status,STATUS_WORD,hoursToFtl,chooseTarget,substationStatus,
    distanceKm,mean,median,mode,POLLUTION,METHODS};
}
