"use strict";
const store = {
  get(k,d){try{const v=localStorage.getItem('kswift.'+k);return v?JSON.parse(v):d}catch(e){return d}},
  set(k,v){try{localStorage.setItem('kswift.'+k,JSON.stringify(v))}catch(e){}}
};
let readings = store.get('readings',{});   // id -> {fill,pH,DO,BOD,turb,time,src}
let settings = store.get('settings',{});   // id -> {mark, ftl}; settings._timeScale = real hours per model hour
const timeScale = () => (settings._timeScale>0 ? +settings._timeScale : 60);
const lakes = () => BASE.map(b=>{
  const r = readings[b.id]||{}, s = settings[b.id]||{};
  const ftl = b.ftl ?? (isFinite(s.ftl)&&s.ftl>0 ? +s.ftl : null);
  const fill = r.fill!=null ? r.fill/100 : (b.startFill ?? DEFAULT_FILL);
  const rate = r.src==='model' ? risePerHour(r.hist, timeScale()) : null;   // % per real hour
  return {...b, ftl, ftlSet: b.ftl==null && ftl!=null, fill,
    pH: r.pH ?? b.pH, DO: r.DO ?? b.DO, BOD: r.BOD ?? b.BOD, turb: r.turb ?? b.turb,
    mine: !!readings[b.id], src: r.src||null, rate, hrs: hoursToFtl(fill*100, rate),
    readTime: r.time||null, mark: s.mark ?? 15};
});
const statusOf = L => status(L, L.hrs);


// ---------- Routing ----------
const VIEWS=['network','map','simulate','maths','sensor'];
function route(){
  const v = VIEWS.includes(location.hash.slice(1)) ? location.hash.slice(1) : 'network';
  document.querySelectorAll('section[data-view]').forEach(s=>s.classList.toggle('on',s.dataset.view===v));
  document.querySelectorAll('nav.tabs a').forEach(a=>{ if(a.getAttribute('href')==='#'+v) a.setAttribute('aria-current','page'); else a.removeAttribute('aria-current'); });
}
addEventListener('hashchange',route);

// ---------- Profile SVG ----------
const NS='http://www.w3.org/2000/svg';
function el(tag,attrs={},text){const e=document.createElementNS(NS,tag);for(const k in attrs)e.setAttribute(k,attrs[k]);if(text!=null)e.textContent=text;return e;}
function drawProfile(list, target){
  const svg=target; svg.innerHTML='';
  const W=1000,H=330, x0=70, x1=960, yTop=40, yBot=270, eMin=495, eMax=552;
  const X=g=> (x0+70) + (g/24.1)*(x1-x0-140);   // keep end lakes clear of the axis labels
  const Y=e=> yBot - (e-eMin)/(eMax-eMin)*(yBot-yTop);
  // axis
  const ax=el('g',{fill:'none',stroke:'#C9D7D5'});
  for(let e=500;e<=550;e+=10){ ax.appendChild(el('line',{x1:x0,x2:x1,y1:Y(e),y2:Y(e)})); }
  svg.appendChild(ax);
  for(let e=500;e<=550;e+=10){ svg.appendChild(el('text',{x:x0-10,y:Y(e)+4,'text-anchor':'end','font-size':13,fill:'#4A5F63'},e+' m')); }
  svg.appendChild(el('text',{x:x0,y:H-8,'font-size':13,fill:'#4A5F63'},'West'));
  svg.appendChild(el('text',{x:x1,y:H-8,'font-size':13,fill:'#4A5F63','text-anchor':'end'},'East (km on the grid)'));
  // ground line through known lakes
  const known=list.filter(l=>l.ftl!=null).sort((a,b)=>a.grid[0]-b.grid[0]);
  if(known.length>1){
    let d=''; known.forEach((l,i)=>{ d+=(i?'L':'M')+X(l.grid[0])+' '+(Y(l.ftl)+34); });
    d+=`L${x1} ${Y(500)}`;
    svg.appendChild(el('path',{d,fill:'none',stroke:'#8E847B','stroke-width':2,'stroke-dasharray':'2 0'}));
  }
  // Musi
  svg.appendChild(el('path',{d:`M${X(14)} ${Y(500)+12}H${x1}`,stroke:'#1E6F80','stroke-width':6,'stroke-linecap':'round'}));
  svg.appendChild(el('text',{x:X(14),y:Y(500)+34,'font-size':13,fill:'#0C3E4A','font-weight':700},'Musi river (all five drain here)'));
  // lakes
  list.forEach(l=>{
    const st=statusOf(l).s;
    const col={green:'#2C8A57',amber:'#C98A12',red:'#C23B2F'}[st];
    const cx=X(l.grid[0]); const w=Math.max(60, Math.min(120, Math.sqrt(l.area)/40));
    const has=l.ftl!=null; const top= has? Y(l.ftl) : 92; const depth=34;
    const g=el('g',{tabindex:0,role:'button','aria-label':`${l.name}, ${STATUS_WORD[st]}`,style:'cursor:pointer'});
    g.addEventListener('click',()=>openLake(l.id)); g.addEventListener('keydown',e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();openLake(l.id);}});
    const basin=`M${cx-w/2} ${top} L${cx-w/2+14} ${top+depth} L${cx+w/2-14} ${top+depth} L${cx+w/2} ${top} Z`;
    g.appendChild(el('path',{d:basin,fill:'#DCD6CF',stroke:has?'#8E847B':'#8A9A9C','stroke-dasharray':has?'':'5 4','stroke-width':1.5}));
    const fh=Math.min(1.12,l.fill)*depth; const wy=top+depth-fh;
    const clip='c'+l.id+target.id; const cp=el('clipPath',{id:clip}); cp.appendChild(el('path',{d:basin})); g.appendChild(cp);
    g.appendChild(el('rect',{x:cx-w/2,y:wy,width:w,height:fh+1,fill:'#1E6F80','clip-path':`url(#${clip})`,opacity:.85}));
    if(l.fill>1) g.appendChild(el('rect',{x:cx-w/2-4,y:top-4,width:w+8,height:4,fill:'#C23B2F'}));
    g.appendChild(el('line',{x1:cx-w/2-6,x2:cx+w/2+6,y1:top,y2:top,stroke:col,'stroke-width':3}));
    g.appendChild(el('text',{x:cx,y:top-24,'text-anchor':'middle','font-size':15,'font-weight':700,fill:'#14282D','font-family':'Bricolage Grotesque, system-ui, sans-serif'},l.name));
    g.appendChild(el('text',{x:cx,y:top-8,'text-anchor':'middle','font-size':13,fill:'#4A5F63'}, has? `${f(l.ftl,1)} m · ${f(l.fill*100,0)}% full` : `height not set · ${f(l.fill*100,0)}%`));
    svg.appendChild(g);
  });
}

// ---------- Network view ----------
function renderNetwork(){
  const list=lakes();
  drawProfile(list, document.getElementById('profile'));
  const box=document.getElementById('lakeList'); box.innerHTML='';
  list.forEach(l=>{
    const st=statusOf(l), q=wqi(l), lev=levelOf(l);
    const b=document.createElement('button'); b.className='lake '+st.s; b.type='button';
    b.innerHTML=`<div style="display:flex;justify-content:space-between;gap:8px;align-items:start"><div><h3>${l.name}</h3><div class="sub">${l.record}</div></div><span class="badge ${st.s}">${STATUS_WORD[st.s]}</span></div>
      <div class="fill" aria-hidden="true"><i style="width:${Math.min(100,l.fill*100)}%"></i></div>
      <div class="stats"><span>Full</span><b>${f(l.fill*100,1)}%</b><span>Level</span><b>${lev==null?'–':f(lev,2)+' m'}</b><span>pH</span><b>${f(l.pH,2)}</b><span>DO</span><b>${l.DO==null?'–':f(l.DO,1)+' mg/L'}</b><span>WQI</span><b>${q?f(q.value,0)+' '+wqiBand(q.value):'–'}</b><span>To FTL</span><b>${l.hrs!=null?f(l.hrs,1)+' h':(l.rate!=null&&l.rate<=0?'falling':'–')}</b></div>
      <div class="why">${st.why.join('; ')}${l.src==='model'?' · live from model':(l.mine?' · your reading':'')}</div>`;
    b.addEventListener('click',()=>openLake(l.id));
    box.appendChild(b);
  });
}
function openLake(id){
  const l=lakes().find(x=>x.id===id), st=statusOf(l), q=wqi(l), lev=levelOf(l);
  document.getElementById('dlgTitle').textContent=l.name;
  document.getElementById('dlgSub').textContent=`${l.place} · ${l.record}`;
  const free = l.vftl*(1-l.fill);
  document.getElementById('dlgBody').innerHTML=`
    <p><span class="badge ${st.s}">${STATUS_WORD[st.s]}</span> ${st.why.join('; ')}</p>
    <dl class="kv">
      <dt>Built</dt><dd>${l.built}</dd>
      <dt>Water in / out</dt><dd>${l.drains}</dd>
      <dt>FTL height</dt><dd>${l.ftl==null?'Not published – set it in Model sensors':f(l.ftl,2)+' m'+(l.ftlSet?' (your Google Earth value)':'')}${l.mwl?` · max ${f(l.mwl,2)} m`:''}</dd>
      <dt>Area</dt><dd>${f(l.area/1e6,3)} km² (${f(l.area/4046.86,0)} acres)</dd>
      <dt>Volume at FTL</dt><dd>${f(l.vftl/1e6,2)} million m³${l.id==='saroor'?' (estimate)':''}</dd>
      <dt>Average depth</dt><dd>${f(l.vftl/l.area,2)} m = volume ÷ area</dd>
      <dt>Now</dt><dd>${f(l.fill*100,1)}% full${lev!=null?' · level '+f(lev,2)+' m':''} · ${l.mine?'your reading':l.startNote}</dd>
      <dt>Free space</dt><dd>${f(Math.max(0,free)/1e6,2)} million m³ before FTL</dd>
      <dt>Catchment</dt><dd>${l.catch?f(l.catch,1)+' km²':'Not published'}</dd>
      <dt>Grid point</dt><dd>(${l.grid[0]}, ${l.grid[1]}) km · ${l.lat}°N, ${l.lon}°E · <a href="https://www.google.com/maps?q=${l.lat},${l.lon}" target="_blank" rel="noopener">Open in Google Maps</a></dd>
      <dt>Rising</dt><dd>${l.rate==null?'Needs live model readings':(l.rate>0?f(l.rate,2)+'% per hour'+(l.hrs!=null?' → FTL in '+f(l.hrs,1)+' h':''):'Not rising')}</dd>
      <dt>pH</dt><dd>${f(l.pH,2)} <span class="muted">(safe 6.5–8.5)</span></dd>
      <dt>DO</dt><dd>${l.DO==null?'–':f(l.DO,2)+' mg/L'} <span class="muted">(fish need 4, bathing 5)</span></dd>
      <dt>BOD</dt><dd>${l.BOD==null?'–':f(l.BOD,1)+' mg/L'} <span class="muted">(bathing 3 or less)</span></dd>
      <dt>WQI</dt><dd>${q?f(q.value,0)+' – '+wqiBand(q.value)+' (from '+q.parts.map(p=>p.k).join(', ')+')':'Not enough readings'}</dd>
      <dt>Notes</dt><dd>${l.other}</dd>
    </dl>
    <p class="src" style="margin-top:12px">Sources: HMDA lake list, HMWSSB and GHMC level reports, TGPCB/TSPCB water-quality data, published studies – full links in the project doc.</p>`;
  const d=document.getElementById('lakeDlg'); try{d.showModal()}catch(e){d.setAttribute('open','')}
}
document.getElementById('dlgClose').addEventListener('click',()=>document.getElementById('lakeDlg').close());


// ---------- Grid map (Class 10 coordinate geometry) ----------
// Origin (0,0) = 17.30°N, 78.30°E; 1 unit = 1 km. Lines are straight-line distances, not real nala routes.
const MAP_PAIRS=[['osman','himayat'],['osman','durgam'],['osman','hussain'],['himayat','hussain'],['durgam','hussain'],['hussain','saroor']];
function renderMap(){
  const svg=document.getElementById('gridMap'); if(!svg) return; svg.innerHTML='';
  const list=lakes(), byId=Object.fromEntries(list.map(l=>[l.id,l]));
  const x0=66,y0=36,S=32, X=x=>x0+(x+1)*S, Y=y=>y0+(17-y)*S;   // grid from (-1,-1) to (27,17) km
  const g=el('g',{});
  for(let x=-1;x<=27;x++){ g.appendChild(el('line',{x1:X(x),x2:X(x),y1:Y(-1),y2:Y(17),stroke:x%2?'#E3ECEA':'#C9D7D5'})); if(x%2===0&&x>=0&&x<=26) g.appendChild(el('text',{x:X(x),y:Y(-1)+18,'text-anchor':'middle','font-size':12,fill:'#4A5F63'},x)); }
  for(let y=-1;y<=17;y++){ g.appendChild(el('line',{x1:X(-1),x2:X(27),y1:Y(y),y2:Y(y),stroke:y%2?'#E3ECEA':'#C9D7D5'})); if(y%2===0&&y>=0) g.appendChild(el('text',{x:X(-1)-8,y:Y(y)+4,'text-anchor':'end','font-size':12,fill:'#4A5F63'},y)); }
  g.appendChild(el('text',{x:X(27),y:Y(-1)+38,'text-anchor':'end','font-size':13,fill:'#4A5F63'},'x (km east of 78.30°E)'));
  g.appendChild(el('text',{x:X(-1)-8,y:Y(17)-12,'font-size':13,fill:'#4A5F63'},'y (km north of 17.30°N)'));
  g.appendChild(el('line',{x1:X(0),x2:X(0),y1:Y(-1),y2:Y(17),stroke:'#4A5F63','stroke-width':1.5}));
  g.appendChild(el('line',{x1:X(-1),x2:X(27),y1:Y(0),y2:Y(0),stroke:'#4A5F63','stroke-width':1.5}));
  svg.appendChild(g);
  // Musi river and Esi (approximate course, for orientation only)
  svg.appendChild(el('path',{d:`M${X(0)} ${Y(9.2)} C${X(5)} ${Y(8.8)} ${X(9)} ${Y(8.6)} ${X(12.7)} ${Y(8.3)} S${X(19)} ${Y(7.9)} ${X(26)} ${Y(7.6)}`,fill:'none',stroke:'#1E6F80','stroke-width':5,'stroke-linecap':'round',opacity:.55}));
  svg.appendChild(el('path',{d:`M${X(5.3)} ${Y(0)} Q${X(9)} ${Y(5)} ${X(12.7)} ${Y(8.3)}`,fill:'none',stroke:'#1E6F80','stroke-width':3,opacity:.45}));
  svg.appendChild(el('text',{x:X(21),y:Y(7.8)+20,'font-size':13,'font-weight':700,fill:'#0C3E4A'},'Musi river (approx.)'));
  svg.appendChild(el('text',{x:X(8.6),y:Y(4.2),'font-size':12,fill:'#0C3E4A'},'Esi'));
  // distance lines
  MAP_PAIRS.forEach(([a,b])=>{ const A=byId[a],B=byId[b]; const d=distanceKm(A,B);
    svg.appendChild(el('line',{x1:X(A.grid[0]),y1:Y(A.grid[1]),x2:X(B.grid[0]),y2:Y(B.grid[1]),stroke:'#8E847B','stroke-width':1.5,'stroke-dasharray':'6 5'}));
    const mx=(X(A.grid[0])+X(B.grid[0]))/2, my=(Y(A.grid[1])+Y(B.grid[1]))/2;
    svg.appendChild(el('rect',{x:mx-27,y:my-11,width:54,height:20,rx:4,fill:'#F7FAF9',stroke:'#C9D7D5'}));
    svg.appendChild(el('text',{x:mx,y:my+4,'text-anchor':'middle','font-size':12,'font-weight':700,fill:'#14282D'},d.toFixed(1)+' km'));
  });
  // lakes
  const col={green:'#2C8A57',amber:'#C98A12',red:'#C23B2F'};
  list.forEach(l=>{ const st=statusOf(l).s, cx=X(l.grid[0]), cy=Y(l.grid[1]), r=6+Math.sqrt(l.area/1e6)*2.4;
    const gr=el('g',{tabindex:0,role:'button','aria-label':`${l.name}, ${STATUS_WORD[st]}`,style:'cursor:pointer'});
    gr.addEventListener('click',()=>openLake(l.id)); gr.addEventListener('keydown',e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();openLake(l.id);}});
    gr.appendChild(el('circle',{cx,cy,r,fill:'#1E6F80','fill-opacity':.85,stroke:col[st],'stroke-width':4}));
    const right = l.grid[0] < 22, above = l.id==='osman';   // Osman's label sits above the Musi line
    const lx = above ? cx-r : (right?cx+r+8:cx-r-8), ly = above ? cy-r-24 : cy-3, anc = above||right ? 'start':'end';
    gr.appendChild(el('text',{x:lx,y:ly,'text-anchor':anc,'font-size':14,'font-weight':700,fill:'#14282D'},l.name));
    gr.appendChild(el('text',{x:lx,y:ly+16,'text-anchor':anc,'font-size':12,fill:'#4A5F63'},`(${l.grid[0]}, ${l.grid[1]})${l.ftl!=null?' · '+f(l.ftl,1)+' m':''}`));
    svg.appendChild(gr);
  });
  // distance table
  const tb=document.querySelector('#distTable tbody'); if(tb){ tb.innerHTML='';
    list.forEach(a=>{ const tr=document.createElement('tr'); tr.innerHTML=`<th>${a.name}</th>`+list.map(b=>`<td class="num">${a===b?'–':distanceKm(a,b).toFixed(1)}</td>`).join(''); tb.appendChild(tr); });
    document.querySelector('#distTable thead tr').innerHTML='<th>km</th>'+list.map(b=>`<th class="num">${b.name}</th>`).join('');
  }
}

// ---------- Simulator ----------
const rainEl=rain, hoursEl=hours, runoffEl=runoff;
function syncLabels(){rainV.textContent=rainEl.value;hoursV.textContent=hoursEl.value;runoffV.textContent=Math.round(runoffEl.value*100)+'%';}
[rainEl,hoursEl,runoffEl].forEach(i=>i.addEventListener('input',syncLabels)); syncLabels();
function runSim(){
  const list=lakes().map(l=>({...l, V:l.fill*l.vftl, peak:l.fill, start:l.fill, alerted:{} }));
  const rainMh = +rainEl.value/1000, H=+hoursEl.value, C=+runoffEl.value, useLinks=links.checked;
  const dt=600, steps=Math.round(H*3600/dt); const log=[]; let toMusi=0, moved=0;
  const tstr=s=>{const m=Math.round(s*dt/60);return `${String(Math.floor(m/60)).padStart(2,'0')}:${String(m%60).padStart(2,'0')}`};
  for(let s=1;s<=steps;s++){
    for(const l of list){
      const catchM2 = l.catch ? l.catch*1e6 : l.area*10;
      const Qin = C*rainMh/3600*catchM2 + rainMh/3600*l.area; // m3/s
      l.V += Qin*dt; l.lastQ=Qin;
    }
    // overflow handling: highest lakes first
    const order=[...list].sort((a,b)=>(b.ftl??-1)-(a.ftl??-1));
    for(const l of order){
      l.fill=l.V/l.vftl; l.peak=Math.max(l.peak,l.fill);
      const rise=l.lastQ*3600/l.area; const hrs = l.fill<1 && rise>0 ? (l.vftl-l.V)/(l.lastQ*3600) : null;
      const st=status(l,hrs);
      if(st.s!=='green' && !l.alerted[st.s]){ l.alerted[st.s]=1; log.push({t:tstr(s),cls:st.s,msg:`${l.name}: ${STATUS_WORD[st.s]} – ${st.why[0]}`}); }
      if(l.V>l.vftl){
        let surplus=l.V-l.vftl; l.V=l.vftl;
        if(useLinks && l.ftl!=null){
          const cands=list.filter(o=>o!==l && o.ftl!=null && o.ftl<l.ftl && o.V/o.vftl<0.8).sort((a,b)=>(b.vftl*0.9-b.V)-(a.vftl*0.9-a.V));
          for(const o of cands){ if(surplus<=0)break; const room=o.vftl*0.9-o.V; if(room<=0)continue; const take=Math.min(room,surplus); o.V+=take; surplus-=take; moved+=take;
            if(!l['sent'+o.id]){l['sent'+o.id]=1; log.push({t:tstr(s),cls:'',msg:`Valve opened: ${l.name} → ${o.name} (${f((o.ftl-l.ftl)*-1,1)} m downhill)`});} }
        }
        if(surplus>0){ toMusi+=surplus; if(!l.spilt){l.spilt=1; log.push({t:tstr(s),cls:'red',msg:`${l.name} releasing surplus into the Musi`});} }
      }
    }
  }
  list.forEach(l=>l.fill=l.V/l.vftl);
  const tb=document.querySelector('#simTable tbody'); tb.innerHTML='';
  list.forEach(l=>{ const st=status(l,null); const tr=document.createElement('tr');
    tr.innerHTML=`<td>${l.name}</td><td class="num">${f(l.start*100,0)}%</td><td class="num">${f(l.fill*100,0)}%</td><td class="num">${f(l.peak*100,0)}%</td><td><span class="badge ${st.s}">${STATUS_WORD[st.s]}</span></td>`; tb.appendChild(tr);});
  simHead.textContent=`${rainEl.value} mm/h for ${H} h: ${f(toMusi/1e6,2)} million m³ to the Musi${useLinks?`, ${f(moved/1e6,2)} million m³ saved in other lakes`:''}`;
  simLog.innerHTML = log.length? log.map(x=>`<div><span class="t">${x.t}</span><span class="${x.cls}">${x.msg}</span></div>`).join('') : '<div>No alerts: every lake stayed below 90% and above the quality limits.</div>';
  drawProfile(list, document.getElementById('profile'));
}
document.getElementById('runSim').addEventListener('click',runSim);
resetSim.addEventListener('click',()=>{renderNetwork(); simHead.textContent='Ready'; document.querySelector('#simTable tbody').innerHTML=''; simLog.innerHTML='<div class="muted">Run a storm to see alerts and transfers.</div>';});

// ---------- Maths calculators ----------
const LK = Object.fromEntries(BASE.map(b=>[b.id,b]));
const opts = sel => BASE.map(b=>`<option value="${b.id}" ${b.id===sel?'selected':''}>${b.name}</option>`).join('');
const CALCS=[
 {ch:'Ch 7 Coordinate geometry', t:'Distance, midpoint and section formula', html:`<div class="row"><div><label>Lake A</label><select data-k="a">${opts('hussain')}</select></div><div><label>Lake B</label><select data-k="b">${opts('durgam')}</select></div></div><div class="row"><div><label>Ratio m</label><input type="number" data-k="m" value="1" min="1"></div><div><label>Ratio n</label><input type="number" data-k="n" value="2" min="1"></div></div>`,
  run:v=>{const A=LK[v.a].grid,B=LK[v.b].grid,dx=B[0]-A[0],dy=B[1]-A[1],d=Math.hypot(dx,dy),m=+v.m,n=+v.n;
   return `A = (${A}) , B = (${B})<br>d = √[(${f(B[0],1)} − ${f(A[0],1)})² + (${f(B[1],1)} − ${f(A[1],1)})²] = √(${f(dx*dx,2)} + ${f(dy*dy,2)}) = <span class="ans">${f(d,2)} km</span><br>Midpoint = ((${A[0]} + ${B[0]})/2, (${A[1]} + ${B[1]})/2) = <span class="ans">(${f((A[0]+B[0])/2,2)}, ${f((A[1]+B[1])/2,2)})</span><br>Point dividing AB in ${m}:${n} = ((${m}×${B[0]} + ${n}×${A[0]})/${m+n}, (${m}×${B[1]} + ${n}×${A[1]})/${m+n}) = <span class="ans">(${f((m*B[0]+n*A[0])/(m+n),2)}, ${f((m*B[1]+n*A[1])/(m+n),2)})</span>`;}},
 {ch:'Ch 7 Coordinate geometry', t:'Area of the triangle between three lakes', html:`<div class="row"><div><label>Lake 1</label><select data-k="a">${opts('osman')}</select></div><div><label>Lake 2</label><select data-k="b">${opts('himayat')}</select></div><div><label>Lake 3</label><select data-k="c">${opts('hussain')}</select></div></div>`,
  run:v=>{const [x1,y1]=LK[v.a].grid,[x2,y2]=LK[v.b].grid,[x3,y3]=LK[v.c].grid;const s=x1*(y2-y3)+x2*(y3-y1)+x3*(y1-y2);
   return `Area = ½ |x₁(y₂ − y₃) + x₂(y₃ − y₁) + x₃(y₁ − y₂)|<br>= ½ |${x1}(${y2} − ${y3}) + ${x2}(${y3} − ${y1}) + ${x3}(${y1} − ${y2})|<br>= ½ |${f(s,2)}| = <span class="ans">${f(Math.abs(s)/2,2)} km²</span>`;}},
 {ch:'Ch 9 Applications of trigonometry', t:'Height of a dam or bund', html:`<div class="row"><div><label>Distance from foot (m)</label><input type="number" data-k="d" value="62"></div><div><label>Angle of elevation (°)</label><input type="number" data-k="a" value="30" min="1" max="89"></div></div>`,
  run:v=>{const h=v.d*Math.tan(v.a*Math.PI/180);return `tan ${v.a}° = h ÷ ${v.d}<br>h = ${v.d} × tan ${v.a}° = ${v.d} × ${f(Math.tan(v.a*Math.PI/180),4)} = <span class="ans">${f(h,2)} m</span><br><span class="muted">Osman Sagar dam: recorded height 35.97 m.</span>`;}},
 {ch:'Ch 9 Applications of trigonometry', t:'Angle of depression from Naubath Pahad', html:`<div class="row"><div><label>Height of hill (m)</label><input type="number" data-k="h" value="85"></div><div><label>Angle of depression (°)</label><input type="number" data-k="a" value="30" min="1" max="89"></div></div>`,
  run:v=>{const d=v.h/Math.tan(v.a*Math.PI/180);return `Alternate angles: angle of elevation from the boat = ${v.a}°<br>tan ${v.a}° = ${v.h} ÷ d → d = ${v.h} ÷ ${f(Math.tan(v.a*Math.PI/180),4)} = <span class="ans">${f(d,1)} m</span>`;}},
 {ch:'Ch 6 Triangles (similarity)', t:'Scale model heights', html:`<div class="row"><div><label>Real height difference (m)</label><input type="number" data-k="h" value="32.2"></div><div><label>Scale: 1 cm =  (m)</label><input type="number" data-k="s" value="4"></div></div>`,
  run:v=>`Model ÷ real is the same ratio for every height (similar figures).<br>Model height = ${v.h} ÷ ${v.s} = <span class="ans">${f(v.h/v.s,2)} cm</span>`},
 {ch:'Ch 12 Surface areas and volumes', t:'Lake volume: cone or cylinder?', html:`<div class="row"><div><label>Lake</label><select data-k="l">${opts('durgam')}</select></div><div><label>Max depth (m)</label><input type="number" data-k="h" value="8.5"></div></div>`,
  run:v=>{const L=LK[v.l],A=L.area,h=+v.h,cone=A*h/3,cyl=A*h;return `Area A = ${f(A,0)} m²<br>Cone = ⅓ × A × h = <b>${f(cone/1e6,2)} million m³</b><br>Cylinder = A × h = <b>${f(cyl/1e6,2)} million m³</b><br>Using Durgam Cheruvu's real ratio 0.58: 0.58 × ${f(cyl/1e6,2)} = <span class="ans">${f(0.58*cyl/1e6,2)} million m³</span><br><span class="muted">Listed volume: ${f(L.vftl/1e6,2)} million m³${L.id==='saroor'?' (estimate)':''}.</span>`;}},
 {ch:'Ch 12 Surface areas and volumes', t:'Draining through a pipe', html:`<div class="row"><div><label>Pipe diameter (m)</label><input type="number" data-k="d" value="2" step="0.1"></div><div><label>Speed (m/s)</label><input type="number" data-k="v" value="1.5" step="0.1"></div><div><label>Lower lake by (cm)</label><input type="number" data-k="c" value="1"></div><div><label>Lake</label><select data-k="l">${opts('hussain')}</select></div></div>`,
  run:v=>{const r=v.d/2,Q=Math.PI*r*r*v.v,V=LK[v.l].area*v.c/100,t=V/Q;return `Flow = πr²v = 3.1416 × ${f(r,2)}² × ${v.v} = <b>${f(Q,2)} m³/s</b><br>Volume = area × depth = ${f(LK[v.l].area,0)} × ${f(v.c/100,2)} = ${f(V,0)} m³<br>Time = ${f(V,0)} ÷ ${f(Q,2)} = ${f(t,0)} s = <span class="ans">${Math.floor(t/3600)} h ${Math.round(t%3600/60)} min</span>`;}},
 {ch:'Ch 11 Areas related to circles', t:'How irregular is the shoreline?', html:`<div class="row"><div><label>Lake area (km²)</label><input type="number" data-k="a" value="4.7" step="0.1"></div><div><label>Real shoreline (km)</label><input type="number" data-k="s" value="14"></div></div>`,
  run:v=>{const r=Math.sqrt(v.a*1e6/Math.PI),c=2*Math.PI*r/1000;return `πr² = ${f(v.a*1e6,0)} → r = √(${f(v.a*1e6,0)} ÷ 3.1416) = ${f(r,0)} m<br>Circle's edge 2πr = ${f(c,2)} km<br>Real ÷ circle = ${v.s} ÷ ${f(c,2)} = <span class="ans">${f(v.s/c,2)} times longer</span>`;}},
 {ch:'Ch 3 Pair of linear equations', t:'How much does rain raise the lake?', html:`<div class="row"><div><label>Day 1 rain (mm)</label><input type="number" data-k="r1" value="20"></div><div><label>Day 1 rise (cm)</label><input type="number" data-k="h1" value="6"></div><div><label>Day 2 rain (mm)</label><input type="number" data-k="r2" value="50"></div><div><label>Day 2 rise (cm)</label><input type="number" data-k="h2" value="12"></div><div><label>Predict for (mm)</label><input type="number" data-k="p" value="100"></div></div>`,
  run:v=>{const r1=+v.r1,r2=+v.r2,h1=+v.h1,h2=+v.h2; if(r1===r2) return 'Use two different rain amounts.'; const a=(h2-h1)/(r2-r1),b=h1-a*r1;
   return `${r1}a + b = ${h1}<br>${r2}a + b = ${h2}<br>Subtract: ${r2-r1}a = ${f(h2-h1,2)} → <b>a = ${f(a,3)} cm per mm</b>, <b>b = ${f(b,2)} cm</b><br>Rise for ${v.p} mm = ${f(a,3)} × ${v.p} + ${f(b,2)} = <span class="ans">${f(a*v.p+b,2)} cm</span><br><span class="muted">Sample values – replace with your own readings.</span>`;}},
 {ch:'Linear equations and rates', t:'Hours until Full Tank Level', html:`<div class="row"><div><label>Level now (m)</label><input type="number" data-k="h" value="513.14" step="0.01"></div><div><label>FTL (m)</label><input type="number" data-k="ftl" value="513.41" step="0.01"></div><div><label>Rise per hour (cm)</label><input type="number" data-k="r" value="2.7" step="0.1"></div></div>`,
  run:v=>{const t=(v.ftl-v.h)/(v.r/100);return `${v.h} + ${f(v.r/100,3)}t = ${v.ftl}<br>t = (${v.ftl} − ${v.h}) ÷ ${f(v.r/100,3)} = <span class="ans">${f(t,1)} hours</span>${t<6?'<br><b style="color:var(--bad)">Under 6 h → red alert</b>':''}`;}},
 {ch:'Linear equations and rates', t:'Water balance from inflow and outflow', html:`<div class="row"><div><label>Inflow (cusecs)</label><input type="number" data-k="i" value="1430"></div><div><label>Outflow (cusecs)</label><input type="number" data-k="o" value="2680"></div><div><label>Lake</label><select data-k="l">${opts('hussain')}</select></div></div>`,
  run:v=>{const q=(v.i-v.o)*CUSEC,V=q*3600,dh=V/LK[v.l].area*100;return `Net = ${v.i} − ${v.o} = ${v.i-v.o} cusecs × 0.0283 = ${f(q,1)} m³/s<br>In 1 hour: ${f(q,1)} × 3600 = ${f(V,0)} m³<br>Change in level = ${f(V,0)} ÷ ${f(LK[v.l].area,0)} m² = <span class="ans">${dh>=0?'+':''}${f(dh,2)} cm per hour</span>`;}},
 {ch:'Ch 4 Quadratic equations', t:'Size of a treatment wetland', html:`<div class="row"><div><label>Area needed (m²)</label><input type="number" data-k="a" value="1200"></div><div><label>Length − width (m)</label><input type="number" data-k="d" value="10"></div></div>`,
  run:v=>{const a=+v.a,d=+v.d,x=(-d+Math.sqrt(d*d+4*a))/2;return `x(x + ${d}) = ${a} → x² + ${d}x − ${a} = 0<br>x = [−${d} + √(${d}² + 4×${a})] ÷ 2 = [−${d} + ${f(Math.sqrt(d*d+4*a),2)}] ÷ 2<br><span class="ans">Width ${f(x,2)} m, length ${f(x+d,2)} m</span> (the negative root is rejected)`;}},
 {ch:'Ch 5 Arithmetic progressions', t:'Silt filling Osman Sagar', html:`<div class="row"><div><label>First capacity (TMC)</label><input type="number" data-k="a" value="5.541" step="0.001"></div><div><label>Capacity now (TMC)</label><input type="number" data-k="now" value="3.90" step="0.01"></div><div><label>Years between</label><input type="number" data-k="y" value="105"></div><div><label>First year</label><input type="number" data-k="y0" value="1920"></div><div><label>Danger level (TMC)</label><input type="number" data-k="t" value="3.0" step="0.1"></div></div>`,
  run:v=>{const d=(v.now-v.a)/v.y,n1=(v.t-v.a)/d;return `d = (${v.now} − ${v.a}) ÷ ${v.y} = <b>${f(d,4)} TMC per year</b><br>aₙ = a + (n − 1)d → ${v.t} = ${v.a} + (n − 1)(${f(d,4)})<br>n − 1 = ${f(n1,1)} years → <span class="ans">around ${Math.round(+v.y0+n1)}</span>`;}},
 {ch:'Ch 13 Statistics · Ch 14 Probability', t:'Typical oxygen and chance of a safe reading', html:`<label>DO readings (mg/L), separated by commas</label><input type="text" data-k="r" value="2.5, 1.4, 3.2, 2.6, 1.2"><div class="row"><div><label>Safe limit (mg/L)</label><input type="number" data-k="lim" value="4" step="0.5"></div></div>`,
  run:v=>{const a=String(v.r).split(/[ ,;]+/).filter(x=>x!=='').map(Number).filter(x=>isFinite(x));if(!a.length)return 'Enter some readings.';const s=[...a].sort((x,y)=>x-y),n=a.length,mean=a.reduce((p,c)=>p+c,0)/n,med=n%2?s[(n-1)/2]:(s[n/2-1]+s[n/2])/2;
   const cnt={};a.forEach(x=>cnt[x]=(cnt[x]||0)+1);const mx=Math.max(...Object.values(cnt));const mode=mx>1?Object.keys(cnt).filter(k=>cnt[k]===mx).join(', '):'no value repeats';const safe=a.filter(x=>x>=v.lim).length;
   return `n = ${n}, sum = ${f(a.reduce((p,c)=>p+c,0),2)}<br>Mean = <b>${f(mean,2)}</b> · Sorted: ${s.join(', ')} · Median = <b>${f(med,2)}</b> · Mode: ${mode} · Range = ${f(s[n-1]-s[0],2)}<br>P(DO ≥ ${v.lim}) = ${safe} ÷ ${n} = <span class="ans">${f(safe/n,2)}</span>`;}},
 {ch:'Ch 13 Statistics (weighted mean)', t:'Water Quality Index', html:`<div class="row"><div><label>pH</label><input type="number" data-k="pH" value="8.0" step="0.01"></div><div><label>DO (mg/L)</label><input type="number" data-k="DO" value="0.3" step="0.1"></div><div><label>BOD (mg/L)</label><input type="number" data-k="BOD" value="12" step="0.1"></div><div><label>Turbidity (NTU)</label><input type="number" data-k="turb" value="26"></div></div>`,
  run:v=>{const q=wqi({pH:+v.pH,DO:+v.DO,BOD:+v.BOD,turb:+v.turb});return q.parts.map(p=>`${p.k}: q = 100 × (${p.v} − ${QI[p.k].i}) ÷ (${QI[p.k].s} − ${QI[p.k].i}) = ${f(p.q,1)}, w = 1/${QI[p.k].s} = ${f(p.w,3)}`).join('<br>')+`<br>WQI = Σwq ÷ Σw = ${f(q.parts.reduce((s,p)=>s+p.w*p.q,0),1)} ÷ ${f(q.parts.reduce((s,p)=>s+p.w,0),3)} = <span class="ans">${f(q.value,0)} (${wqiBand(q.value)})</span>`;}},
 {ch:'Units', t:'Convert reservoir units', html:`<div class="row"><div><label>TMC</label><input type="number" data-k="t" value="3.90" step="0.01"></div><div><label>Feet</label><input type="number" data-k="ft" value="1790"></div></div>`,
  run:v=>`${v.t} TMC × 28.317 = <span class="ans">${f(v.t*28.3168,2)} million m³</span><br>${v.ft} ft × 0.3048 = <span class="ans">${f(v.ft*0.3048,2)} m</span>`}
];
function buildCalcs(){
  const wrap=document.getElementById('calcs');
  CALCS.forEach((c,i)=>{
    const d=document.createElement('div'); d.className='calc';
    d.innerHTML=`<div class="ch">${c.ch}</div><h3>${c.t}</h3>${c.html}<div class="steps" aria-live="polite"></div>`;
    const out=d.querySelector('.steps');
    const go=()=>{const v={};d.querySelectorAll('[data-k]').forEach(x=>v[x.dataset.k]=x.type==='number'?+x.value:x.value);try{out.innerHTML=c.run(v)}catch(e){out.textContent='Check the numbers.'}};
    d.addEventListener('input',go); go(); wrap.appendChild(d);
  });
}

// ---------- Readings & settings ----------
function fillLakeSelect(){ mLake.innerHTML=BASE.map(b=>`<option value="${b.id}">${b.name}</option>`).join(''); }
saveReading.addEventListener('click',()=>{
  const id=mLake.value, r=readings[id]||{};
  const num=x=>x.value===''?undefined:+x.value;
  const nv={fill:num(mFill),pH:num(mPH),DO:num(mDO),BOD:num(mBOD),turb:num(mTurb)};
  Object.entries(nv).forEach(([k,v])=>{if(v!==undefined) r[k]=v;});
  r.time=new Date().toLocaleString('en-IN'); r.src='manual'; readings[id]=r; store.set('readings',readings); renderAll();
  logSerial(`Saved your reading for ${LK[id].name}`);
});
clearReading.addEventListener('click',()=>{delete readings[mLake.value]; store.set('readings',readings); renderAll(); logSerial(`${LK[mLake.value].name} back to published data`);});
function buildSettings(){
  timeScaleIn.value=timeScale();
  const tb=document.querySelector('#settingsTable tbody'); tb.innerHTML='';
  BASE.forEach(b=>{const s=settings[b.id]||{}; const tr=document.createElement('tr');
    tr.innerHTML=`<td>${b.name}</td><td><input type="number" step="0.1" data-id="${b.id}" data-s="mark" value="${s.mark??15}" aria-label="FTL mark for ${b.name}"></td><td>${b.ftl!=null?f(b.ftl,2)+' (published)':`<input type="number" step="0.1" data-id="${b.id}" data-s="ftl" value="${s.ftl??''}" placeholder="from Google Earth" aria-label="FTL height for ${b.name}">`}</td>`; tb.appendChild(tr);});
}
saveSettings.addEventListener('click',()=>{const ts=+timeScaleIn.value; settings._timeScale = ts>0?ts:60;document.querySelectorAll('#settingsTable input').forEach(i=>{const id=i.dataset.id;settings[id]=settings[id]||{};settings[id][i.dataset.s]=i.value===''?undefined:+i.value;});store.set('settings',settings);renderAll();logSerial('Settings saved');});

// ---------- Serial (ESP32) ----------
let port=null, reader=null, writer=null;
function logSerial(msg){ const box=serialLog; if(box.firstElementChild&&box.firstElementChild.classList.contains('muted')) box.innerHTML=''; const d=document.createElement('div'); d.innerHTML=`<span class="t">${new Date().toLocaleTimeString('en-IN')}</span>${msg}`; box.prepend(d); }
function setConn(live,text){connDot.classList.toggle('live',live);connText.textContent=text;}
const lastCmd={};   // id -> last state sent, so each command goes once, only when something changes
function handleLine(line){
  line=line.trim(); if(!line) return;
  if(line.startsWith('#')){ logSerial(`Model: ${esc(line.slice(1).trim())}`); return; }   // messages from the ESP32
  const kv={}; line.split(';').forEach(p=>{const [k,v]=p.split('=');if(k&&v!=null)kv[k.trim().toUpperCase()]=v.trim();});
  const id=(kv.LAKE||'').toLowerCase(); if(!LK[id]){logSerial(`Ignored: ${esc(line)}`);return;}
  const r=readings[id]||{}; const mark=(settings[id]&&settings[id].mark)||15;
  if(kv.DEPTH_CM!=null && isFinite(+kv.DEPTH_CM)){
    r.fill=+kv.DEPTH_CM/mark*100;
    r.hist=(r.src==='model'&&r.hist?r.hist:[]).concat({t:Date.now(),fill:r.fill}).slice(-60);
  }
  for(const [k,key] of [['PH','pH'],['DO','DO'],['BOD','BOD'],['TURB','turb']]) if(kv[k]!=null && isFinite(+kv[k])) r[key]=+kv[k];
  r.time=new Date().toLocaleString('en-IN'); r.src='model'; readings[id]=r; store.set('readings',readings);
  renderAll();
  const L=lakes().find(x=>x.id===id), st=statusOf(L);
  logSerial(`${LK[id].name}: ${f(L.fill*100,1)}% full${L.hrs!=null?`, FTL in ${f(L.hrs,1)} h`:''}${kv.PH?', pH '+esc(kv.PH):''}${kv.TURB?', turbidity '+esc(kv.TURB):''} → <b>${STATUS_WORD[st.s]}</b>`);
  // tell the model what to do – only when the decision changes
  const valve = st.s==='red' ? routeFor(L) : `VALVE ${id} CLOSE`;
  const aer = (L.DO!=null && L.DO<4) ? `AERATOR ${id} ON` : `AERATOR ${id} OFF`;
  const led = `LED ${id} ${st.s.toUpperCase()}`;
  const prev=lastCmd[id]||{};
  for(const [k,c] of [['led',led],['valve',valve],['aer',aer]]){ if(prev[k]!==c){ sendCmd(c); if(k!=='led') logSerial(`${writer?'Sent to model':'Decision'}: ${c}`);} }
  lastCmd[id]={led,valve,aer};
}
function routeFor(L){
  const c=chooseTarget(lakes(), L);
  if(c){ return `VALVE ${L.id} ${c.id} OPEN`; }
  return `MUSI ${L.id}`;
}
const esc = s => String(s).replace(/[&<>"]/g, c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
async function sendCmd(cmd){ if(!writer) return; try{ await writer.write(new TextEncoder().encode(cmd+'\n')); }catch(e){} }
connectBtn.addEventListener('click',async()=>{
  if(!('serial' in navigator)){serialMsg.textContent='This browser has no USB serial support. Use Chrome or Edge on a laptop.';return;}
  try{
    port=await navigator.serial.requestPort(); await port.open({baudRate:115200});
    writer=port.writable.getWriter(); setConn(true,'Model connected'); connectBtn.disabled=true; disconnectBtn.disabled=false; serialMsg.textContent='Connected at 115200 baud.';
    const dec=new TextDecoderStream(); port.readable.pipeTo(dec.writable).catch(()=>{}); reader=dec.readable.getReader(); let buf='';
    while(true){const {value,done}=await reader.read(); if(done)break; buf+=value; let i; while((i=buf.indexOf('\n'))>=0){handleLine(buf.slice(0,i)); buf=buf.slice(i+1);} }
  }catch(e){ serialMsg.textContent = (e && e.name==='SecurityError') ? 'USB is blocked here. Open index.html directly in Chrome or Edge to connect.' : 'Not connected: '+(e&&e.message||'no port chosen'); setConn(false,'Using published data'); connectBtn.disabled=false; }
});
disconnectBtn.addEventListener('click',async()=>{ try{reader&&await reader.cancel();writer&&writer.releaseLock();await port.close();}catch(e){} port=reader=writer=null; setConn(false,'Using published data'); connectBtn.disabled=false; disconnectBtn.disabled=true; serialMsg.textContent='Disconnected.'; });
sendTest.addEventListener('click',()=>handleLine(testLine.value));

// ---------- start ----------
function renderAll(){ renderNetwork(); renderMap(); }
fillLakeSelect(); buildSettings(); buildCalcs(); renderAll(); route();
if('serviceWorker' in navigator && location.protocol==='https:'){ navigator.serviceWorker.register('sw.js').catch(()=>{}); }
