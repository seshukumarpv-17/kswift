"use strict";
/* K-SWIFT app – preset data version (no sensors). Views:
   #lakes  #lake/<id>  #map  #simulate  #maths  #subs  #pollution */
const $ = s => document.querySelector(s);
const esc = s => String(s).replace(/[&<>"]/g, c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
const COL = {green:'#2C8A57', amber:'#C98A12', red:'#C23B2F'};
const lakes = () => BASE.map(b => ({...b}));
const statusOf = L => status(L, null);
const tag = s => s==='pub' ? '<span class="tag pub" title="Published figure">published</span>'
                : s==='est' ? '<span class="tag est" title="Our estimate">estimate</span>'
                : '<span class="tag pre" title="Demo value used by the model">preset</span>';
const subFor = linkId => SUBSTATIONS.find(s=>s.link.id===linkId);
const nameOf = id => (LK[id]||MUSI_POINTS[id]).name;
const gmaps = (lat,lon) => `https://www.google.com/maps?q=${lat},${lon}`;

// ---------- Routing ----------
const VIEWS=['lakes','lake','map','simulate','maths','subs','pollution'];
let currentLake = 'osman';
function route(){
  const [v0, arg] = location.hash.slice(1).split('/');
  const v = VIEWS.includes(v0) ? v0 : 'lakes';
  document.querySelectorAll('section[data-view]').forEach(s=>s.classList.toggle('on', s.dataset.view===v));
  const tabV = v==='lake' ? 'lakes' : v;
  document.querySelectorAll('nav.tabs a').forEach(a=>{ if(a.getAttribute('href')==='#'+tabV) a.setAttribute('aria-current','page'); else a.removeAttribute('aria-current'); });
  if(v==='lake'){ currentLake = LK[arg] ? arg : 'osman'; renderLakePage(currentLake); }
  if(v==='map') showAllMap();
  if(v==='subs') showSubMap();
  window.scrollTo(0,0);
}
addEventListener('hashchange', route);

// ---------- Leaflet helpers ----------
const hasL = typeof L !== 'undefined';
function baseLayers(){
  return {
    'Street map': L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',{maxZoom:19, attribution:'&copy; OpenStreetMap contributors'}),
    'Satellite': L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',{maxZoom:19, attribution:'Tiles &copy; Esri'})
  };
}
function newMap(elId, center, zoom){
  const el = document.getElementById(elId);
  if(!hasL){ el.innerHTML='<p class="note" style="padding:16px">The map library did not load. Check the internet connection and reload.</p>'; return null; }
  const m = L.map(el, {scrollWheelZoom:false, tap:true}).setView(center, zoom);
  const b = baseLayers(); b['Street map'].addTo(m); L.control.layers(b, null, {collapsed:false}).addTo(m);
  L.control.scale({imperial:false}).addTo(m);
  return m;
}
function addNetwork(m, opts={}){
  L.polyline(MUSI,{color:'#1E6F80',weight:5,opacity:.55}).addTo(m).bindTooltip('Musi river (approx. course)');
  L.polyline(ESI,{color:'#1E6F80',weight:3,opacity:.45}).addTo(m).bindTooltip('Esi river (approx.)');
  LINKS.forEach(k=>{
    const A=nodeOf(k.from), B=nodeOf(k.to);
    L.polyline([[A.lat,A.lon],[B.lat,B.lon]],{color:'#8E847B',weight:3,dashArray:'8 6'}).addTo(m)
     .bindTooltip(`${k.id}: ${A.name} → ${B.name} · ${distanceKm(A,B).toFixed(2)} km`);
  });
  BASE.forEach(l=>{
    const st = statusOf(l).s, r = 7 + Math.sqrt(l.area/1e6)*2.2;
    const c = L.circleMarker([l.lat,l.lon],{radius:r,color:COL[st],weight:4,fillColor:'#1E6F80',fillOpacity:.85}).addTo(m);
    c.bindTooltip(l.name,{permanent:opts.labels!==false,direction:'right',className:'lk-label',offset:[r,0]});
    c.bindPopup(`<b>${l.name}</b><br>${f(l.fill*100,1)}% full · FTL ${f(l.ftl,2)} m<br>WQI ${f(wqi(qObj(l)).value,0)} (${wqiBand(wqi(qObj(l)).value)})<br><a href="#lake/${l.id}">Open lake page</a>`);
  });
  Object.values(MUSI_POINTS).forEach(p=>L.circleMarker([p.lat,p.lon],{radius:5,color:'#0C3E4A',weight:2,fillColor:'#fff',fillOpacity:1}).addTo(m).bindTooltip(p.name));
  SUBSTATIONS.forEach(s=>{
    const st = substationStatus(s).s;
    const icon = L.divIcon({className:'ss-icon', html:`<span style="border-color:${COL[st]}">${s.id.replace('SS-','')}</span>`, iconSize:[24,24], iconAnchor:[12,12]});
    L.marker([s.lat,s.lon],{icon}).addTo(m).bindPopup(`<b>${s.id}</b> on ${s.link.id}<br>${nameOf(s.link.from)} → ${nameOf(s.link.to)}<br>Gate ${s.v.gate}% open · DO ${s.v.DO} mg/L<br><a href="#subs">Substation details</a>`)
     .bindTooltip(s.id,{direction:'top',offset:[0,-10]});
  });
}
let allMap=null, subMap=null, lakeMap=null;
function showAllMap(){
  if(!allMap){ allMap = newMap('allMap',[17.375,78.43],11); if(allMap){ addNetwork(allMap); allMap.fitBounds(BASE.map(l=>[l.lat,l.lon]),{padding:[30,30]}); } }
  setTimeout(()=>allMap&&allMap.invalidateSize(),60);
}
function showSubMap(){
  if(!subMap){ subMap = newMap('subMap',[17.38,78.43],11); if(subMap){ addNetwork(subMap,{labels:false}); subMap.fitBounds(SUBSTATIONS.map(s=>[s.lat,s.lon]),{padding:[40,40]}); } }
  setTimeout(()=>subMap&&subMap.invalidateSize(),60);
}

// ---------- Elevation profile ----------
const NS='http://www.w3.org/2000/svg';
function el(tag,attrs={},text){const e=document.createElementNS(NS,tag);for(const k in attrs)e.setAttribute(k,attrs[k]);if(text!=null)e.textContent=text;return e;}
function drawProfile(list, svg){
  svg.innerHTML='';
  const H=360, x0=70, x1=960, yTop=50, yBot=310, eMin=462, eMax=590;
  const X=g=> (x0+75) + (g/24.1)*(x1-x0-150);
  const Y=e=> yBot - (e-eMin)/(eMax-eMin)*(yBot-yTop);
  for(let e=480;e<=580;e+=20){ svg.appendChild(el('line',{x1:x0,x2:x1,y1:Y(e),y2:Y(e),stroke:'#C9D7D5'})); svg.appendChild(el('text',{x:x0-10,y:Y(e)+4,'text-anchor':'end','font-size':13,fill:'#4A5F63'},e+' m')); }
  svg.appendChild(el('text',{x:x0,y:H-6,'font-size':13,fill:'#4A5F63'},'West'));
  svg.appendChild(el('text',{x:x1,y:H-6,'font-size':13,fill:'#4A5F63','text-anchor':'end'},'East (km on the grid)'));
  // downhill links
  LINKS.filter(k=>LK[k.to]).forEach(k=>{ const A=list.find(l=>l.id===k.from), B=list.find(l=>l.id===k.to);
    svg.appendChild(el('path',{d:`M${X(A.grid[0])} ${Y(A.ftl)+20} L${X(B.grid[0])} ${Y(B.ftl)+20}`,stroke:'#8E847B','stroke-width':2,'stroke-dasharray':'6 5',fill:'none'}));
    const mx=(X(A.grid[0])+X(B.grid[0]))/2, my=(Y(A.ftl)+Y(B.ftl))/2+20;
    svg.appendChild(el('text',{x:mx,y:my-6,'text-anchor':'middle','font-size':12,fill:'#6B5F55','font-weight':700},subFor(k.id).id));
  });
  svg.appendChild(el('path',{d:`M${X(11)} ${Y(466)} H${x1}`,stroke:'#1E6F80','stroke-width':6,'stroke-linecap':'round'}));
  svg.appendChild(el('text',{x:X(11),y:Y(466)+20,'font-size':13,fill:'#0C3E4A','font-weight':700},'Musi river (all five drain here)'));
  list.forEach(l=>{
    const st=statusOf(l).s, cx=X(l.grid[0]), w=Math.max(60, Math.min(118, Math.sqrt(l.area)/40)), top=Y(l.ftl), depth=34;
    const g=el('a',{href:`#lake/${l.id}`,'aria-label':`${l.name}, ${STATUS_WORD[st]}`});
    const basin=`M${cx-w/2} ${top} L${cx-w/2+14} ${top+depth} L${cx+w/2-14} ${top+depth} L${cx+w/2} ${top} Z`;
    g.appendChild(el('path',{d:basin,fill:'#DCD6CF',stroke:'#8E847B','stroke-dasharray':l.ftlSrc==='pub'?'':'5 4','stroke-width':1.5}));
    const fh=Math.min(1.12,l.fill)*depth, wy=top+depth-fh, clip='c'+l.id+svg.id;
    const cp=el('clipPath',{id:clip}); cp.appendChild(el('path',{d:basin})); g.appendChild(cp);
    g.appendChild(el('rect',{x:cx-w/2,y:wy,width:w,height:fh+1,fill:'#1E6F80','clip-path':`url(#${clip})`,opacity:.85}));
    if(l.fill>1) g.appendChild(el('rect',{x:cx-w/2-4,y:top-4,width:w+8,height:4,fill:'#C23B2F'}));
    g.appendChild(el('line',{x1:cx-w/2-6,x2:cx+w/2+6,y1:top,y2:top,stroke:COL[st],'stroke-width':3}));
    g.appendChild(el('text',{x:cx,y:top-24,'text-anchor':'middle','font-size':15,'font-weight':700,fill:'#14282D','font-family':'Bricolage Grotesque, system-ui, sans-serif'},l.name));
    g.appendChild(el('text',{x:cx,y:top-8,'text-anchor':'middle','font-size':13,fill:'#4A5F63'},`${f(l.ftl,1)} m${l.ftlSrc==='pub'?'':'*'} · ${f(l.fill*100,0)}%`));
    svg.appendChild(g);
  });
}

// ---------- Lakes overview ----------
function renderLakes(){
  const list=lakes();
  drawProfile(list, $('#profile'));
  const box=$('#lakeList'); box.innerHTML='';
  list.forEach(l=>{
    const st=statusOf(l), q=wqi(qObj(l)), lev=levelOf(l);
    const a=document.createElement('a'); a.className='lake '+st.s; a.href='#lake/'+l.id;
    a.innerHTML=`<div class="lake-top"><div><h3>${l.name}</h3><div class="sub">${esc(l.record)}</div></div><span class="badge ${st.s}">${STATUS_WORD[st.s]}</span></div>
      <div class="fill" aria-hidden="true"><i style="width:${Math.min(100,l.fill*100)}%"></i></div>
      <div class="stats">
        <span>Volume at FTL</span><b>${f(l.vftl/1e6,2)} M m³</b>
        <span>Water now</span><b>${f(l.fill*l.vftl/1e6,2)} M m³ (${f(l.fill*100,1)}%)</b>
        <span>Area</span><b>${f(l.area/1e6,2)} km²</b>
        <span>Elevation (FTL)</span><b>${f(l.ftl,2)} m${l.ftlSrc==='pub'?'':'*'}</b>
        <span>Level now</span><b>${f(lev,2)} m</b>
        <span>pH · DO</span><b>${f(val(l,'pH'),2)} · ${f(val(l,'DO'),1)} mg/L</b>
        <span>BOD</span><b>${f(val(l,'BOD'),1)} mg/L</b>
        <span>WQI</span><b>${f(q.value,0)} ${wqiBand(q.value)}</b>
        <span>Location</span><b>${l.lat}°N, ${l.lon}°E</b>
      </div>
      <div class="why">${st.why.join('; ')}</div>`;
    box.appendChild(a);
  });
  const tb=$('#allTable tbody'); tb.innerHTML='';
  list.forEach(l=>{ const q=wqi(qObj(l)); const tr=document.createElement('tr');
    tr.innerHTML=`<th><a href="#lake/${l.id}">${l.name}</a></th><td class="num">${f(l.vftl/1e6,2)}</td><td class="num">${f(l.fill*100,1)}</td><td class="num">${f(l.area/1e6,3)}</td><td class="num">${f(l.area/ACRE,0)}</td><td class="num">${f(l.ftl,2)}${l.ftlSrc==='pub'?'':'*'}</td><td class="num">${f(l.vftl/l.area,2)}</td><td class="num">${f(val(l,'pH'),2)}</td><td class="num">${f(val(l,'DO'),2)}</td><td class="num">${f(val(l,'BOD'),1)}</td><td class="num">${f(val(l,'turb'),0)}</td><td class="num">${f(q.value,0)}</td>`;
    tb.appendChild(tr); });
}

// ---------- Single lake page ----------
function renderLakePage(id){
  const l = lakes().find(x=>x.id===id), st=statusOf(l), qq=qObj(l), q=wqi(qq), lev=levelOf(l), idx=BASE.findIndex(b=>b.id===id);
  const prev=BASE[(idx+4)%5], next=BASE[(idx+1)%5];
  const free=l.vftl*(1-l.fill);
  const links=LINKS.filter(k=>k.from===id||k.to===id);
  const P=POLLUTION[id];
  const qRow=(k,label,unit,limit)=>`<tr><th>${label}</th><td class="num">${f(l.q[k][0],2)} ${unit}</td><td>${tag(l.q[k][1])}</td><td class="muted">${limit}</td></tr>`;
  $('#lakePage').innerHTML=`
    <div class="lp-nav"><a href="#lakes">← All lakes</a><span><a href="#lake/${prev.id}">‹ ${prev.name}</a> · <a href="#lake/${next.id}">${next.name} ›</a></span></div>
    <div class="lp-head"><div><h1>${l.name}</h1><p class="muted">${esc(l.place)} · ${esc(l.record)}${l.alias?' · also called '+esc(l.alias):''}</p></div>
      <span class="badge big ${st.s}">${STATUS_WORD[st.s]}</span></div>
    <p class="why">${st.why.join('; ')}</p>
    <div class="grid2 lp">
      <div class="panel"><div id="lakeMap" class="map" role="region" aria-label="Map of ${l.name}"></div>
        <p class="note" style="margin:8px 0 0">Switch between street map and satellite at the top right. Dashed lines are K-SWIFT links; numbered squares are substations. The map needs internet; every number on this page works offline.</p></div>
      <div class="panel">
        <h2>Size, height and volume</h2>
        <div class="kpis">
          <div><span>Volume at FTL</span><b>${f(l.vftl/1e6,2)}</b><small>million m³ ${l.id==='osman'||l.id==='himayat'?'('+f(l.vftl/TMC,2)+' TMC)':''}</small></div>
          <div><span>Water now</span><b>${f(l.fill*l.vftl/1e6,2)}</b><small>million m³ · ${f(l.fill*100,1)}% full</small></div>
          <div><span>Free space</span><b>${f(free/1e6,2)}</b><small>million m³ before FTL</small></div>
          <div><span>Area</span><b>${f(l.area/1e6,3)}</b><small>km² = ${f(l.area/ACRE,0)} acres</small></div>
          <div><span>Elevation (FTL)</span><b>${f(l.ftl,2)}</b><small>m above sea level ${l.ftlSrc==='pub'?'':'(preset)'}</small></div>
          <div><span>Level now</span><b>${f(lev,2)}</b><small>m = FTL − free ÷ area</small></div>
          <div><span>Average depth</span><b>${f(l.vftl/l.area,2)}</b><small>m = volume ÷ area</small></div>
          <div><span>Max depth</span><b>${l.maxDepth?f(l.maxDepth,1):'–'}</b><small>m${l.damH?' · dam height '+f(l.damH,2)+' m':''}</small></div>
        </div>
        <div class="fill big" aria-hidden="true"><i style="width:${Math.min(100,l.fill*100)}%"></i></div>
        <p class="note">${esc(l.fillNote)} ${tag(l.fillSrc)} · FTL: ${esc(l.ftlNote)} ${tag(l.ftlSrc)}</p>
      </div>
    </div>
    <div class="grid3" style="margin-top:16px">
      <div class="panel">
        <h2>Water quality</h2>
        <table class="qt"><thead><tr><th>Reading</th><th class="num">Value</th><th>Source</th><th>Safe limit</th></tr></thead><tbody>
          ${qRow('pH','pH','','6.5–8.5')}${qRow('DO','Dissolved oxygen (DO)','mg/L','4 or more (fish), 5 (bathing)')}
          ${qRow('BOD','BOD','mg/L','3 or less (bathing)')}${qRow('turb','Turbidity','NTU','5 or less')}
          ${qRow('TDS','Total dissolved solids','mg/L','500 or less (drinking)')}${qRow('temp','Temperature','°C','–')}
        </tbody></table>
        <div class="wqi-box"><div><span>WQI</span><b>${f(q.value,0)}</b><small>${wqiBand(q.value)} · lower is better</small></div><div><span>CPCB class</span><b class="sm">${cpcbClass(qq)}</b></div></div>
        <p class="note">${esc(l.other)}</p>
      </div>
      <div class="panel">
        <h2>Location</h2>
        <dl class="kv">
          <dt>Latitude, longitude</dt><dd>${l.lat}°N, ${l.lon}°E · <a href="${gmaps(l.lat,l.lon)}" target="_blank" rel="noopener">Google Maps</a></dd>
          <dt>Grid point</dt><dd>(${l.grid[0]}, ${l.grid[1]}) km from 17.30°N, 78.30°E</dd>
          <dt>Built</dt><dd>${esc(l.built)}</dd>
          <dt>Water comes in from</dt><dd>${esc(l.inflow)}</dd>
          <dt>Water goes out by</dt><dd>${esc(l.outflow)}</dd>
          <dt>Used for</dt><dd>${esc(l.use)}</dd>
          <dt>Catchment</dt><dd>${l.catch?f(l.catch,1)+' km²':'Not published'}</dd>
        </dl>
      </div>
      <div class="panel">
        <h2>Connections and substations</h2>
        <ul class="plain">${links.map(k=>{const s=subFor(k.id), other=k.from===id?k.to:k.from, A=nodeOf(k.from),B=nodeOf(k.to);
          return `<li><b>${s.id}</b> on ${k.id}: ${nameOf(k.from)} → ${nameOf(k.to)}<br><span class="muted">${k.kind} · ${distanceKm(A,B).toFixed(2)} km${A.ftl!=null&&B.ftl!=null?' · drop '+f(A.ftl-B.ftl,2)+' m':''} · gate ${s.v.gate}% open</span></li>`}).join('')}</ul>
        <h3 style="margin-top:12px">Pollution: ${P.level}</h3>
        <ul class="plain small">${P.sources.map(x=>`<li>${esc(x)}</li>`).join('')}</ul>
        <p><a href="#pollution">How it is being removed →</a></p>
      </div>
    </div>`;
  if(lakeMap){ lakeMap.remove(); lakeMap=null; }
  lakeMap = newMap('lakeMap',[l.lat,l.lon],l.zoom);
  if(lakeMap){ addNetwork(lakeMap,{focus:id}); setTimeout(()=>lakeMap.invalidateSize(),60); }
}

// ---------- Coordinate grid (Class 10) ----------
const MAP_PAIRS=[['osman','himayat'],['osman','durgam'],['osman','hussain'],['himayat','hussain'],['durgam','hussain'],['hussain','saroor']];
function renderGrid(){
  const svg=$('#gridMap'); svg.innerHTML='';
  const list=lakes(), byId=Object.fromEntries(list.map(l=>[l.id,l]));
  const x0=66,y0=36,S=32, X=x=>x0+(x+1)*S, Y=y=>y0+(17-y)*S;
  const g=el('g',{});
  for(let x=-1;x<=27;x++){ g.appendChild(el('line',{x1:X(x),x2:X(x),y1:Y(-1),y2:Y(17),stroke:x%2?'#E3ECEA':'#C9D7D5'})); if(x%2===0&&x>=0&&x<=26) g.appendChild(el('text',{x:X(x),y:Y(-1)+18,'text-anchor':'middle','font-size':12,fill:'#4A5F63'},x)); }
  for(let y=-1;y<=17;y++){ g.appendChild(el('line',{x1:X(-1),x2:X(27),y1:Y(y),y2:Y(y),stroke:y%2?'#E3ECEA':'#C9D7D5'})); if(y%2===0&&y>=0) g.appendChild(el('text',{x:X(-1)-8,y:Y(y)+4,'text-anchor':'end','font-size':12,fill:'#4A5F63'},y)); }
  g.appendChild(el('text',{x:X(27),y:Y(-1)+38,'text-anchor':'end','font-size':13,fill:'#4A5F63'},'x (km east of 78.30°E)'));
  g.appendChild(el('text',{x:X(-1)-8,y:Y(17)-12,'font-size':13,fill:'#4A5F63'},'y (km north of 17.30°N)'));
  g.appendChild(el('line',{x1:X(0),x2:X(0),y1:Y(-1),y2:Y(17),stroke:'#4A5F63','stroke-width':1.5}));
  g.appendChild(el('line',{x1:X(-1),x2:X(27),y1:Y(0),y2:Y(0),stroke:'#4A5F63','stroke-width':1.5}));
  svg.appendChild(g);
  MAP_PAIRS.forEach(([a,b])=>{ const A=byId[a],B=byId[b]; const d=distanceKm(A,B);
    svg.appendChild(el('line',{x1:X(A.grid[0]),y1:Y(A.grid[1]),x2:X(B.grid[0]),y2:Y(B.grid[1]),stroke:'#8E847B','stroke-width':1.5,'stroke-dasharray':'6 5'}));
    const mx=(X(A.grid[0])+X(B.grid[0]))/2, my=(Y(A.grid[1])+Y(B.grid[1]))/2;
    svg.appendChild(el('rect',{x:mx-29,y:my-11,width:58,height:20,rx:4,fill:'#F7FAF9',stroke:'#C9D7D5'}));
    svg.appendChild(el('text',{x:mx,y:my+4,'text-anchor':'middle','font-size':12,'font-weight':700,fill:'#14282D'},d.toFixed(2)+' km'));
  });
  SUBSTATIONS.forEach(s=>{ const cx=X(s.grid[0]), cy=Y(s.grid[1]);
    if(!MAP_PAIRS.some(([a,b])=>(a===s.link.from&&b===s.link.to))) { const A=nodeOf(s.link.from),B=nodeOf(s.link.to);
      svg.appendChild(el('line',{x1:X(A.grid[0]),y1:Y(A.grid[1]),x2:X(B.grid[0]),y2:Y(B.grid[1]),stroke:'#B9AFA6','stroke-width':1.2,'stroke-dasharray':'3 4'})); }
    svg.appendChild(el('rect',{x:cx-8,y:cy-8,width:16,height:16,rx:3,fill:'#fff',stroke:'#6B5F55','stroke-width':2}));
    svg.appendChild(el('text',{x:cx,y:cy+4,'text-anchor':'middle','font-size':10,'font-weight':700,fill:'#14282D'},s.id.slice(3)));
  });
  list.forEach(l=>{ const st=statusOf(l).s, cx=X(l.grid[0]), cy=Y(l.grid[1]), r=6+Math.sqrt(l.area/1e6)*2.4;
    const gr=el('a',{href:`#lake/${l.id}`});
    gr.appendChild(el('circle',{cx,cy,r,fill:'#1E6F80','fill-opacity':.85,stroke:COL[st],'stroke-width':4}));
    const right=l.grid[0]<22, above=l.id==='osman';
    const lx=above?cx-r:(right?cx+r+8:cx-r-8), ly=above?cy-r-24:cy-3, anc=above||right?'start':'end';
    gr.appendChild(el('text',{x:lx,y:ly,'text-anchor':anc,'font-size':14,'font-weight':700,fill:'#14282D'},l.name));
    gr.appendChild(el('text',{x:lx,y:ly+16,'text-anchor':anc,'font-size':12,fill:'#4A5F63'},`(${l.grid[0]}, ${l.grid[1]}) · ${f(l.ftl,1)} m`));
    svg.appendChild(gr);
  });
  const tb=$('#distTable tbody'); tb.innerHTML='';
  list.forEach(a=>{ const tr=document.createElement('tr'); tr.innerHTML=`<th>${a.name}</th>`+list.map(b=>`<td class="num">${a===b?'–':distanceKm(a,b).toFixed(2)}</td>`).join(''); tb.appendChild(tr); });
  $('#distTable thead tr').innerHTML='<th>km</th>'+list.map(b=>`<th class="num">${b.name}</th>`).join('');
}
document.querySelectorAll('[data-mapmode]').forEach(b=>b.addEventListener('click',()=>{
  document.querySelectorAll('[data-mapmode]').forEach(x=>x.setAttribute('aria-pressed', x===b));
  const real=b.dataset.mapmode==='real'; $('#realWrap').hidden=!real; $('#gridWrap').hidden=real; if(real) showAllMap();
}));

// ---------- Flood simulator ----------
const rainEl=$('#rain'), hoursEl=$('#hours'), runoffEl=$('#runoff');
function syncLabels(){$('#rainV').textContent=rainEl.value;$('#hoursV').textContent=hoursEl.value;$('#runoffV').textContent=Math.round(runoffEl.value*100)+'%';}
[rainEl,hoursEl,runoffEl].forEach(i=>i.addEventListener('input',syncLabels)); syncLabels();
document.querySelectorAll('[data-storm]').forEach(b=>b.addEventListener('click',()=>{ const [r,h,c]=b.dataset.storm.split(','); rainEl.value=r; hoursEl.value=h; runoffEl.value=c; syncLabels(); runSim(); }));
function runSim(){
  const list=lakes().map(l=>({...l, V:l.fill*l.vftl, peak:l.fill, start:l.fill, alerted:{}}));
  const byId=Object.fromEntries(list.map(l=>[l.id,l]));
  const rainMh=+rainEl.value/1000, H=+hoursEl.value, C=+runoffEl.value, useLinks=$('#links').checked;
  const dt=600, steps=Math.round(H*3600/dt); const log=[]; let toMusi=0, moved=0;
  const tstr=s=>{const m=Math.round(s*dt/60);return `${String(Math.floor(m/60)).padStart(2,'0')}:${String(m%60).padStart(2,'0')}`};
  for(let s=1;s<=steps;s++){
    for(const l of list){ const catchM2=l.catch? l.catch*1e6 : l.area*10; const Qin=C*rainMh/3600*catchM2 + rainMh/3600*l.area; l.V+=Qin*dt; l.lastQ=Qin; }
    const order=[...list].sort((a,b)=>b.ftl-a.ftl);
    for(const l of order){
      l.fill=l.V/l.vftl; l.peak=Math.max(l.peak,l.fill);
      const hrs = l.fill<1 && l.lastQ>0 ? (l.vftl-l.V)/(l.lastQ*3600) : null;
      const st=status(l,hrs);
      if(st.s!=='green' && !l.alerted[st.s]){ l.alerted[st.s]=1; log.push({t:tstr(s),cls:st.s,msg:`${l.name}: ${STATUS_WORD[st.s]} – ${st.why[0]}`}); }
      if(l.V>l.vftl){
        let surplus=l.V-l.vftl; l.V=l.vftl;
        if(useLinks){
          const cands=LINKS.filter(k=>k.from===l.id&&byId[k.to]).map(k=>({o:byId[k.to],k}))
            .filter(({o})=>o.ftl<l.ftl && o.V/o.vftl<0.8).sort((a,b)=>(b.o.vftl*0.9-b.o.V)-(a.o.vftl*0.9-a.o.V));
          for(const {o,k} of cands){ if(surplus<=0)break; const room=o.vftl*0.9-o.V; if(room<=0)continue; const take=Math.min(room,surplus); o.V+=take; surplus-=take; moved+=take;
            if(!l['sent'+o.id]){l['sent'+o.id]=1; log.push({t:tstr(s),cls:'',msg:`${subFor(k.id).id} gate opened: ${l.name} → ${o.name} (${f(l.ftl-o.ftl,1)} m downhill)`});} }
        }
        if(surplus>0){ toMusi+=surplus; if(!l.spilt){l.spilt=1; const out=LINKS.find(k=>k.from===l.id&&!LK[k.to]); log.push({t:tstr(s),cls:'red',msg:`${l.name} releasing surplus into the Musi${out?' through '+subFor(out.id).id:''}`});} }
      }
    }
  }
  list.forEach(l=>l.fill=l.V/l.vftl);
  const tb=$('#simTable tbody'); tb.innerHTML='';
  list.forEach(l=>{ const st=status(l,null); const tr=document.createElement('tr');
    tr.innerHTML=`<td>${l.name}</td><td class="num">${f(l.start*100,0)}%</td><td class="num">${f(l.fill*100,0)}%</td><td class="num">${f(l.peak*100,0)}%</td><td><span class="badge ${st.s}">${STATUS_WORD[st.s]}</span></td>`; tb.appendChild(tr);});
  $('#simHead').textContent=`${rainEl.value} mm/h for ${H} h: ${f(toMusi/1e6,2)} million m³ to the Musi${useLinks?`, ${f(moved/1e6,2)} million m³ stored in other lakes`:''}`;
  $('#simLog').innerHTML = log.length? log.map(x=>`<div><span class="t">${x.t}</span><span class="${x.cls}">${x.msg}</span></div>`).join('') : '<div>No alerts: every lake stayed below 90% and above the quality limits.</div>';
  drawProfile(list, $('#simProfile'));
}
$('#runSim').addEventListener('click',runSim);
$('#resetSim').addEventListener('click',()=>{ drawProfile(lakes(),$('#simProfile')); $('#simHead').textContent='Ready'; $('#simTable tbody').innerHTML=''; $('#simLog').innerHTML='<div class="muted">Run a storm to see alerts and gate decisions.</div>'; });

// ---------- Maths ----------
const r2 = x => Math.sqrt(x/Math.PI);
const ans = s => `<span class="ans">${s}</span>`;
const both = (A,B,fn) => [A,B].map(fn).join('<hr>');
const Lname = (L,i) => `<b class="ln l${i}">Lake ${i}: ${L.name}</b>`;
const pick = (A,B,fn) => [[A,1],[B,2]].map(([L,i])=>Lname(L,i)+'<br>'+fn(L,i)).join('<hr>');
const CALCS=[
 {ch:'Ch 7 · Coordinate geometry', t:'Distance formula', where:'Gives the length of the canal or pipe needed to join Lake 1 and Lake 2, and how far apart the substations are.', formula:'d = √[(x₂ − x₁)² + (y₂ − y₁)²]',
  run:(A,B)=>{const dx=B.grid[0]-A.grid[0],dy=B.grid[1]-A.grid[1],d=Math.hypot(dx,dy);
   return `Lake 1 (${A.grid}) , Lake 2 (${B.grid})<br>d = √[(${B.grid[0]} − ${A.grid[0]})² + (${B.grid[1]} − ${A.grid[1]})²]<br>= √(${f(dx*dx,2)} + ${f(dy*dy,2)}) = √${f(dx*dx+dy*dy,2)} = ${ans(f(d,2)+' km')}<br><span class="muted">Straight line. Real nala routes are longer.</span>`;}},
 {ch:'Ch 7 · Coordinate geometry', t:'Section formula: where to put the substation', where:'Finds the point on the link between Lake 1 and Lake 2 where a substation is built. 1 : 1 gives the midpoint, which is how SS-1 to SS-6 were placed.', formula:'P = ((m x₂ + n x₁)/(m + n), (m y₂ + n y₁)/(m + n))',
  inputs:()=>`<div class="row"><div><label>m</label><input type="number" data-k="m" value="1" min="1"></div><div><label>n</label><input type="number" data-k="n" value="1" min="1"></div></div>`,
  run:(A,B,v)=>{const m=+v.m,n=+v.n,x=(m*B.grid[0]+n*A.grid[0])/(m+n),y=(m*B.grid[1]+n*A.grid[1])/(m+n),[lat,lon]=toLatLon(x,y);
   return `m : n = ${m} : ${n}<br>x = (${m}×${B.grid[0]} + ${n}×${A.grid[0]}) ÷ ${m+n} = ${f(x,2)}<br>y = (${m}×${B.grid[1]} + ${n}×${A.grid[1]}) ÷ ${m+n} = ${f(y,2)}<br>Substation at ${ans(`(${f(x,2)}, ${f(y,2)})`)}<br>Back to the globe: latitude = 17.30 + y ÷ 111 = ${lat}°N, longitude = 78.30 + x ÷ 106 = ${lon}°E · <a href="${gmaps(lat,lon)}" target="_blank" rel="noopener">see it</a>`;}},
 {ch:'Ch 7 · Coordinate geometry', t:'Area of a triangle of three lakes', where:'Measures the land between Lake 1, Lake 2 and a third lake. If the area is 0 the three are in a straight line and one pipeline can join them.', formula:'Area = ½ |x₁(y₂ − y₃) + x₂(y₃ − y₁) + x₃(y₁ − y₂)|',
  inputs:(A,B)=>{const third=BASE.find(b=>b.id!==A.id&&b.id!==B.id); return `<label>Third lake</label><select data-k="c">${BASE.map(b=>`<option value="${b.id}" ${b.id===third.id?'selected':''}>${b.name}</option>`).join('')}</select>`;},
  run:(A,B,v)=>{const C=LK[v.c]; const [x1,y1]=A.grid,[x2,y2]=B.grid,[x3,y3]=C.grid; const s=x1*(y2-y3)+x2*(y3-y1)+x3*(y1-y2);
   return `(${x1}, ${y1}), (${x2}, ${y2}), (${x3}, ${y3})<br>= ½ |${x1}(${y2} − ${y3}) + ${x2}(${y3} − ${y1}) + ${x3}(${y1} − ${y2})|<br>= ½ |${f(s,2)}| = ${ans(f(Math.abs(s)/2,2)+' km²')}${A.id===B.id||A.id===C.id||B.id===C.id?'<br><span class="muted">Two points are the same lake, so the area is 0.</span>':''}`;}},
 {ch:'Ch 8 & 9 · Trigonometry', t:'Slope of the link: can water flow by gravity?', where:'Decides which way water can flow between Lake 1 and Lake 2 without pumps. The routing rule only sends water to a lower lake.', formula:'tan θ = height drop ÷ distance ; slope % = drop ÷ distance × 100',
  run:(A,B)=>{const dh=A.ftl-B.ftl,d=distanceKm(A,B)*1000; if(!d) return 'Choose two different lakes.'; const t=Math.abs(dh)/d, th=Math.atan(t)*180/Math.PI;
   return `Drop = ${f(A.ftl,2)} − ${f(B.ftl,2)} = ${f(dh,2)} m · distance = ${f(d,0)} m<br>tan θ = ${f(Math.abs(dh),2)} ÷ ${f(d,0)} = ${f(t,5)} → θ ≈ ${f(th,3)}°<br>Slope = ${ans(f(t*100,3)+' %')}<br>${dh>0?`Water can flow by gravity from <b>${A.name}</b> to <b>${B.name}</b>.`:dh<0?`Water can flow by gravity from <b>${B.name}</b> to <b>${A.name}</b>.`:'Same height: no gravity flow.'}`;}},
 {ch:'Ch 9 · Some applications of trigonometry', t:'Heights and distances: measuring the dam or bund', where:'At the site we stand a measured distance from the dam and read the angle with a clinometer to find its height.', formula:'h = d × tan θ   and   d = h ÷ tan θ',
  inputs:(A,B)=>`<div class="row"><div><label>Lake 1 dam/bund height (m)</label><input type="number" data-k="h1" value="${A.damH??6}" step="0.01"></div><div><label>Lake 2 dam/bund height (m)</label><input type="number" data-k="h2" value="${B.damH??6}" step="0.01"></div></div>`,
  run:(A,B,v)=>pick(A,B,(L,i)=>{const h=+v['h'+i]; return `${L.damH?'Published dam height':'Bund height (preset, measure it)'} h = ${f(h,2)} m<br>Stand at 30°: d = ${f(h,2)} ÷ 0.5774 = <b>${f(h/0.57735,1)} m</b> · 45°: d = h = <b>${f(h,1)} m</b> · 60°: d = ${f(h,2)} ÷ 1.732 = <b>${f(h/1.73205,1)} m</b>`;})},
 {ch:'Ch 6 · Triangles (similarity)', t:'Scaling the exhibition model', where:'Similar figures keep the same ratio, so the model’s heights and lengths are the real ones divided by the scale.', formula:'model = real ÷ scale',
  inputs:()=>`<div class="row"><div><label>Height scale: 1 cm = (m)</label><input type="number" data-k="s" value="4" step="0.5"></div><div><label>Length scale: 1 cm = (m)</label><input type="number" data-k="L" value="500" step="50"></div></div>`,
  run:(A,B,v)=>{const dh=Math.abs(A.ftl-B.ftl), d=distanceKm(A,B)*1000; return `Height difference = |${f(A.ftl,2)} − ${f(B.ftl,2)}| = ${f(dh,2)} m → on the model ${f(dh,2)} ÷ ${v.s} = ${ans(f(dh/v.s,2)+' cm')}<br>Distance ${f(d,0)} m → on the base ${f(d,0)} ÷ ${v.L} = ${ans(f(d/v.L,1)+' cm')}<br><span class="muted">Heights use a bigger scale than lengths (vertical exaggeration), otherwise the slope would be invisible.</span>`;}},
 {ch:'Ch 12 · Surface areas and volumes', t:'Volume: cone, cylinder or real?', where:'Tells how much water each lake holds. The real-to-cylinder ratio of Durgam and Hussain Sagar was used to estimate Saroornagar’s volume.', formula:'Cylinder = A × h ; Cone = ⅓ × A × h ; average depth = V ÷ A',
  run:(A,B)=>pick(A,B,L=>{const avg=L.vftl/L.area; if(!L.maxDepth) return `Area ${f(L.area/1e6,3)} km², volume ${f(L.vftl/1e6,2)} million m³<br>Average depth = ${f(L.vftl/1e6,2)} ÷ ${f(L.area/1e6,3)} = ${ans(f(avg,2)+' m')}<br><span class="muted">Only the dam height (${f(L.damH,2)} m) is published, not water depth, so cone and cylinder cannot be used.</span>`;
   const cyl=L.area*L.maxDepth, cone=cyl/3; return `A = ${f(L.area,0)} m², max depth h = ${L.maxDepth} m<br>Cylinder = ${f(cyl/1e6,2)} · Cone = ${f(cone/1e6,2)} million m³<br>Real ${f(L.vftl/1e6,2)} million m³ ${L.id==='saroor'?'(estimate)':''} → shape ratio ${f(L.vftl/cyl,2)} · average depth ${ans(f(avg,2)+' m')}`;})+
   `<hr>Lake 1 holds ${ans(f(A.vftl/B.vftl,2)+' times')} the water of Lake 2.`},
 {ch:'Ch 12 · Surface areas and volumes', t:'Transfer pipe (cylinder of flowing water)', where:'Sizes the pipe on the link: how long it takes to lower Lake 1 by a few cm, and how much Lake 2 rises when it receives that water.', formula:'Flow Q = πr²v ; time = volume ÷ Q ; rise in Lake 2 = volume ÷ area₂',
  inputs:()=>`<div class="row"><div><label>Pipe diameter (m)</label><input type="number" data-k="d" value="2" step="0.1"></div><div><label>Water speed (m/s)</label><input type="number" data-k="v" value="1.5" step="0.1"></div><div><label>Lower Lake 1 by (cm)</label><input type="number" data-k="c" value="1" step="0.5"></div></div>`,
  run:(A,B,v)=>{const r=v.d/2,Q=Math.PI*r*r*v.v,V=A.area*v.c/100,t=V/Q,rise=V/B.area*100;
   return `Q = 3.1416 × ${f(r,2)}² × ${v.v} = <b>${f(Q,2)} m³/s</b><br>Volume = ${f(A.area,0)} × ${f(v.c/100,3)} = ${f(V,0)} m³<br>Time = ${f(V,0)} ÷ ${f(Q,2)} = ${f(t,0)} s = ${ans(`${Math.floor(t/3600)} h ${Math.round(t%3600/60)} min`)}<br>${B.name} rises ${f(V,0)} ÷ ${f(B.area,0)} = ${ans(f(rise,2)+' cm')}`;}},
 {ch:'Ch 11 · Areas related to circles', t:'Shoreline and the 30 m buffer', where:'HMDA rules keep a 30 m no-construction buffer around lakes. Treating each lake as a circle of the same area gives the buffer area to protect.', formula:'r = √(A ÷ π) ; edge = 2πr ; ring = π[(r + w)² − r²]',
  inputs:()=>`<label>Buffer width w (m)</label><input type="number" data-k="w" value="30">`,
  run:(A,B,v)=>pick(A,B,L=>{const r=r2(L.area),w=+v.w,ring=Math.PI*((r+w)**2-r*r);
   return `r = √(${f(L.area,0)} ÷ 3.1416) = ${f(r,0)} m · edge 2πr = ${f(2*Math.PI*r/1000,2)} km<br>Ring = 3.1416 × [(${f(r,0)} + ${w})² − ${f(r,0)}²] = ${ans(f(ring,0)+' m² = '+f(ring/ACRE,1)+' acres')}`;})},
 {ch:'Ch 4 · Quadratic equations', t:'Width of a green filter strip', where:'A planted strip round the lake filters dirty run-off. If it must cover p % of the lake’s area, its width comes from a quadratic.', formula:'π(x² + 2rx) = pA → x² + 2rx − pA/π = 0 → x = −r + √(r² + pA/π)',
  inputs:()=>`<label>Strip area as % of lake</label><input type="number" data-k="p" value="5" step="0.5">`,
  run:(A,B,v)=>pick(A,B,L=>{const r=r2(L.area),c=v.p/100*L.area/Math.PI,D=4*r*r+4*c,x=-r+Math.sqrt(r*r+c);
   return `x² + ${f(2*r,0)}x − ${f(c,0)} = 0 · discriminant = ${f(D,0)} &gt; 0 (two real roots)<br>x = [−${f(2*r,0)} + √${f(D,0)}] ÷ 2 = ${ans(f(x,1)+' m')} (negative root rejected) · ${x>30?'wider than the 30 m rule':'the 30 m rule is enough'}`;})},
 {ch:'Ch 3 · Pair of linear equations', t:'Sharing storm water between the two lakes', where:'When S million m³ of surplus arrives, K-SWIFT splits it between Lake 1 (x) and Lake 2 (y) so that both end up equally full.', formula:'x + y = S ;  (V₁ + x) ÷ C₁ = (V₂ + y) ÷ C₂',
  inputs:()=>`<label>Surplus S (million m³)</label><input type="number" data-k="S" value="2" step="0.1">`,
  run:(A,B,v)=>{if(A.id===B.id) return 'Choose two different lakes.'; const C1=A.vftl/1e6,C2=B.vftl/1e6,V1=A.fill*C1,V2=B.fill*C2,S=+v.S,p=(V1+V2+S)/(C1+C2),x=p*C1-V1,y=S-x;
   return `C₁ = ${f(C1,2)}, V₁ = ${f(V1,2)} · C₂ = ${f(C2,2)}, V₂ = ${f(V2,2)} (million m³)<br>Substitute y = ${S} − x: (${f(V1,2)} + x) ÷ ${f(C1,2)} = (${f(V2+S,2)} − x) ÷ ${f(C2,2)}<br>${f(C2,2)}(${f(V1,2)} + x) = ${f(C1,2)}(${f(V2+S,2)} − x) → x = ${ans(f(x,3))}, y = ${ans(f(y,3))}<br>Both end at ${f(p*100,1)} % full.${x<0||y<0?`<br><b style="color:var(--bad)">A negative answer means that lake is already fuller, so all the water should go to the other one.</b>`:''}${p>1?'<br><b style="color:var(--bad)">Both would go over FTL: release to the Musi.</b>':''}`;}},
 {ch:'Ch 3 · Linear equations and rates', t:'Hours until Full Tank Level', where:'This is the RED alert: if a lake will reach FTL in under 6 hours the gates must act. The same inflow fills a small lake far faster.', formula:'t = free space ÷ (Q × 0.0283 × 3600) ; rise per hour = volume per hour ÷ area',
  inputs:()=>`<label>Net inflow Q (cusecs)</label><input type="number" data-k="Q" value="1000" step="50">`,
  run:(A,B,v)=>{const per=v.Q*CUSEC*3600, ra=per/A.area*100, rb=per/B.area*100;
   return `Volume per hour = ${v.Q} × 0.0283168 × 3600 = ${f(per,0)} m³<hr>`+pick(A,B,L=>{const free=L.vftl*(1-L.fill),t=free/per; return `Free space ${f(free,0)} m³ → t = ${ans(f(t,1)+' h')} ${t<6?'<b style="color:var(--bad)">RED</b>':''} · rise ${f(per/L.area*100,2)} cm/h`;})+
   `<hr>Lake ${ra>rb?1:2} rises ${ans(f(Math.max(ra,rb)/Math.min(ra,rb),1)+' times')} faster for the same inflow.`;}},
 {ch:'Ch 3 · Linear equations', t:'Water balance: inflow minus outflow', where:'Change in volume = (inflow − outflow) × time. This is how the model and the simulator update every lake each step.', formula:'Δh per hour = (I − O) × 0.0283 × 3600 ÷ area',
  inputs:(A,B)=>{const d={osman:[1900,2704],himayat:[1200,1981],hussain:[1430,2680],durgam:[40,25],saroor:[30,20]}; return `<div class="row"><div><label>Lake 1 in (cusecs)</label><input type="number" data-k="i1" value="${d[A.id][0]}"></div><div><label>Lake 1 out</label><input type="number" data-k="o1" value="${d[A.id][1]}"></div><div><label>Lake 2 in</label><input type="number" data-k="i2" value="${d[B.id][0]}"></div><div><label>Lake 2 out</label><input type="number" data-k="o2" value="${d[B.id][1]}"></div></div>`;},
  run:(A,B,v)=>pick(A,B,(L,i)=>{const I=v['i'+i],O=v['o'+i],q=(I-O)*CUSEC,V=q*3600,dh=V/L.area*100;
   return `(${I} − ${O}) × 0.0283 = ${f(q,2)} m³/s → ${f(V,0)} m³ per hour<br>Change in level = ${f(V,0)} ÷ ${f(L.area,0)} = ${ans((dh>=0?'+':'')+f(dh,2)+' cm per hour')} (${dh>0?'rising':dh<0?'falling':'steady'})`;})+'<p class="muted" style="margin:6px 0 0">Osman, Himayat (5 Oct 2025) and Hussain Sagar values are published; Durgam and Saroornagar are preset.</p>'},
 {ch:'Ch 5 · Arithmetic progressions', t:'Losing storage to silt and encroachment', where:'If the same amount is lost every year, the losses form an AP. This predicts when a lake reaches a danger level, so desilting can be planned.', formula:'d = (later − first) ÷ years ; aₙ = a + (n − 1)d',
  run:(A,B)=>pick(A,B,L=>{const s=L.silt; if(!s.years) return `First about ${s.a} ${s.unit}, now ${s.later} ${s.unit}. The start year is not published, so d cannot be found.`;
   const d=(s.later-s.a)/s.years, n1=(s.target-s.a)/d, yrsLeft=(s.target-s.later)/d;
   return `${s.what}: ${s.a} → ${s.later} ${s.unit} in ${s.years} years<br>d = (${s.later} − ${s.a}) ÷ ${s.years} = <b>${f(d,4)} ${s.unit}/year</b><br>${s.target} = ${s.a} + (n − 1)(${f(d,4)}) → n − 1 = ${f(n1,1)} → ${ans(s.y0?'around '+Math.round(s.y0+n1):'in about '+f(yrsLeft,1)+' more years')}`;})},
 {ch:'Ch 13 · Statistics', t:'Mean, median and mode of dissolved oxygen', where:'One reading can mislead; the average and the middle value tell us the usual oxygen level and whether fish can live there (4 mg/L).', formula:'mean = Σx ÷ n ; median = middle value ; mode = most frequent',
  run:(A,B)=>pick(A,B,L=>{const a=L.doSeries,s=[...a].sort((x,y)=>x-y),mo=mode(a); return `Readings: ${a.join(', ')} <span class="muted">(${L.doSrc})</span><br>Mean = ${f(a.reduce((p,c)=>p+c,0),2)} ÷ ${a.length} = ${ans(f(mean(a),2))} · sorted ${s.join(', ')} · median ${ans(f(median(a),2))} · mode ${mo.length?mo.join(', '):'none'} · range ${f(s.at(-1)-s[0],2)}<br>${mean(a)>=4?'Fish can live here.':'Below 4 mg/L: too little oxygen for fish.'}`;})},
 {ch:'Ch 13 · Statistics (weighted mean)', t:'Water Quality Index', where:'Combines pH, DO, BOD and turbidity into one number. Readings with stricter limits get more weight. Lower WQI is better; above 100 is unfit.', formula:'q = 100(V − ideal) ÷ (S − ideal) ; w = 1/S ; WQI = Σwq ÷ Σw',
  run:(A,B)=>pick(A,B,L=>{const q=wqi(qObj(L)); return q.parts.map(p=>`${p.k}: q = 100(${p.v} − ${QI[p.k].i}) ÷ (${QI[p.k].s} − ${QI[p.k].i}) = ${f(p.q,1)}, w = ${f(p.w,3)}`).join('<br>')+`<br>WQI = ${f(q.swq,2)} ÷ ${f(q.sw,3)} = ${ans(f(q.value,0)+' ('+wqiBand(q.value)+')')}`;})},
 {ch:'Ch 14 · Probability', t:'Chance that a reading is safe for fish', where:'Tells how often each lake is safe. A probability of 0 means action (aeration, treatment) is needed every day.', formula:'P(E) = favourable outcomes ÷ total outcomes ; P(not E) = 1 − P(E)',
  inputs:()=>`<label>Safe limit for DO (mg/L)</label><input type="number" data-k="lim" value="4" step="0.5">`,
  run:(A,B,v)=>{const lim=+v.lim, sa=A.doSeries.filter(x=>x>=lim).length, sb=B.doSeries.filter(x=>x>=lim).length, na=A.doSeries.length, nb=B.doSeries.length;
   return pick(A,B,L=>{const s=L.doSeries.filter(x=>x>=lim).length,n=L.doSeries.length; return `P(DO ≥ ${lim}) = ${s} ÷ ${n} = ${ans(f(s/n,2))} · P(unsafe) = 1 − ${f(s/n,2)} = ${f(1-s/n,2)}`;})+
   `<hr>Pick one reading at random from both lakes together: P(safe) = (${sa} + ${sb}) ÷ (${na} + ${nb}) = ${ans(f((sa+sb)/(na+nb),2))}`;}},
 {ch:'Percentages and units', t:'Percent full, free space and units', where:'Converts the published units (TMC, feet, acres) into metric so every lake can be compared, and shows how full each one is.', formula:'% full = water now ÷ volume at FTL × 100 ; 1 TMC = 28.317 million m³ ; 1 ft = 0.3048 m ; 1 acre = 4,046.86 m²',
  run:(A,B)=>pick(A,B,L=>`Water now ${f(L.fill*L.vftl/1e6,2)} ÷ ${f(L.vftl/1e6,2)} × 100 = ${ans(f(L.fill*100,1)+' %')} · free ${f(L.vftl*(1-L.fill)/1e6,2)} million m³<br>${f(L.vftl/1e6,2)} million m³ = ${f(L.vftl/TMC,3)} TMC · FTL ${f(L.ftl,2)} m = ${f(L.ftl/FT,0)} ft · area ${f(L.area/ACRE,0)} acres`)+
   `<hr>Can Lake 2 take all of Lake 1’s water above 80 %? Lake 1 extra = ${f(Math.max(0,A.fill-0.8)*A.vftl/1e6,2)}, Lake 2 free = ${f(B.vftl*(1-B.fill)/1e6,2)} million m³ → ${ans(Math.max(0,A.fill-0.8)*A.vftl<=B.vftl*(1-B.fill)?'Yes':'No')}`}
];
function readVals(d){const v={};d.querySelectorAll('[data-k]').forEach(x=>v[x.dataset.k]=x.type==='number'?+x.value:x.value);return v;}
function buildCalcs(){
  const A=LK[$('#m1').value], B=LK[$('#m2').value], wrap=$('#calcs'); wrap.innerHTML='';
  $('#mSame').hidden = A.id!==B.id;
  CALCS.forEach((c,i)=>{
    const d=document.createElement('article'); d.className='calc';
    d.innerHTML=`<div class="ch">${c.ch}</div><h3>${c.t}</h3><p class="where"><b>Where it is used:</b> ${c.where}</p><div class="formula">${c.formula}</div>${c.inputs?c.inputs(A,B):''}<div class="steps" aria-live="polite"></div>`;
    const out=d.querySelector('.steps');
    const go=()=>{ try{ out.innerHTML=c.run(A,B,readVals(d)); }catch(e){ out.textContent='Check the numbers.'; } };
    d.addEventListener('input',go); go(); wrap.appendChild(d);
  });
}
function fillMathSelects(){ const o=sel=>BASE.map(b=>`<option value="${b.id}" ${b.id===sel?'selected':''}>${b.name}</option>`).join('');
  $('#m1').innerHTML=o('osman'); $('#m2').innerHTML=o('hussain');
  ['#m1','#m2'].forEach(s=>$(s).addEventListener('change',buildCalcs));
  $('#mSwap').addEventListener('click',()=>{const a=$('#m1').value; $('#m1').value=$('#m2').value; $('#m2').value=a; buildCalcs();});
}

// ---------- Substations ----------
function renderSubs(){
  const box=$('#subList'); box.innerHTML='';
  SUBSTATIONS.forEach(s=>{
    const A=nodeOf(s.link.from), B=nodeOf(s.link.to), st=substationStatus(s), d=distanceKm(A,B), v=s.v;
    const drop = (A.ftl!=null&&B.ftl!=null)? A.ftl-B.ftl : null;
    const c=document.createElement('article'); c.className='sub-card '+st.s;
    c.innerHTML=`<div class="lake-top"><div><h3>${s.id}</h3><div class="sub">${s.link.id} · ${esc(s.link.kind)}</div></div><span class="badge ${st.s}">${STATUS_WORD[st.s]}</span></div>
      <p class="conn-line"><b>${A.name}</b> <span aria-hidden="true">→</span> <b>${B.name}</b></p>
      <dl class="kv small">
        <dt>Location</dt><dd>${s.lat}°N, ${s.lon}°E · <a href="${gmaps(s.lat,s.lon)}" target="_blank" rel="noopener">Google Maps</a></dd>
        <dt>Grid point</dt><dd>(${s.grid[0]}, ${s.grid[1]}) = midpoint of (${A.grid}) and (${B.grid})</dd>
        <dt>Link length</dt><dd>${d.toFixed(2)} km (straight line)${drop!=null?` · drop ${f(drop,2)} m · slope ${f(drop/(d*1000)*100,3)} %`:' · ends at the Musi'}</dd>
      </dl>
      <h4>Monitored values <span class="tag pre">preset</span></h4>
      <div class="mon">
        <div><span>Flow</span><b>${f(v.flow,0)}</b><small>cusecs</small></div>
        <div><span>Channel depth</span><b>${f(v.depth,1)}</b><small>m</small></div>
        <div><span>Gate</span><b>${v.gate}%</b><small>${v.gate?'open':'closed'}</small></div>
        <div><span>pH</span><b class="${v.pH<6.5||v.pH>8.5?'bad':''}">${f(v.pH,1)}</b><small>6.5–8.5</small></div>
        <div><span>DO</span><b class="${v.DO<4?'bad':''}">${f(v.DO,1)}</b><small>mg/L · ≥ 4</small></div>
        <div><span>BOD</span><b class="${v.BOD>3?'bad':''}">${f(v.BOD,1)}</b><small>mg/L · ≤ 3</small></div>
        <div><span>Turbidity</span><b class="${v.turb>5?'bad':''}">${f(v.turb,0)}</b><small>NTU · ≤ 5</small></div>
        <div><span>TDS</span><b>${f(v.TDS,0)}</b><small>mg/L</small></div>
        <div><span>Temp.</span><b>${f(v.temp,0)}</b><small>°C</small></div>
      </div>
      <p class="why">${st.why.join('; ')}. ${v.DO<4&&LK[s.link.to]?'Quality gate: water is treated or aerated before it is sent on.':''}</p>`;
    box.appendChild(c);
  });
}

// ---------- Pollution ----------
function renderPollution(){
  const box=$('#polLakes'); box.innerHTML='';
  BASE.forEach(l=>{ const P=POLLUTION[l.id], q=wqi(qObj(l));
    const c=document.createElement('article'); c.className='panel pol';
    c.innerHTML=`<div class="lake-top"><h3><a href="#lake/${l.id}">${l.name}</a></h3><span class="lvl lvl-${P.level.replace(' ','').toLowerCase()}">${P.level} pollution</span></div>
      <p class="small muted">DO ${f(val(l,'DO'),1)} mg/L · BOD ${f(val(l,'BOD'),1)} mg/L · WQI ${f(q.value,0)} (${wqiBand(q.value)}) · CPCB ${cpcbClass(qObj(l)).split(' ')[0]}</p>
      <h4>Where the pollution comes from</h4><ul class="plain small">${P.sources.map(x=>`<li>${esc(x)}</li>`).join('')}</ul>
      <h4>How it is being removed now</h4><ul class="plain small">${P.now.map(x=>`<li>${esc(x)}</li>`).join('')}</ul>
      <h4>What K-SWIFT adds</h4><ul class="plain small k">${P.kswift.map(x=>`<li>${esc(x)}</li>`).join('')}</ul>`;
    box.appendChild(c);
  });
  $('#methods').innerHTML = METHODS.map(m=>`<article class="method"><div class="ch">${m.stage}</div><h3>${m.t}</h3><p>${m.how}</p><p class="small"><b>Removes:</b> ${m.removes}<br><b>On our model:</b> ${m.model}</p></article>`).join('');
  const box2=$('#effCalc'); const go=()=>{ const v=readVals(box2), e=(v.i-v.o)/v.i*100, doUp=v.d2-v.d1;
    box2.querySelector('.steps').innerHTML=`Removal = (${v.i} − ${v.o}) ÷ ${v.i} × 100 = ${ans(f(e,1)+' %')}<br>${v.o<=3?'BOD ≤ 3: meets the bathing limit.':'Still above 3 mg/L: another stage is needed.'}<br>Oxygen gain from aeration = ${v.d2} − ${v.d1} = ${ans(f(doUp,1)+' mg/L')} → ${v.d2>=4?'fish can survive':'still below 4 mg/L'}`; };
  box2.addEventListener('input',go); go();
}

// ---------- Install as an app ----------
let deferredPrompt=null;
addEventListener('beforeinstallprompt',e=>{ e.preventDefault(); deferredPrompt=e; $('#installBtn').hidden=false; });
$('#installBtn').addEventListener('click',async()=>{ if(deferredPrompt){ deferredPrompt.prompt(); await deferredPrompt.userChoice; deferredPrompt=null; $('#installBtn').hidden=true; } });
addEventListener('appinstalled',()=>{ $('#installBtn').hidden=true; });
$('#howInstall').addEventListener('click',()=>{ const d=$('#installDlg'); try{d.showModal()}catch(e){d.setAttribute('open','')} });
$('#installClose').addEventListener('click',()=>$('#installDlg').close());

// ---------- start ----------
renderLakes(); renderGrid(); drawProfile(lakes(),$('#simProfile')); fillMathSelects(); buildCalcs(); renderSubs(); renderPollution(); route();
if('serviceWorker' in navigator && location.protocol==='https:'){ navigator.serviceWorker.register('sw.js').catch(()=>{}); }
