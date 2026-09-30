/* ═══════════════════════════════════════════════════════════════════════════
   BIBLIOTECA PSN · v3 — O RACK
   Quatro unidades atarraxadas: Transporte, Medição, Estante, Diário.
   A estante é a peça nova: 170 lombadas, altura = tamanho da campanha.
   ═══════════════════════════════════════════════════════════════════════════ */
const $ = id => document.getElementById(id);
const pad = n => String(n).padStart(2,"0");
const esc = s => String(s).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;");
const fantasma = s => String(s).replace(/[0-9]/g,"8");

/* VU de células pelo dado (arsenal Intergalactic): acende, marca o pico, segura 0,9s. */
function igVU(el, v){
  if(!el) return;
  var n=+el.dataset.celas||22, cs=el.children;
  if(cs.length!==n){ el.innerHTML=""; for(var k=0;k<n;k++){ var c=document.createElement("i");
    if(k>=n*.8) c.className="alto"; if(k>=n*.92) c.className="limite"; el.appendChild(c); } cs=el.children; }
  var on=Math.round(Math.max(0,Math.min(1,v))*n), pk=el._pk||0;
  for(var j=0;j<n;j++) cs[j].classList.toggle("on", j<on);
  if(on>=pk){ pk=on; el._segura=Date.now()+900; }
  el._pk=pk; clearInterval(el._t);
  var marca=function(){ for(var j=0;j<n;j++) cs[j].classList.toggle("pico", j===el._pk-1 && el._pk>0); };
  marca();
  el._t=setInterval(function(){ if(Date.now()<el._segura) return;
    if(el._pk>on){ el._pk--; marca(); } else clearInterval(el._t); },120);
}

/* ---------- biblioteca crua (lida da PSN em 21/09) ---------- */
const RAW = window.ESTANTE.biblioteca.map(x => x.t + "|" + x.h);   /* vem do Go (dados/biblioteca.json) */
const slug = t => t.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g,"")
  .replace(/[^a-z0-9]+/g,"-").replace(/^-+|-+$/g,"").slice(0,44) || "jogo";
const SPECIAL = {
  "mafia-oc": {name:"Mafia: The Old Country", est:[25,30,35], def:30, match:"mafia: the old country"},
  "gta6":     {name:"GTA VI", est:[60,75,90], def:75, unreleased:true},
};
const specialIdFor = k => { const e = Object.entries(SPECIAL).find(([id,g])=>g.match===k); return e?e[0]:null; };
const LIB = RAW.map(r=>{ const [t,h]=r.split("|"); const k=t.toLowerCase();
  return {t, h:Number(h), k, id: specialIdFor(k) || slug(t)}; });
const GAMES = {};
LIB.forEach(x=>{
  if(GAMES[x.id]) return;
  if(SPECIAL[x.id]){ GAMES[x.id] = {...SPECIAL[x.id]}; return; }
  GAMES[x.id] = x.h>0
    ? {name:x.t, est:[Math.max(1,Math.round(x.h*0.75)), x.h, Math.round(x.h*1.35)], def:x.h}
    : {name:x.t, live:true};
});
GAMES["gta6"] = GAMES["gta6"] || {...SPECIAL["gta6"]};
const LEGACY = { "arkham": {name:"Batman: Return to Arkham", est:[28,34,40], def:34}, "007": {name:"007 First Light", est:[15,20,25], def:20} };
Object.entries(LEGACY).forEach(([k,g])=>{ if(!GAMES[k]) GAMES[k] = g; });
/* capas da PlayStation Store (capas/<id>.jpg) + a plataforma e a cor de cada jogo */
const CAPAS = window.ESTANTE.capas;   /* vem do Go (dados/capas.json) */
const GTA6 = new Date(2026,10,19);
const TARGET = new Date(2026,10,12);
const DECLARED_MIN_WEEK = 180;

const dayKey = t => { const d=new Date(t); return d.getFullYear()+"-"+pad(d.getMonth()+1)+"-"+pad(d.getDate()); };
const hm = t => { const d=new Date(t); return pad(d.getHours())+":"+pad(d.getMinutes()); };
const startOfDay = d => new Date(d.getFullYear(), d.getMonth(), d.getDate());
const daysBetween = (a,b) => Math.round((startOfDay(b)-startOfDay(a))/86400000);
const fmtH = min => { const h=Math.floor(min/60), m=Math.round(min%60); return h+"h"+(m?pad(m):""); };
const WEEK = ["dom","seg","ter","qua","qui","sex","sáb"];
const fmtDay = k => { const [y,m,d]=k.split("-").map(Number); const dt=new Date(y,m-1,d); return WEEK[dt.getDay()]+", "+pad(d)+"/"+pad(m); };
/* número e unidade separados: o visor mostra o número, a unidade fica ao lado */
function leitura(min){
  if(min < 60) return [String(Math.round(min)), "min"];
  const h = min/60;
  return [ h<10 ? h.toFixed(1) : String(Math.round(h)), "h" ];
}
function porVisor(bEl, unEl, txt, un){
  if(!bEl) return;
  bEl.textContent = txt;
  const num = bEl.parentElement; if(num) num.dataset.fantasma = fantasma(txt);
  if(unEl) unEl.textContent = un;
}

/* ---------- estado ---------- */
const S = { sessions:[], active:null, config:{game:"mafia-oc", est:{}, done:{"mafia-oc":true}, hidden:{}} };
let db = null, online = false;
const LS = "bd1-sessoes-v1";
function lsLoad(){ try{ const v=JSON.parse(localStorage.getItem(LS)||"null");
  if(v){ if(v.capas) capas = v.capas; Object.assign(S,v); } }catch(e){} }
function lsSave(){ try{ localStorage.setItem(LS, JSON.stringify({...S, capas})); }catch(e){} }

async function wActive(v){
  S.active = v; render();
  if(online){ try{ v ? await db.doc("state/active").set(v) : await db.doc("state/active").delete(); }catch(e){ toast("Não salvou agora — tente de novo em instantes.", true); } }
  else lsSave();
}
async function wConfig(){
  render();
  if(online){ try{ await db.doc("state/config").set(S.config); }catch(e){} } else lsSave();
}
async function addSession(s){
  if(online){
    try{ await db.collection("sessions").add(s); }
    catch(e){ toast(e && e.code==="quota_exceeded" ? "Diário cheio — apague sessões antigas." : "Sessão não salvou. Tente de novo.", true); }
  } else { s.id = "l"+Date.now(); S.sessions.push(s); lsSave(); render(); }
}
async function delSession(id){
  if(online){ try{ await db.doc("sessions/"+id).delete(); }catch(e){ toast("Não apagou. Tente de novo.", true); } }
  else { S.sessions = S.sessions.filter(s=>s.id!==id); lsSave(); render(); }
}

/* ---------- controles ---------- */
const gameSel = $("gameSel");
function buildGameSel(){
  const cur = S.config.game || "mafia-oc";
  const hid = S.config.hidden || {};
  const ids = new Set(Object.keys(GAMES).filter(k => GAMES[k].unreleased || !hid[k]));
  ids.add(cur);
  gameSel.innerHTML = [...ids].filter(k=>GAMES[k])
    .sort((a,b)=>GAMES[a].name.localeCompare(GAMES[b].name,"pt"))
    .map(k=>`<option value="${esc(k)}">${esc(GAMES[k].name)}</option>`).join("");
  gameSel.value = cur;
}
buildGameSel();
gameSel.addEventListener("change", ()=>{ S.config.game = gameSel.value; wConfig(); renderLib(); });

$("playBtn").addEventListener("click", ()=>{
  if(S.active) return;
  wActive({ game:S.config.game, start:Date.now(), researchMs:0, researchStart:null });
  toast("Sessão começou · "+hm(Date.now()));
  openCalm();
});
$("stopBtn").addEventListener("click", async ()=>{
  const a = S.active; if(!a) return;
  const end = Date.now();
  let researchMs = a.researchMs + (a.researchStart ? end - a.researchStart : 0);
  const min = Math.round((end - a.start)/60000);
  await wActive(null);
  if(min < 1){ toast("Menos de 1 minuto — não entrou no diário."); return; }
  await addSession({ game:a.game, start:a.start, end, minutes:min, researchMin:Math.round(researchMs/60000), day:dayKey(a.start) });
  toast("Dia fechado · "+min+" min de "+GAMES[a.game].name);
});
$("researchBtn").addEventListener("click", ()=>{
  const a = S.active; if(!a) return;
  if(a.researchStart){
    wActive({...a, researchMs:a.researchMs + (Date.now()-a.researchStart), researchStart:null});
    toast("De volta ao jogo.");
  } else { wActive({...a, researchStart:Date.now()}); }
});
$("mDate").value = dayKey(Date.now());
$("mAdd").addEventListener("click", ()=>{
  const m = parseInt($("mMin").value,10), d = $("mDate").value;
  if(!d || !(m>0)){ toast("Coloque o dia e quantos minutos jogou.", true); return; }
  const [y,mo,da] = d.split("-").map(Number);
  const start = new Date(y,mo-1,da,20,0).getTime();
  addSession({ game:S.config.game, start, end:start+m*60000, minutes:m, researchMin:0, day:d, manual:true });
  $("mMin").value = ""; toast("Sessão lançada em "+fmtDay(d));
});

let toastT;
function toast(msg, bad){
  const t=$("toast"); t.textContent=msg; t.style.color = bad ? "#ff8b83" : "var(--ig-ink)";
  t.classList.add("on"); clearTimeout(toastT); toastT=setTimeout(()=>t.classList.remove("on"), 2600);
}

/* ---------- o registrador de fita (14 dias) ---------- */
function desenhaRegistrador(days, perKey, metaMin, mostraMeta){
  const cx=$("sparkGrid");
  const W=Math.max(320, Math.round(cx.clientWidth||560));
  const H=Math.max(96, Math.round(cx.clientHeight||124));
  const L=12,R=12,T=16,B=14;
  const vals = days.map(k=>perKey[k]||0);
  const maxV = Math.max(mostraMeta?metaMin*1.3:0, ...vals, 30);
  const X = i => L + i*((W-L-R)/13);
  const Y = v => H-B - (Math.max(0,v)/maxV)*(H-T-B);
  const pts = vals.map((v,i)=>[X(i),Y(v)]);
  let pauta = "";
  for(let i=1;i<=3;i++){ const y=T+(H-T-B)*i/4;
    pauta += `<line x1="${L}" y1="${y.toFixed(1)}" x2="${W-R}" y2="${y.toFixed(1)}" stroke="rgba(255,255,255,.045)" stroke-width="1"/>`; }
  for(let i=0;i<14;i++){ pauta += `<line x1="${X(i).toFixed(1)}" y1="${H-B}" x2="${X(i).toFixed(1)}" y2="${H-B+4}" stroke="rgba(255,255,255,.10)" stroke-width="1"/>`; }
  const linha = pts.map(p=>p[0].toFixed(1)+","+p[1].toFixed(1)).join(" ");
  const area = `M${X(0).toFixed(1)},${H-B} L${linha.replace(/ /g," L")} L${X(13).toFixed(1)},${H-B} Z`;
  const bolas = pts.map((p,i)=>{
    const zero = vals[i]<=0, hoje = i===13;
    return `<circle cx="${p[0].toFixed(1)}" cy="${p[1].toFixed(1)}" r="${hoje?3.4:(zero?1.4:2.2)}"
      fill="${zero?"#3a4048":(hoje?"var(--ig-amber)":"var(--ig-neon-cyan)")}"/>`;
  }).join("");
  const meta = mostraMeta ? `<line x1="${L}" y1="${Y(metaMin).toFixed(1)}" x2="${W-R}" y2="${Y(metaMin).toFixed(1)}"
      stroke="var(--ig-amber)" stroke-width="1" stroke-dasharray="4 4" opacity=".7"/>
    <text x="${L+3}" y="${Math.max(11, Y(metaMin)-6).toFixed(1)}" text-anchor="start" fill="var(--ig-amber)"
      font-family="var(--ig-label)" font-size="9" letter-spacing="1.2" opacity=".85">META ${metaMin} MIN</text>` : "";
  const agulha = `<line x1="${X(13).toFixed(1)}" y1="${T-4}" x2="${X(13).toFixed(1)}" y2="${H-B}"
      stroke="var(--ig-amber)" stroke-width="1" opacity=".45"/>`;
  /* papel em branco ensina o que fazer, em vez de mostrar uma caixa preta */
  const vazio = vals.every(v=>v<=0)
    ? `<text x="${W/2}" y="${(H/2-2).toFixed(1)}" text-anchor="middle" fill="#8f95a3"
         font-family="var(--ig-label)" font-size="10" letter-spacing="2.4">PAPEL EM BRANCO</text>
       <text x="${W/2}" y="${(H/2+14).toFixed(1)}" text-anchor="middle" fill="#6b7280"
         font-family="var(--ig-mono)" font-size="10">a agulha começa a desenhar no primeiro play</text>` : "";
  $("sparkGrid").innerHTML =
    `<svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="xMidYMid meet" aria-hidden="true">
       ${pauta}${meta}
       <path d="${area}" fill="var(--ig-neon-cyan)" opacity=".12"/>
       <polyline points="${linha}" fill="none" stroke="var(--ig-neon-cyan)" stroke-width="1.8"
         stroke-linejoin="round" stroke-linecap="round" style="filter:drop-shadow(0 0 5px var(--ig-glow-cyan))"/>
       ${agulha}${bolas}${vazio}
     </svg>`;
}

/* ---------- render ---------- */
let researchWarned = false;
function tick(){
  const a = S.active, deck = $("deck");
  deck.classList.toggle("is-live", !!a);
  $("playBtn").disabled = !!a; $("stopBtn").disabled = !a;
  $("research").hidden = !a;
  const win = $("stateWin"), bead = $("stateBead");
  win.className = a ? "ig-janela ig-janela--cyan" : "ig-janela";
  win.firstElementChild.style.cssText = a ? "" : "--fos:#8f95a3;--fos-glow:rgba(143,149,163,.22)";
  bead.className = a ? "ig-bead ig-bead--cyan is-live" : "ig-bead ig-bead--off";
  if(!a){
    $("vfdTime").textContent = "00:00:00";
    const m0 = window._metaDia || 0, h0 = Math.round(window._hojeMin || 0);
    $("vfdSub").textContent = "APERTE PLAY PARA COMEÇAR" + (m0>0 ? " · HOJE "+h0+"/"+m0+" MIN" : "");
    igVU($("deckVU"), m0>0 ? h0/m0 : 0);
    $("stateLabel").textContent = "Parado";
    researchWarned = false; if(typeof closeCalm==="function") closeCalm(); return;
  }
  const s = Math.floor((Date.now() - a.start)/1000);
  $("vfdTime").textContent = pad(Math.floor(s/3600))+":"+pad(Math.floor(s/60)%60)+":"+pad(s%60);
  $("stateLabel").textContent = "Ao vivo";
  const meta = window._metaDia || 0, hoje = Math.round(window._hojeMin || 0);
  $("vfdSub").textContent = (GAMES[a.game]?.name||"").toUpperCase()+" · DESDE "+hm(a.start)
    + (meta>0 ? " · HOJE "+hoje+"/"+meta+" MIN" : "");
  igVU($("deckVU"), meta>0 ? hoje/meta : Math.min(1, s/7200));
  const r = $("research"), cnt = $("researchCount"), btn = $("researchBtn"), note = $("researchNote");
  if(a.researchStart){
    const left = 300 - Math.floor((Date.now()-a.researchStart)/1000);
    cnt.hidden = false; btn.textContent = "Voltei pro jogo";
    if(left > 0){
      r.classList.remove("over"); cnt.textContent = pad(Math.floor(left/60))+":"+pad(left%60);
      note.textContent = "Pesquisa com hora pra acabar.";
    } else {
      r.classList.add("over"); cnt.textContent = "+"+pad(Math.floor(-left/60))+":"+pad((-left)%60);
      note.textContent = "Passou dos 5 min. Fecha a aba e volta pro jogo.";
      if(!researchWarned){ researchWarned = true; try{ navigator.vibrate && navigator.vibrate([200,100,200]); }catch(e){} toast("5 minutos de pesquisa. Volta pro jogo.", true); }
    }
  } else {
    r.classList.remove("over"); cnt.hidden = true; btn.textContent = "Parar pra pesquisar · 5 min";
    note.textContent = "Gatilho: pesquisa tem cronômetro. Acabou, volta pro jogo."; researchWarned = false;
  }
  if(typeof calmTick==="function") calmTick();
  if(S.active) $("guiaTit").textContent =
    "Jogando há " + Math.round((Date.now()-S.active.start)/60000) + " min.";
}

/* A GUIA: o aparelho diz a PRÓXIMA JOGADA, nunca o que você deve.
   Quatro estados, uma frase cada. Nada de meta nem cobrança aqui — a meta
   mora no mostrador Hoje, que é onde se mede. */
function guia(){
  const gid = S.config.game || "mafia-oc", G = GAMES[gid] || {};
  const done = !!(S.config.done||{})[gid], live = !!G.live, a = S.active;
  const t=$("guiaTit"), sb=$("guiaSub"), ac=$("guiaAcao");
  const virgem = S.sessions.length === 0 && !a;
  $("primeira").hidden = !virgem;
  ac.hidden = true;
  if(a){
    t.textContent = "Jogando há " + Math.round((Date.now()-a.start)/60000) + " min.";
    sb.textContent = "Aperte stop quando largar o controle.";
  } else if(live){
    t.textContent = "Sem campanha pra zerar.";
    sb.textContent = "Entra, joga o quanto quiser, sai.";
  } else if(done){
    t.textContent = "Zerado.";
    sb.textContent = "Escolha a próxima lombada na estante.";
    ac.hidden = false;
  } else if(virgem){
    t.textContent = "Primeira vez neste aparelho.";
    sb.textContent = "São três passos, logo abaixo.";
  } else {
    t.textContent = "Aperte play quando ligar o PS5.";
    sb.textContent = "O dia e a hora entram sozinhos — você não anota nada.";
  }
}

function render(){
  const gid = S.config.game || "mafia-oc", G = GAMES[gid] || GAMES["mafia-oc"];
  const done = !!(S.config.done||{})[gid];
  const live = !!G.live;
  gameSel.value = gid;
  document.body.dataset.game = gid;
  $("salaBead").className = "ig-bead " + (S.active ? "ig-bead--cyan is-live" : "ig-bead--off");
  $("gameTitle").textContent = G.name;
  $("heroKicker").textContent = ({"mafia-oc":"Sicília · anos 1900","gta6":"Leonida · o alvo","mad-max":"Deserto · entardecer"})[gid] || "BD1 · diário de sessões";
  const today = new Date();
  const toGta = daysBetween(today, GTA6);
  $("deadlineLine").textContent = gid==="gta6"
    ? (toGta > 0 ? `Lançamento em 19/11 — faltam ${toGta} dias.` : "Já saiu. Bora.")
    : (toGta > 0 ? `GTA VI sai em 19/11 — faltam ${toGta} dias.` : "GTA VI já saiu.");

  const badge=$("heroBadge"), bt=$("heroBadgeTxt");
  badge.hidden = false;
  const bBead = badge.querySelector(".ig-bead");
  if(G.unreleased){ badge.className="ig-janela ig-janela--warn selo"; bBead.className="ig-bead ig-bead--warn";
    bt.textContent = toGta>0 ? "lançamento 19/11" : "já saiu"; }
  else if(done){ badge.className="ig-janela selo"; bBead.className="ig-bead";
    bt.textContent = "zerado"; }
  else { badge.className="ig-janela ig-janela--cyan selo"; bBead.className="ig-bead ig-bead--cyan"+(S.active?" is-live":"");
    bt.textContent = "jogo da vez"; }

  const zb=$("zerarBtn"), zs=$("zerarSede");
  if(live || G.unreleased){ zs.hidden = true; }
  else { zs.hidden = false; zb.className = "tecla"+(done?" acesa":"");
    zb.setAttribute("aria-pressed", done);
    zb.textContent = done ? "Zerado · toque desfaz" : "Marcar como zerado"; }

  const est = live ? 0 : (S.config.est?.[gid] ?? G.def);
  const mine = S.sessions.filter(s=>s.game===gid);
  const liveMin = S.active && S.active.game===gid ? (Date.now()-S.active.start)/60000 : 0;
  const total = mine.reduce((a,s)=>a+(s.minutes||0),0) + liveMin;
  const left = (live || done) ? 0 : Math.max(0, est*60 - total);
  const pct = live ? 0 : (done ? 100 : Math.min(100, total/(est*60)*100));

  let lv = leitura(total);
  porVisor($("cPlayed"), $("cPlayedUn"), lv[0], lv[1]);
  $("cPct").textContent = live ? "—" : pct.toFixed(0)+"%";
  $("cPlayedVis").setAttribute("aria-valuenow", live?"0":pct.toFixed(0));
  igVU($("cBarVU"), live?0:pct/100);
  $("cPlayedRule").textContent = live ? "jogo de sessão · sem fim de campanha"
    : (done ? `campanha de ~${est}h · zerada` : `de ~${est}h estimadas · metade é ${fmtH(est*30)}`);

  if(live){ porVisor($("cLeft"), $("cLeftUn"), "∞", ""); }
  else if(left>0){ lv = leitura(left); porVisor($("cLeft"), $("cLeftUn"), lv[0], lv[1]); }
  else { porVisor($("cLeft"), $("cLeftUn"), "0", "h"); }
  igVU($("cLeftVU"), live?0:(est>0?left/(est*60):0));
  $("cLeftRule").textContent = live ? "joga quando bater a vontade" : (left>0 ? "pra zerar no seu jeito" : "fecha a campanha e parte pro próximo");

  const since = startOfDay(today).getTime() - 13*86400000;
  const recent = mine.filter(s=>s.start>=since).reduce((a,s)=>a+s.minutes,0) + liveMin;
  const hasData = mine.filter(s=>s.start>=since).length >= 2;
  const perDay = hasData ? recent/14 : DECLARED_MIN_WEEK/7;
  const toTarget = Math.max(1, daysBetween(today, TARGET));
  const need = left / toTarget;
  const todayMin = mine.filter(s=>s.day===dayKey(Date.now())).reduce((a,s)=>a+s.minutes,0) + liveMin;
  const metaMin = Math.max(1, Math.ceil(need));
  window._metaDia = (left>0 && !live) ? metaMin : 0;
  window._hojeMin = todayMin;

  porVisor($("cToday"), null, String(Math.round(todayMin)), "min");
  $("cTodayRule").textContent = (left>0 && !live) ? `meta do dia: ${metaMin} min` : (live ? "sem meta — sessão livre" : "nada pendente");
  igVU($("cTodayVU"), (left>0 && !live) ? todayMin/metaMin : (todayMin>0?1:0));

  const win=$("vStat"), wb=$("vStatBead"), wt=$("vStatTxt");
  const põe=(cls,bcls,txt)=>{ win.className="ig-janela"+(cls?" "+cls:""); wb.className="ig-bead"+(bcls?" "+bcls:""); wt.textContent=txt; };
  if(live){
    win.hidden = true;
    $("vHead").textContent = "Jogo de sessão — sem campanha pra zerar.";
    $("vText").innerHTML = "Sem meta e sem prazo. Entra, joga o quanto quiser, sai.";
  } else if(left<=0){
    win.hidden = false; põe("", "", "zerado");
    $("vHead").textContent = done ? "Zerado. Escolha o próximo na estante." : "Fechou. Pode abrir o próximo.";
    $("vText").innerHTML = "";
  } else {
    win.hidden = false;
    const daysLeft = perDay>0 ? Math.ceil(left/perDay) : Infinity;
    const finish = new Date(startOfDay(today).getTime() + daysLeft*86400000);
    const fstr = isFinite(daysLeft) ? pad(finish.getDate())+"/"+pad(finish.getMonth()+1) : "—";
    if(gid==="mafia-oc"){
      if(finish <= TARGET) põe("", "", "no prazo");
      else if(finish <= GTA6) põe("ig-janela--warn", "ig-bead--warn", "apertado");
      else põe("ig-janela--crit", "ig-bead--crit", "passa do GTA VI");
    } else põe("", "", "no seu ritmo");
    $("vHead").textContent = isFinite(daysLeft) ? `Nesse ritmo você zera em ${fstr}.` : "Sem ritmo ainda.";
    $("vText").innerHTML = (hasData
      ? `Nos últimos 14 dias você jogou <b>${fmtH(recent)}</b> — média de <b>${Math.round(perDay)} min/dia</b>.`
      : `Ainda sem sessões suficientes, então uso o ritmo que você declarou: <b>3h/semana</b>.`)
      + (gid==="mafia-oc" ? ` Pra fechar até <b>12/11</b> precisa de <b>${metaMin} min por dia</b> (${fmtH(need*7)}/semana) pelos próximos ${toTarget} dias.` : "");
  }
  $("estChips").innerHTML = (live || !G.est) ? "" : `<span class="ig-gravado" style="margin-right:2px">Estimativa</span>` + G.est.map(h=>
    `<button class="tecla${h===est?" acesa":""}" type="button" data-h="${h}" aria-pressed="${h===est}">${h}h</button>`).join("");

  const days=[]; for(let i=13;i>=0;i--){ days.push(dayKey(startOfDay(today).getTime()-i*86400000)); }
  const perKey={}; S.sessions.forEach(s=>{ perKey[s.day]=(perKey[s.day]||0)+s.minutes; });
  if(S.active){ const k=dayKey(S.active.start); perKey[k]=(perKey[k]||0)+liveMin; }
  desenhaRegistrador(days, perKey, metaMin, left>0 && !live);
  const tk = dayKey(Date.now());
  $("sparkDays").innerHTML = days.map(k=>`<span class="${k===tk?"hoje":""}">${k.slice(8)}</span>`).join("");
  let streak=0; for(let i=0;i<60;i++){ const k=dayKey(startOfDay(today).getTime()-i*86400000); if(perKey[k]) streak++; else if(i>0) break; }
  $("streak").textContent = "sequência: "+streak+(streak===1?" dia":" dias");

  const byDay={}; [...S.sessions].sort((a,b)=>b.start-a.start).forEach(s=>(byDay[s.day]=byDay[s.day]||[]).push(s));
  const keys = Object.keys(byDay).sort().reverse().slice(0,30);
  $("log").innerHTML = keys.length ? keys.map(k=>{
    const tot = byDay[k].reduce((a,s)=>a+s.minutes,0);
    return `<div class="dia"><div class="dia-cab"><span class="ig-gravado">${fmtDay(k)}</span><span class="ig-regua-gravada">${fmtH(tot)}</span></div>` +
      byDay[k].map(s=>`<div class="linha"><span class="hora">${s.manual?"à mão":hm(s.start)+"–"+hm(s.end)}</span>
        <span class="nome">${esc((GAMES[s.game]?.name)||s.game)}${s.researchMin?` · pesquisa ${s.researchMin} min`:""}</span>
        <span class="dur">${s.minutes} min</span>
        <button class="x" data-del="${esc(s.id)}" aria-label="Apagar sessão de ${fmtDay(k)}">×</button></div>`).join("") + `</div>`;
  }).join("") : `<div class="vazio">Nenhuma sessão ainda. Aperte play quando ligar o PS5 — o dia e o horário entram sozinhos.</div>`;

  $("saveNote").textContent = online ? "salvo na nuvem · celular e PC" : "salvo só neste aparelho";
  marcaLombadaAtual();
  guia();
  tick();
}
$("estChips").addEventListener("click", e=>{
  const b=e.target.closest("[data-h]"); if(!b) return;
  S.config.est = {...(S.config.est||{}), [S.config.game||"mafia-oc"]: Number(b.dataset.h)}; wConfig();
});
$("zerarBtn").addEventListener("click", ()=>{
  const gid = S.config.game || "mafia-oc";
  const d = {...(S.config.done||{})};
  if(d[gid]){ delete d[gid]; toast(`"${(GAMES[gid]?.name)||gid}" saiu dos zerados.`); }
  else { d[gid] = true; toast(`Zerado. "${(GAMES[gid]?.name)||gid}" fechado — bora o próximo.`); }
  S.config.done = d; wConfig(); renderLib();
});
$("guiaAcao").addEventListener("click", ()=>vaiPara("sala"));

/* ---------- a sala e o aparelho: dois cômodos, um toque entre eles ---------- */
function vaiPara(vista){
  if(document.body.dataset.vista === vista) return;
  const troca = () => { document.body.dataset.vista = vista; scrollTo(0,0);
    if(vista === "aparelho") requestAnimationFrame(poeVidro); };
  (document.startViewTransition && !reduzMov()) ? document.startViewTransition(troca) : troca();
}
$("vaiAparelho").addEventListener("click", ()=>vaiPara("aparelho"));
$("vaiSala").addEventListener("click", ()=>vaiPara("sala"));

/* ---------- A CÂMERA DO MÓVEL (Alpine) ----------
   O olho de quem olha: o ponto de fuga do 3D fica na altura do meio da tela. Ao rolar a página,
   você vê a prateleira de cima por baixo e a de baixo por cima, como numa sala de verdade.
   No computador, o olho também anda um pouco atrás do mouse. Movimento reduzido: câmera parada. */
document.addEventListener("alpine:init", () => {
  Alpine.data("camera", () => ({
    init(){
      const el = this.$el, parado = matchMedia("(prefers-reduced-motion: reduce)").matches;
      let dx = 0, quadro = 0;
      const mira = () => { quadro = 0;
        const r = el.getBoundingClientRect(); if(!r.height) return;
        const y = Math.max(-r.height*.2, Math.min(r.height*1.2, innerHeight*.46 - r.top));
        el.style.perspectiveOrigin = `calc(50% + ${dx.toFixed(0)}px) ${y.toFixed(0)}px`;
      };
      const pede = () => { if(!quadro) quadro = requestAnimationFrame(mira); };
      if(parado) return;
      addEventListener("scroll", pede, {passive:true});
      addEventListener("resize", pede);
      new ResizeObserver(pede).observe(el);
      el.addEventListener("pointermove", e => { if(e.pointerType !== "mouse") return;
        const r = el.getBoundingClientRect(); dx = ((e.clientX - r.left)/r.width - .5) * r.width * .3; pede(); });
      el.addEventListener("pointerleave", () => { dx = 0; pede(); });
      mira();
    }
  }));
});

/* ---------- A VITRINE: os preferidos de frente, atrás do vidro ---------- */
const VITRINE = window.ESTANTE.vitrine;   /* vem do Go (dados/vitrine.json) */
function renderVitrine(){
  /* a vitrine chega desenhada pelo Go. Aqui só: a caixa que saiu, a capa da casa e o selo do GTA VI */
  const falta = daysBetween(new Date(), GTA6);
  document.querySelectorAll(".vit-cx").forEach(b=>{
    const id = b.dataset.id, G = GAMES[id];
    b.classList.toggle("saiu", id===caixaId && !$("cxcena").hidden);
    const frente = b.querySelector(".cx3-frente") || b;
    if(!frente.querySelector("img,svg") && G) frente.insertAdjacentHTML("beforeend", capaSVG(b.title, G.def||0, "#E8AE5E"));
    const selo = b.querySelector(".vit-selo"); if(selo) selo.hidden = falta<=0;
  });
}
$("vitPrats").addEventListener("click", e=>{
  const b = e.target.closest(".vit-cx"); if(b) abreCaixa(b.dataset.id, b);
});
$("log").addEventListener("click", e=>{ const b=e.target.closest("[data-del]"); if(b) delSession(b.dataset.del); });

/* ---------- A ESTANTE ---------- */
let showingHidden = false, modoTirar = false;
const hiddenMap = () => S.config.hidden || {};
/* a altura é a campanha: 86px pra um jogo de serviço, 214px pras 80h do Witcher */
function faixaAltura(){
  const cs = getComputedStyle($("acervoList"));
  const mn = parseInt(cs.getPropertyValue("--ig-lomb-min")) || 86;
  const mx = parseInt(cs.getPropertyValue("--ig-lomb-max")) || 214;
  return [mn, mx];
}
const alturaLombada = (h, mn, mx) => h ? Math.round(mn + Math.min(1, Math.sqrt(h/80)) * (mx-mn)) : mn;
function tintaLombada(h){
  if(!h) return ["#5a6070","rgba(90,96,112,.28)"];
  if(h>=40) return ["var(--ig-amber)","var(--ig-glow-amber)"];
  if(h>=15) return ["var(--ig-neon-cyan)","var(--ig-glow-cyan)"];
  return ["#9aa2b2","rgba(154,162,178,.26)"];
}
function marcaLombadaAtual(){
  const gid = S.config.game;
  const done = S.config.done || {};
  document.querySelectorAll(".ig-lombada").forEach(el=>{
    el.classList.toggle("is-atual", el.dataset.id===gid);
    el.classList.toggle("is-feito", !!done[el.dataset.id]);
  });
}
function renderLib(){
  const q = $("q").value.trim().toLowerCase();
  const hid = hiddenMap();
  const vis = LIB.filter(x=>!hid[x.id]);
  const hidCount = LIB.length - vis.length;
  const somaH = vis.filter(x=>x.h>0).reduce((a,x)=>a+x.h,0);
  $("acervoSum").textContent = `${vis.length} jogos · ${somaH}h de campanha na prateleira`;
  $("hiddenNote").textContent = hidCount ? `${hidCount} fora da estante` : "";
  const sh = $("showHidden"); sh.hidden = !hidCount; sh.textContent = showingHidden ? "esconder os que saíram" : "rever os que saíram";
  const base = showingHidden ? LIB : vis;
  const lista = base.filter(x=>!q||x.k.includes(q)).sort((a,b)=>a.t.localeCompare(b.t,"pt"));
  const [mn, mx] = faixaAltura();
  $("acervoList").classList.toggle("is-removendo", modoTirar);
  $("acervoList").innerHTML = lista.length ? lista.map(x=>{
    const off = !!hid[x.id];
    const [fos,glow] = tintaLombada(x.h);
    const acao = off ? "Trazer de volta" : (modoTirar ? "Tirar da estante" : "Abrir a caixa");
    const c = CAPAS[x.id] || {}, plat = c.plat || "";
    const fora = x.id===caixaId && !$("cxcena").hidden;
    return `<button class="ig-lombada${x.h?"":" ig-lombada--sem-medida"}${off?" is-fora":""}${c.cor?" tem-cor":""}${fora?" saiu":""}" type="button" data-id="${esc(x.id)}"${plat?` data-plat="${plat}"`:""}
      style="--h:${alturaLombada(x.h, mn, mx)}px;--fos:${fos};--fos-glow:${glow}${c.cor?`;--cor:${c.cor}`:""}"
      title="${esc(x.t)} · ${x.h?x.h+"h de campanha":"jogo de serviço"} — ${acao}${capaDe(x.id)?" · capa sua":""}"
      aria-label="${esc(x.t)}, ${x.h?x.h+" horas de campanha":"jogo de serviço"}. ${acao}">
      <span class="ig-lombada__faixa">${plat}</span><span class="ig-lombada__nome">${esc(x.t)}</span><span class="ig-lombada__val">${x.h||"∞"}</span></button>`;
  }).join("") : `<div class="ig-estante__vazio">Nada com esse nome na estante.</div>`;
  marcaLombadaAtual();
  if(window._lenisRail) try{ window._lenisRail.resize(); }catch(e){}
}
$("q").addEventListener("input", renderLib);
$("showHidden").addEventListener("click", ()=>{ showingHidden = !showingHidden; renderLib(); });
$("modoTirar").addEventListener("click", ()=>{
  modoTirar = !modoTirar;
  const b=$("modoTirar");
  b.className = "tecla"+(modoTirar?" acesa-perigo":"");
  b.setAttribute("aria-pressed", modoTirar);
  b.textContent = modoTirar ? "Tirando · toque pra sair" : "Tirar da estante";
  $("estanteRegua").textContent = modoTirar
    ? "modo tirar: a lombada que você tocar sai do acervo"
    : "arraste a estante · a altura da lombada é o tamanho da campanha · toque numa pra abrir a caixa";
  renderLib();
});
$("acervoList").addEventListener("pointerdown", e=>{
  const b = e.target.closest(".ig-lombada"); const u = b && arteDe(b.dataset.id);
  if(u){ const i = new Image(); i.src = u; }
});
$("acervoList").addEventListener("click", e=>{
  if(window._arrastou) return;
  const b = e.target.closest(".ig-lombada"); if(!b) return;
  const id = b.dataset.id, nm = (LIB.find(x=>x.id===id)||{}).t || "jogo";
  if(b.classList.contains("is-fora")){
    const m={...hiddenMap()}; delete m[id]; S.config.hidden=m; wConfig(); buildGameSel(); renderLib();
    toast(`"${nm}" voltou pra estante.`);
  } else if(modoTirar){
    S.config.hidden = {...hiddenMap(), [id]:true}; wConfig(); buildGameSel(); renderLib();
    toast(`"${nm}" saiu da estante.`);
  } else {
    abreCaixa(id, b);
  }
});

/* o trilho da estante: roda de mouse suave (Lenis) e arrasto com inércia */
(function trilho(){
  const rail = $("trilho"), estante = $("acervoList");
  const reduz = matchMedia("(prefers-reduced-motion: reduce)").matches;
  if(!reduz && window.Lenis){
    try{
      window._lenisRail = new Lenis({ wrapper:rail, content:estante, orientation:"horizontal",
        gestureOrientation:"horizontal", smoothWheel:true, syncTouch:false, lerp:.1 });
      const raf = t => { window._lenisRail.raf(t); requestAnimationFrame(raf); };
      requestAnimationFrame(raf);
    }catch(e){ window._lenisRail = null; }
  }
  const L = () => window._lenisRail;
  let down=false, sx=0, sl=0, vx=0, lastX=0, lastT=0;
  rail.addEventListener("pointerdown", e=>{
    if(e.pointerType==="touch") return;
    down=true; window._arrastou=false; sx=e.clientX; sl=rail.scrollLeft; vx=0;
    lastX=e.clientX; lastT=performance.now(); rail.classList.add("arrastando");
  });
  rail.addEventListener("pointermove", e=>{
    if(!down) return;
    /* só prende o ponteiro quando vira arrasto de verdade: preso desde o toque, o clique
       ia parar no trilho e a lombada clicada com o mouse não abria a caixa */
    if(!window._arrastou && Math.abs(e.clientX-sx)>6){ window._arrastou=true;
      try{ rail.setPointerCapture(e.pointerId); }catch(err){} }
    const x = sl - (e.clientX - sx);
    L() ? L().scrollTo(x,{immediate:true}) : rail.scrollLeft = x;
    const now=performance.now(), dt=now-lastT;
    if(dt>8){ vx=(e.clientX-lastX)/dt; lastX=e.clientX; lastT=now; }
  });
  const solta = ()=>{
    if(!down) return; down=false; rail.classList.remove("arrastando");
    const alvo = rail.scrollLeft - vx*280;
    if(Math.abs(vx)>.05){ L() ? L().scrollTo(alvo,{duration:.9}) : rail.scrollTo({left:alvo,behavior:"smooth"}); }
    setTimeout(()=>{ window._arrastou=false; }, 40);
  };
  rail.addEventListener("pointerup", solta);
  rail.addEventListener("pointercancel", solta);
  rail.addEventListener("pointerleave", solta);
})();

/* ---------- modo imersivo: deck de fita ---------- */
const calm = $("calm");
let calmOpen=false, uiT=null, wake=null, deckKey="", deckOk=false, fbT=null;
addEventListener("message", e=>{ if(e.data==="deck-pronto"){ deckOk=true; $("calmFallback").hidden=true; } });
function fbTick(){
  const a=S.active; if(!a) return;
  const t=Math.max(0,Math.floor((Date.now()-a.start)/1000));
  $("calmFbTime").textContent = pad(Math.floor(t/3600))+":"+pad(Math.floor(t/60)%60)+":"+pad(t%60);
}
function showUI(ms){
  calm.classList.add("ui"); clearTimeout(uiT);
  uiT = setTimeout(()=>{ calm.classList.remove("ui"); disarmStop(); }, ms||5000);
}
async function keepAwake(){ try{ if(navigator.wakeLock) wake = await navigator.wakeLock.request("screen"); }catch(e){ wake=null; } }
function releaseAwake(){ try{ wake && wake.release(); }catch(e){} wake=null; }
document.addEventListener("visibilitychange", ()=>{ if(document.visibilityState==="visible" && calmOpen){ keepAwake(); calmTick(); } });
function openCalm(){
  const a = S.active; if(!a) return;
  calmOpen = true; calm.hidden = false; calm.classList.remove("hint-off");
  document.documentElement.style.overflow = "hidden";
  const key = a.game+"|"+a.start;
  requestAnimationFrame(()=>requestAnimationFrame(()=>{
    calm.classList.add("on");
    if(key !== deckKey){
      deckKey = key;
      $("calmDeck").src = "deck.html#t="+a.start+"&j="+encodeURIComponent(GAMES[a.game]?.name || "sessão em curso");
    }
  }));
  calmTick();
  clearInterval(fbT);
  fbT = setInterval(()=>{ if(!deckOk && calmOpen){ $("calmFallback").hidden=false; fbTick(); } }, 1000);
  setTimeout(()=>{ if(calmOpen) calm.classList.add("hint-off"); }, 7000);
  keepAwake();
}
function closeCalm(){
  if(!calmOpen) return;
  calmOpen = false; calm.classList.remove("on","ui"); releaseAwake(); clearInterval(fbT);
  $("calmFallback").hidden = true;
  document.documentElement.style.overflow = "";
  setTimeout(()=>{ if(!calmOpen){ calm.hidden = true; $("calmDeck").src = "about:blank"; deckKey = ""; } }, 1000);
}
function calmTick(){
  if(!calmOpen) return;
  const a = S.active; if(!a){ closeCalm(); return; }
  const r = $("calmResearch");
  if(a.researchStart){
    const left = 300 - Math.floor((Date.now()-a.researchStart)/1000);
    r.hidden = false; r.classList.toggle("over", left <= 0);
    r.textContent = left > 0 ? `pesquisando · volta em ${Math.ceil(left/60)} min` : `os 5 minutos passaram · volta pro jogo`;
    $("calmResearchBtn").textContent = "Voltei pro jogo";
  } else { r.hidden = true; $("calmResearchBtn").textContent = "Pesquisar · 5 min"; }
}
let stopArmT=null;
function disarmStop(){ const b=$("calmStop"); b.classList.remove("arm"); b.textContent="Encerrar sessão"; clearTimeout(stopArmT); }
calm.addEventListener("click", e=>{ if(!e.target.closest(".calm-ui")) { calm.classList.contains("ui") ? (calm.classList.remove("ui"), disarmStop()) : showUI(); } });
$("calmExit").addEventListener("click", ()=>closeCalm());
$("calmResearchBtn").addEventListener("click", ()=>{ $("researchBtn").click(); showUI(); setTimeout(calmTick, 50); });
$("calmStop").addEventListener("click", ()=>{
  const b = $("calmStop");
  if(!b.classList.contains("arm")){ b.classList.add("arm"); b.textContent = "Toque de novo pra encerrar"; showUI(6000); clearTimeout(stopArmT); stopArmT=setTimeout(disarmStop, 4000); return; }
  disarmStop(); closeCalm(); $("stopBtn").click();
});
$("calmBtn").addEventListener("click", ()=>openCalm());
document.addEventListener("keydown", e=>{ if(e.key==="Escape" && calmOpen) closeCalm(); });


/* ══════════════════════════════════════════════════════════════════════════
   A LOCADORA · capa original por jogo, a caixa que abre, o disco que toca
   A arte de capa dos jogos é obra protegida e não entra aqui. Cada caixa
   ganha uma capa NOSSA, gerada do próprio título — composição abstrata do
   cassete-futurismo, determinística: o mesmo jogo tem sempre a mesma capa.
   ══════════════════════════════════════════════════════════════════════════ */

/* ---------- semente: o mesmo título dá sempre os mesmos números ---------- */
function semente(t){ let h = 2166136261;
  for(let i=0;i<t.length;i++){ h ^= t.charCodeAt(i); h = Math.imul(h, 16777619); }
  return () => { h ^= h<<13; h ^= h>>>17; h ^= h<<5; return ((h>>>0)%10000)/10000; };
}

/* ---------- a capa: seis composições originais, nossa paleta ---------- */
function capaSVG(titulo, horas, tinta){
  const r = semente(titulo);
  const comp = Math.floor(r()*6);
  const a = tinta, b = "#E8AE5E", c = "#5EEAD4";
  const id = "c"+Math.abs(titulo.length*31 + comp)+Math.floor(r()*9999);
  const cat = String(1 + Math.floor(semente(titulo+"·cat")()*998)).padStart(3,"0");
  const grão = `<filter id="g${id}"><feTurbulence type="fractalNoise" baseFrequency=".9" numOctaves="2" stitchTiles="stitch"/><feColorMatrix values="0 0 0 0 .07 0 0 0 0 .07 0 0 0 0 .09 0 0 0 .34 0"/></filter>`;

  /* cada uma responde à mesma luz: única, alta à esquerda */
  const cenas = [
    /* 0 · HORIZONTE — um sol baixo sobre a grade que foge */
    `<rect width="300" height="372" fill="#07080c"/>
     <circle cx="150" cy="196" r="74" fill="url(#s${id})" opacity=".9"/>
     <g stroke="${a}" stroke-width=".8" opacity=".5" fill="none">
       <path d="M0 196H300M-30 216H330M14 232H286M52 245H248M84 255H216M110 263H190M128 269H172"/>
       <path d="M150 196 100 372M150 196 200 372M150 196 10 372M150 196 290 372M150 196-90 372M150 196 390 372"/>
     </g>
     <line x1="0" y1="196" x2="300" y2="196" stroke="${b}" stroke-width="1.2" opacity=".75"/>`,
    /* 1 · MONÓLITO — uma lâmina em pé, luz na aresta esquerda */
    `<rect width="300" height="372" fill="#080910"/>
     <rect x="96" y="58" width="108" height="252" fill="#0d0f16"/>
     <rect x="96" y="58" width="4" height="252" fill="${a}" opacity=".85"/>
     <rect x="96" y="58" width="108" height="252" fill="none" stroke="${a}" stroke-width=".7" opacity=".3"/>
     <g stroke="${b}" stroke-width=".7" opacity=".4">
       <path d="M40 310H260M64 322H236M88 334H212"/></g>
     <circle cx="150" cy="118" r="13" fill="none" stroke="${c}" stroke-width="1.1" opacity=".8"/>`,
    /* 2 · ARCO — anéis concêntricos cortados pelo horizonte */
    `<rect width="300" height="372" fill="#06070b"/>
     <g fill="none" stroke="${a}" opacity=".55">
       <circle cx="150" cy="200" r="34" stroke-width="1.3"/><circle cx="150" cy="200" r="60" stroke-width="1"/>
       <circle cx="150" cy="200" r="88" stroke-width=".8"/><circle cx="150" cy="200" r="118" stroke-width=".6"/></g>
     <circle cx="150" cy="200" r="16" fill="${b}" opacity=".9"/>
     <rect x="0" y="200" width="300" height="172" fill="#06070b"/>
     <line x1="0" y1="200" x2="300" y2="200" stroke="${b}" stroke-width="1" opacity=".7"/>
     <g stroke="${c}" stroke-width=".7" opacity=".35"><path d="M0 232H300M0 258H300M0 290H300"/></g>`,
    /* 3 · PRISMA — um feixe entrando, o espectro saindo */
    `<rect width="300" height="372" fill="#07080d"/>
     <path d="M150 96 226 246H74Z" fill="none" stroke="${a}" stroke-width="1.2" opacity=".8"/>
     <line x1="0" y1="186" x2="122" y2="186" stroke="#e9edf4" stroke-width="1.4" opacity=".85"/>
     <g stroke-width="1.1" opacity=".85">
       <line x1="178" y1="186" x2="300" y2="150" stroke="${b}"/>
       <line x1="178" y1="190" x2="300" y2="178" stroke="${c}"/>
       <line x1="178" y1="194" x2="300" y2="206" stroke="${a}"/>
       <line x1="178" y1="198" x2="300" y2="234" stroke="${b}" opacity=".5"/></g>
     <circle cx="150" cy="300" r="3" fill="${c}"/>`,
    /* 4 · ÓRBITA — elipses cruzadas em torno de um ponto aceso */
    `<rect width="300" height="372" fill="#06070c"/>
     <g fill="none" stroke="${a}" opacity=".5">
       <ellipse cx="150" cy="186" rx="118" ry="44" stroke-width="1"/>
       <ellipse cx="150" cy="186" rx="118" ry="44" stroke-width=".8" transform="rotate(58 150 186)"/>
       <ellipse cx="150" cy="186" rx="118" ry="44" stroke-width=".8" transform="rotate(-58 150 186)"/></g>
     <circle cx="150" cy="186" r="19" fill="url(#s${id})"/>
     <circle cx="268" cy="186" r="4" fill="${c}"/><circle cx="96" cy="112" r="3" fill="${b}"/>
     <g stroke="${b}" stroke-width=".7" opacity=".3"><path d="M30 320H270M60 334H240"/></g>`,
    /* 5 · FALHA — a chapa rachada, luz saindo de dentro */
    `<rect width="300" height="372" fill="#080a10"/>
     <g stroke="${a}" stroke-width="1.1" opacity=".75" fill="none">
       <path d="M62 34 128 160 96 208 158 338"/>
       <path d="M128 160 196 132"/><path d="M96 208 44 244"/><path d="M158 338 214 272"/></g>
     <g stroke="${b}" stroke-width="2.4" opacity=".55" fill="none" filter="url(#b${id})">
       <path d="M62 34 128 160 96 208 158 338"/></g>
     <circle cx="128" cy="160" r="4.5" fill="${c}"/>
     <g stroke="${c}" stroke-width=".6" opacity=".3"><path d="M0 300H300M0 316H300"/></g>`,
  ];

  return `<svg viewBox="0 0 300 372" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
    <defs>
      <radialGradient id="s${id}" cx=".5" cy=".5" r=".5">
        <stop offset="0" stop-color="#fff3d8"/><stop offset=".55" stop-color="${b}" stop-opacity=".92"/>
        <stop offset="1" stop-color="${b}" stop-opacity="0"/></radialGradient>
      <filter id="b${id}"><feGaussianBlur stdDeviation="5"/></filter>
      ${grão}
    </defs>
    ${cenas[comp]}
    <rect width="300" height="372" fill="url(#lz${id})" opacity=".55"/>
    <defs><linearGradient id="lz${id}" x1="0" y1="0" x2=".7" y2="1">
      <stop offset="0" stop-color="#fff" stop-opacity=".08"/>
      <stop offset=".5" stop-color="#000" stop-opacity="0"/>
      <stop offset="1" stop-color="#000" stop-opacity=".5"/></linearGradient></defs>
    <rect width="300" height="372" filter="url(#g${id})"/>
    <g opacity=".92">
      <text x="30" y="44" fill="${a}" font-family="var(--ig-label)" font-size="9"
            letter-spacing="3.4">BD1 · ${cat}</text>
      <text x="30" y="330" fill="#e9edf4" font-family="var(--ig-display)" font-size="21"
            font-weight="300">${quebra(titulo)}</text>
      <text x="30" y="352" fill="${a}" font-family="var(--ig-label)" font-size="8.5"
            letter-spacing="2.6">${horas ? horas+"H DE CAMPANHA" : "SEM FIM · JOGO DE SERVIÇO"}</text>
    </g>
  </svg>`;
}
/* o título na capa: no máximo duas linhas, o resto vira reticência */
function quebra(t){
  const e = s => String(s).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;");
  const p = t.split(" "); const l1=[], l2=[];
  for(const w of p){ ((l1.join(" ").length + w.length) <= 17 && !l2.length ? l1 : l2).push(w); }
  const a = l1.join(" ") || t.slice(0,17);
  let b = l2.join(" ");
  if(b.length > 19) b = b.slice(0,18)+"…";
  return b ? `<tspan x="30" dy="-22">${e(a)}</tspan><tspan x="30" dy="22">${e(b)}</tspan>`
           : `<tspan x="30">${e(a)}</tspan>`;
}

/* ---------- a capa que VOCÊ põe ----------
   A arte de capa dos jogos é de quem fez o jogo, então a página não desenha
   nenhuma. O que ela faz é guardar a SUA: arraste uma imagem pra capa e ela
   fica — salva no artefato, aparece no celular e no PC. Sem imagem sua,
   entra a capa gerada do título. */
let assetsNs = undefined, capas = {};
async function pegaAssets(){
  if(assetsNs !== undefined) return assetsNs;
  try{ assetsNs = await window.claude?.use?.("assets") ?? null; }catch(e){ assetsNs = null; }
  return assetsNs;
}
function capaDe(id){ const b = capas[id]; return b ? "/_blob/"+b : null; }
function poeCapaSalva(id){ const it = LIB.find(x=>x.id===id); if(it) desenhaCapa(it); }
async function guardaCapa(id, file){
  const A = await pegaAssets();
  if(!A){ toast("Não dá pra guardar capa nesta tela.", true); return; }
  if(!/^image\//.test(file.type)){ toast("Só imagem.", true); return; }
  if(file.size > 20*1024*1024){ toast("Imagem grande demais (máx. 20 MB).", true); return; }
  toast("Guardando a capa…");
  try{
    const { id: blob } = await A.upload(file);
    capas = { ...capas, [id]: blob };
    if(online){ try{ await db.doc("state/capas").set(capas); }catch(e){} } else lsSave();
    if(caixaId === id) poeCapaSalva(id);
    renderLib();
    toast("Capa guardada.");
  }catch(e){ toast("A capa não subiu. Tente de novo.", true); }
}
async function tiraCapa(id){
  const b = capas[id]; if(!b) return;
  const m = { ...capas }; delete m[id]; capas = m;
  if(online){ try{ await db.doc("state/capas").set(capas); }catch(e){} } else lsSave();
  const A = await pegaAssets(); if(A) try{ await A.delete(b); }catch(e){}
  if(caixaId === id){ const it = LIB.find(x=>x.id===id); if(it) desenhaCapa(it); }
  renderLib(); toast(CAPAS[id] ? "Voltou pra capa da loja." : "Voltou pra capa da casa.");
}

/* ---------- a caixa ---------- */
let caixaId = null, caixaCtl = null, sampleFn = undefined, lombAtual = null;
const reduzMov = () => matchMedia("(prefers-reduced-motion: reduce)").matches;
const espera = ms => new Promise(r=>setTimeout(r, ms));
const EJ = { aberta:false, ry:0, rx:0, w:260, esc:1, voando:false, fechando:false, tocando:false };

async function pegaSample(){
  if(sampleFn !== undefined) return sampleFn;
  try{ sampleFn = await window.claude?.use?.("sample") ?? null; }catch(e){ sampleFn = null; }
  return sampleFn;
}

/* a arte da caixa: a capa que você pôs > a capa da loja > a capa que a casa desenha */
function arteDe(id){
  const c = CAPAS[id]; if(capaDe(id)) return capaDe(id); if(!c) return null;
  return c.src ? c.src+"?w=720" : "capas/"+id+".jpg";      /* fora do Claude a capa vem direto da loja */
}

/* o tamanho do estojo sai do palco: cabe fechado e cabe aberto (duas vezes mais largo) */
function medeEstojo(){
  const p = $("cxpalco"); if(!p) return;
  const pw = p.clientWidth, ph = p.clientHeight;
  EJ.w = Math.round(Math.max(150, Math.min(pw*0.66, ph*0.8/1.264, 340)));
  EJ.esc = Math.min(1, (pw*0.96)/(EJ.w*1.97));
  p.style.setProperty("--w", EJ.w+"px");
  p.style.setProperty("--hc", Math.round(EJ.w*1.264)+"px");
  poseEstojo();
}
function poseEstojo(){
  const e = $("estojo"), a = EJ.aberta, esc = a ? EJ.esc : 1;
  e.style.setProperty("--ox", (a ? EJ.w*0.483*esc : 0).toFixed(1)+"px");
  e.style.setProperty("--esc", esc.toFixed(3));
  e.style.setProperty("--rx", (a ? 9 : EJ.rx).toFixed(1)+"deg");
  e.style.setProperty("--ry", EJ.ry.toFixed(1)+"deg");
  e.style.setProperty("--abre", a ? "-163deg" : "0deg");
  e.classList.toggle("aberta", a);
  $("cxpalco").classList.toggle("aberta", a);
  const verso = !a && ((Math.round(EJ.ry/180)%2)+2)%2 === 1;
  $("cxdica").textContent = a ? "Toque no disco pra jogar"
    : (verso ? "Este é o verso · arraste de novo pra voltar à capa" : "Toque na caixa pra abrir · arraste pro lado pra virar");
  $("cxprim").textContent = a ? "Tocar o disco" : "Abrir a caixa";
  $("cxsec").textContent = a ? "Fechar a caixa" : (verso ? "Ver a capa" : "Ver o verso");
}
function abreTampa(){ if(EJ.aberta) return; EJ.ry = Math.round(EJ.ry/360)*360; EJ.rx = 0; EJ.aberta = true; poseEstojo(); }
function fechaTampa(){ if(!EJ.aberta) return; EJ.aberta = false; poseEstojo(); }
function viraCaixa(){ if(EJ.aberta){ fechaTampa(); return; } EJ.ry += 180; EJ.rx = 0; poseEstojo(); }

/* a mão na caixa: arrastar pro lado gira, soltar assenta na capa ou no verso, tocar abre */
(function maoNaCaixa(){
  const p = $("cxpalco"), e = $("estojo");
  let down=false, moved=false, sx=0, sy=0, bry=0, brx=0, lastX=0, lastT=0, vx=0, tipo="mouse";
  p.addEventListener("pointerdown", ev=>{
    if(EJ.voando || EJ.tocando || ev.button>0) return;
    if(EJ.aberta && ev.target.closest(".disco")) return;
    down=true; moved=false; sx=lastX=ev.clientX; sy=ev.clientY; bry=EJ.ry; brx=EJ.rx; vx=0;
    lastT=performance.now(); tipo=ev.pointerType;
  });
  p.addEventListener("pointermove", ev=>{
    if(!down) return;
    const dx=ev.clientX-sx, dy=ev.clientY-sy;
    if(!moved){
      if(Math.hypot(dx,dy) < 7) return;
      if(tipo!=="mouse" && Math.abs(dy) > Math.abs(dx)){ down=false; return; }  /* é o dedo rolando a página */
      moved=true; e.classList.add("na-mao");
      try{ p.setPointerCapture(ev.pointerId); }catch(err){}
      EJ.aberta = false;
    }
    const now=performance.now(); if(now-lastT>12){ vx=(ev.clientX-lastX)/(now-lastT); lastX=ev.clientX; lastT=now; }
    EJ.ry = bry + dx*0.55;
    EJ.rx = tipo==="mouse" ? Math.max(-26, Math.min(26, brx - dy*0.3)) : 0;
    poseEstojo();
  });
  const solta = valeToque=>{
    if(!down) return; down=false; e.classList.remove("na-mao");
    if(!moved){ if(valeToque) (EJ.aberta ? fechaTampa() : abreTampa()); return; }
    EJ.ry = Math.round((EJ.ry + vx*160)/180)*180; EJ.rx = 0; poseEstojo();   /* o embalo, e assenta */
  };
  p.addEventListener("pointerup", ()=>solta(true));
  p.addEventListener("pointercancel", ()=>solta(false));
})();

/* o voo: da lombada na prateleira até a sua mão, virando da lombada pra capa */
const tf = (dx,dy,sx,sy,z,ry) =>
  `translate(${dx.toFixed(1)}px,${dy.toFixed(1)}px) scale(${sx.toFixed(3)},${sy.toFixed(3)}) translateZ(${z}px) rotateY(${ry}deg)`;
function poseLombada(lomb){
  /* na vitrine, o voo sai da frente da caixa 3D (a capa), não do volume inteiro */
  const alvo = lomb.classList.contains("vit-cx") ? (lomb.querySelector(".cx3-frente") || lomb) : lomb;
  const r = alvo.getBoundingClientRect(), p = $("cxpalco").getBoundingClientRect();
  const s = Math.max(.18, r.height/(EJ.w*1.264)), frente = lomb.classList.contains("vit-cx");
  return { dx: r.left + r.width/2 - (p.left + p.width/2), dy: r.top + r.height/2 - (p.top + p.height*0.47),
           s, frente, sx: frente ? Math.max(.18, r.width/EJ.w) : Math.min(3, Math.max(s, r.width/(EJ.w*0.104))),
           naTela: r.bottom>0 && r.top<innerHeight && r.right>0 && r.left<innerWidth };
}
function quadrosVoo(L){
  if(L.frente) return [ tf(L.dx, L.dy, L.sx, L.s, 0, 0),
                        tf(L.dx*.8, L.dy*.8-24, L.s*1.3, L.s*1.3, 90, -14),
                        tf(0, 0, 1, 1, 0, 0) ];
  return [ tf(L.dx, L.dy, L.sx, L.s, 0, 90),
           tf(L.dx*.86, L.dy*.86-16, L.s*1.25, L.s*1.25, 70, 86),
           tf(0, 0, 1, 1, 0, 0) ];
}

function abreCaixa(id, lomb){
  const G = GAMES[id]; if(!G || EJ.voando || EJ.fechando) return;
  caixaId = id; lombAtual = lomb || null;
  const item = LIB.find(x=>x.id===id) || {id, t:G.name, h:G.def||0};
  const [fos] = tintaLombada(item.h);
  item._tinta = fos.startsWith("var(") ? getComputedStyle(document.body)
      .getPropertyValue(fos.slice(4,-1)).trim() || "#E8AE5E" : fos;

  /* os números que são DELE: o que já jogou deste jogo */
  const mine = S.sessions.filter(s=>s.game===id);
  const total = mine.reduce((a,s)=>a+(s.minutes||0),0);
  const done = !!(S.config.done||{})[id];
  const est = G.live ? 0 : (S.config.est?.[id] ?? G.def ?? 0);
  const pct = (G.live || !est) ? null : Math.min(100, total/(est*60)*100);
  const ult = mine.length ? [...mine].sort((a,b)=>b.start-a.start)[0] : null;
  const linha = (r,v,q)=>`<div><dt>${r}</dt><dd class="${q?"q":""}">${v}</dd></div>`;
  $("cxtitulo").textContent = item.t;
  $("cxnums").innerHTML =
      linha("Campanha", G.live ? "sem fim" : "~"+est+"h")
    + linha("Você jogou", total>0 ? fmtH(total) : "nada ainda", total>0)
    + (pct!==null ? linha("Progresso", done ? "zerado" : pct.toFixed(0)+"%", done) : "")
    + linha("Sessões", mine.length || "—")
    + (ult ? linha("Última vez", fmtDay(ult.day)) : "");
  const faltaLanc = G.unreleased ? daysBetween(new Date(), GTA6) : 0;
  $("cxreg").textContent = faltaLanc > 0 ? `Chega em 19/11 — faltam ${faltaLanc} dias. O disco toca a partir desse dia.`
    : id === S.config.game
    ? "É o jogo da vez no aparelho."
    : (G.live ? "Jogo de serviço — entra e sai quando quiser."
              : (done ? "Você já zerou este." : "Abra a caixa e toque no disco pra começar a contar."));

  /* o verso e o folheto, com o que já se sabe antes do Claude escrever */
  const base = G.live ? "Jogo de serviço, sem campanha pra fechar. Entra, joga o quanto quiser, sai."
    : `Campanha de cerca de ${est} horas.` + (total>0 ? ` Você já jogou ${fmtH(total)}.` : " Você ainda não começou.");
  $("trTit").textContent = item.t; $("trTxt").textContent = base;
  $("trNums").innerHTML = linha("Campanha", G.live ? "∞" : "~"+est+"h") + linha("Jogado", total>0 ? fmtH(total) : "—")
    + linha("Progresso", pct===null ? "—" : (done ? "zerado" : pct.toFixed(0)+"%")) + linha("Sessões", mine.length || "—");
  $("trCat").textContent = "BD1 · " + String(1 + Math.floor(semente(item.t+"·cat")()*998)).padStart(3,"0");
  $("flTit").textContent = item.t; $("flTxt").textContent = base;
  const c = CAPAS[id] || {};
  $("cxpalco").style.setProperty("--cor", c.cor || item._tinta);
  const lb = $("ejLombo"); lb.dataset.plat = c.plat || "";
  lb.querySelector("b").textContent = c.plat || ""; lb.querySelector("span").textContent = item.t;
  desenhaCapa(item);
  pegaAssets().then(A=>{ $("cxcapaAcao").hidden = !A; $("cxcapaNota").hidden = !A; });

  const cena = $("cxcena"), v = $("cxvoo");
  $("cxtxt").innerHTML = ""; $("cxnota").innerHTML = "";
  $("discoBtn").classList.remove("sobe","gira");
  cena.hidden = false; cena.scrollTop = 0;
  document.documentElement.style.overflow = "hidden";
  EJ.aberta = false; EJ.ry = 0; EJ.rx = 0; medeEstojo();
  v.getAnimations().forEach(a=>a.cancel());
  const L = lomb ? poseLombada(lomb) : null;
  if(L && L.naTela && !reduzMov()){
    lomb.classList.add("saiu");
    EJ.voando = true;
    const q = quadrosVoo(L);
    const an = v.animate([{transform:q[0]}, {transform:q[1], offset:.26}, {transform:q[2]}],
      { duration:1050, easing:"cubic-bezier(.3,.7,.2,1)" });
    an.finished.catch(()=>{}).then(()=>{ EJ.voando = false; });
  } else {
    v.animate([{transform:"scale(.94)"},{transform:"scale(1)"}], { duration:320, easing:"ease-out" });
  }
  requestAnimationFrame(()=>cena.classList.add("on"));
  $("cxfechar").focus({preventScroll:true});
  dossie(item, G, est);
}

async function fechaCaixa(opts={}){
  const cena = $("cxcena"); if(cena.hidden || EJ.fechando) return;
  EJ.fechando = true;
  caixaCtl?.abort(); caixaCtl = null;
  const lomb = lombAtual?.isConnected ? lombAtual
    : (document.querySelector(`.ig-lombada[data-id="${CSS.escape(caixaId||"")}"]`) || lombAtual);
  const v = $("cxvoo");
  cena.classList.remove("on");
  if(!opts.seco && lomb && !reduzMov()){
    if(EJ.aberta){ EJ.aberta = false; poseEstojo(); await espera(380); }
    EJ.ry = Math.round(EJ.ry/360)*360; EJ.rx = 0; poseEstojo();
    cena.scrollTop = 0;
    const L = poseLombada(lomb);
    if(L.naTela){
      const q = quadrosVoo(L);
      const an = v.animate([{transform:q[2]}, {transform:q[1], offset:.72}, {transform:q[0]}],
        { duration:820, easing:"cubic-bezier(.5,0,.3,1)", fill:"forwards" });
      await an.finished.catch(()=>{});
    } else await espera(320);
  } else if(!opts.seco) await espera(320);
  document.querySelectorAll(".saiu").forEach(x=>x.classList.remove("saiu"));
  cena.hidden = true;
  v.getAnimations().forEach(a=>a.cancel());
  $("discoBtn").classList.remove("sobe","gira");
  EJ.aberta = false; EJ.ry = 0; EJ.rx = 0; poseEstojo();
  document.documentElement.style.overflow = "";
  caixaId = null; lombAtual = null; EJ.fechando = false;
  if(!opts.seco) lomb?.focus({preventScroll:true});
}

function desenhaCapa(item){
  const c = CAPAS[item.id] || {}, arte = arteDe(item.id), plat = c.plat || "";
  $("cxarte").innerHTML = `<div class="banda" data-plat="${plat}">${plat}</div><div class="arte">${
    arte ? `<img src="${esc(arte)}" alt="" decoding="async" draggable="false">`
         : capaSVG(item.t, item.h, item._tinta || "#E8AE5E")}</div>`;
  const u = arte ? `url("${arte}")` : "none";
  $("cxpalco").style.setProperty("--arte", u);
  $("cxfundo").style.setProperty("--arte", u);
  const tem = !!capaDe(item.id);
  $("cxcapaAcao").textContent = tem ? "Trocar a minha capa" : "Pôr a minha capa";
  $("cxcapaTira").hidden = !tem;
  $("cxcapaTira").textContent = CAPAS[item.id] ? "Voltar pra capa da loja" : "Tirar a minha capa";
}

/* ---------- o dossiê: o Claude escreve sobre ESTE jogo ---------- */
async function dossie(item, G, est){
  const alvo = $("cxtxt"), nota = $("cxnota");
  const sample = await pegaSample();
  if(!sample){
    nota.innerHTML = `Os números acima são seus. A parte escrita precisa do Claude, que não está disponível nesta tela.`;
    return;
  }
  alvo.innerHTML = `<div class="dcarreg"><span class="ig-bead ig-bead--cyan is-live"></span><span>Abrindo o encarte…</span></div>`;
  caixaCtl?.abort();
  const ctl = new AbortController(); caixaCtl = ctl;

  const pergunta =
`Escreva o encarte de "${item.t}"${item.h ? ` (campanha de cerca de ${item.h} horas)` : " (jogo de serviço, sem campanha)"}, para um jogador brasileiro que joga devagar e contemplativo: ele para no meio pra ler e pesquisar, prefere dificuldade baixa, gosta de jogo bonito, e evita combate pesado.

Responda só com um objeto JSON, exatamente com estas quatro chaves:
{"oque":"...","curiosidade":"...","achar":"...","jeito":"..."}

- "oque": o que é o jogo — 2 frases curtas. Direto, sem "prepare-se para".
- "curiosidade": UM fato verdadeiro e específico sobre a criação do jogo (quem fez, uma decisão de design, algo do desenvolvimento). 1-2 frases. Se você não tiver certeza de um fato, escreva sobre algo do jogo em si em vez de inventar.
- "achar": o que ELE vai encontrar aí, do jeito dele de jogar. 2 frases.
- "jeito": uma dica concreta pra jogar mais leve — acessibilidade, dificuldade, um modo, o que ignorar. 1-2 frases.

Português do Brasil. Frases curtas, uma ideia por frase. Sem exclamação, sem hype, sem "você vai adorar". Se não conhecer o jogo, diga isso no campo "oque" e deixe os outros curtos.`;

  const bloco = (t,c)=>`<section><h4>${t}</h4><p>${esc(c||"—")}</p></section>`;
  try{
    const d = await sample.json(pergunta, {
      signal: ctl.signal, modelTier: "default",
      cache: { gcTime: 86400000 },          /* o encarte não muda: guarda por 24h */
    });
    if(ctl.signal.aborted) return;
    alvo.innerHTML = bloco("O que é", d.oque) + bloco("Curiosidade", d.curiosidade)
                   + bloco("O que você vai achar aí", d.achar) + bloco("Pra jogar leve", d.jeito);
    if(d.oque) $("trTxt").textContent = d.oque;
    if(d.jeito) $("flTxt").textContent = d.jeito;
    nota.innerHTML = `Encarte escrito pelo Claude agora. <button type="button" id="cxdenovo">escrever de novo</button>`;
    $("cxdenovo")?.addEventListener("click", ()=>{
      alvo.innerHTML = `<div class="dcarreg"><span class="ig-bead ig-bead--cyan is-live"></span><span>Reescrevendo…</span></div>`;
      nota.innerHTML = "";
      sample.json(pergunta, { modelTier:"default", cache:{ gcTime:86400000, refresh:true } })
        .then(d2=>{ alvo.innerHTML = bloco("O que é", d2.oque) + bloco("Curiosidade", d2.curiosidade)
                     + bloco("O que você vai achar aí", d2.achar) + bloco("Pra jogar leve", d2.jeito);
                    nota.textContent = "Reescrito."; })
        .catch(e=>{ alvo.innerHTML = ""; nota.textContent = copiaErro(e.code); });
    });
  }catch(e){
    if(e?.code === "cancelled") return;
    alvo.innerHTML = "";
    nota.textContent = copiaErro(e?.code);
  }
}
function copiaErro(code){
  switch(code){
    case "not_granted": case "sampling_disabled": case "not_declared":
    case "capability_disabled": case "capability_removed":
      return "Os números acima são seus. A parte escrita precisa da sua permissão pro Claude nesta página.";
    case "rate_limited": return "O Claude está no limite agora. Tente daqui a pouco — os números acima continuam valendo.";
    case "session_expired": return "Sua sessão do Claude expirou. Entre de novo e reabra a caixa.";
    case "invalid_json": case "empty_completion": return "O encarte saiu torto. Feche e abra a caixa de novo.";
    default: return "O encarte não veio agora. Os números acima são seus e continuam valendo.";
  }
}

/* ---------- o disco: sobe, gira e o jogo começa ---------- */
async function tocaDisco(){
  const id = caixaId; if(!id || EJ.tocando || EJ.voando) return;
  if(S.active){ toast("Já tem sessão rodando. Aperte stop antes.", true); return; }
  if(GAMES[id]?.unreleased && Date.now() < GTA6.getTime()){ toast("O GTA VI chega em 19/11. O disco toca a partir desse dia."); return; }
  EJ.tocando = true;
  if(!EJ.aberta){ abreTampa(); await espera(reduzMov() ? 0 : 760); }
  $("discoBtn").classList.add("sobe","gira");
  await espera(reduzMov() ? 0 : 1100);
  if(S.config.game !== id){ S.config.game = id; wConfig(); renderLib(); }
  $("playBtn").click();                       /* o deck de fita abre por cima de tudo */
  await espera(60);
  await fechaCaixa({seco:true});
  EJ.tocando = false;
}

/* ---------- VIDRO DE VERDADE ----------
   rizroze/liquid-glass (MIT): mapa de deslocamento gerado em canvas +
   feDisplacementMap em três passadas, uma por canal RGB — é daí que sai a
   aberração cromática na borda. Só entra onde há textura atrás pra dobrar:
   a grelha do transporte e a cena da janela. Fora do Chromium cai em blur
   sozinho, sem erro. */
let vidroPosto = false;
function poeVidro(){
  const LG = window.LiquidGlass; if(!LG || vidroPosto || document.body.dataset.vista !== "aparelho") return;
  vidroPosto = true;
  const v = (el, o) => { if(el) try{ LG.createLiquidGlass(el, o); }catch(e){} };
  v($("playBtn"),   { borderRadius:999, scale:-58, aberration:[0,5,10], saturation:1.35, blur:10 });
  v($("stopBtn"),   { borderRadius:999, scale:-50, aberration:[0,4,9], saturation:1.2, blur:10 });
  v($("heroBadge"), { borderRadius:999, scale:-46, aberration:[0,5,10], saturation:1.5, blur:7 });
}
if(document.readyState === "complete") poeVidro(); else addEventListener("load", poeVidro);

/* ---------- fios da caixa ---------- */
$("cxfechar").addEventListener("click", ()=>fechaCaixa());
$("cxcena").addEventListener("click", e=>{ if(e.target === $("cxcena")) fechaCaixa(); });
$("discoBtn").addEventListener("click", e=>{ e.stopPropagation(); tocaDisco(); });
$("cxprim").addEventListener("click", ()=> EJ.aberta ? tocaDisco() : abreTampa());
$("cxsec").addEventListener("click", ()=> EJ.aberta ? fechaTampa() : viraCaixa());
$("cxbancada").addEventListener("click", ()=>{
  const id = caixaId; if(!id) return;
  S.config.game = id; wConfig(); renderLib(); fechaCaixa();
  toast(`"${(GAMES[id]?.name)||id}" está na bancada.`);
});
$("cxcapaAcao").addEventListener("click", ()=>$("cxcapaFile").click());
$("cxcapaTira").addEventListener("click", ()=>{ if(caixaId) tiraCapa(caixaId); });
$("cxcapaFile").addEventListener("change", e=>{
  const f = e.target.files?.[0]; if(f && caixaId) guardaCapa(caixaId, f);
  e.target.value = "";
});
/* arrastar a imagem em cima da caixa (contorno em vez de filtro: filtro achata o 3D no Safari) */
(function solta(){
  const palco = $("cxpalco");
  const nao = e => { e.preventDefault(); e.stopPropagation(); };
  ["dragenter","dragover"].forEach(ev=>palco.addEventListener(ev, e=>{ nao(e); palco.style.outline="2px dashed var(--ig-amber)"; }));
  ["dragleave","drop"].forEach(ev=>palco.addEventListener(ev, e=>{ nao(e); palco.style.outline=""; }));
  palco.addEventListener("drop", e=>{
    const f = e.dataTransfer?.files?.[0];
    if(f && caixaId) guardaCapa(caixaId, f);
  });
})();
document.addEventListener("keydown", e=>{ if(e.key==="Escape" && !$("cxcena").hidden) fechaCaixa(); });

/* ---------- boot ---------- */
lsLoad(); buildGameSel(); renderLib(); renderVitrine(); render();
/* a lombada do jogo atual começa à vista, no meio do trilho (a página fica no alto, na vitrine) */
requestAnimationFrame(()=>{ const el=document.querySelector(".ig-lombada.is-atual"), rail=$("trilho");
  if(!el) return;
  const er = el.getBoundingClientRect(), rr = rail.getBoundingClientRect();
  const x = rail.scrollLeft + (er.left - rr.left) - rr.width/2 + er.width/2;
  window._lenisRail ? window._lenisRail.scrollTo(x,{immediate:true}) : rail.scrollLeft = x; });
setInterval(()=>{ if(S.active){ tick(); if(Math.floor(Date.now()/1000)%30===0) render(); } }, 1000);
let redT; addEventListener("resize", ()=>{ clearTimeout(redT); redT=setTimeout(()=>{ render(); renderLib(); if(!$("cxcena").hidden) medeEstojo(); }, 180); });

(async ()=>{
  try{ db = await window.claude?.use?.("db"); }catch(e){ db = null; }
  if(!db){ render(); return; }
  online = true;
  const fail = () => { online = false; render(); };
  db.collection("sessions").orderBy("start","desc").limit(1000).onSnapshot(snap=>{
    S.sessions = snap.docs.map(d=>({id:d.id, ...d.data()})); render();
  }, fail);
  db.doc("state/active").onSnapshot(snap=>{ S.active = snap.exists ? {...snap.data()} : null; render(); }, fail);
  db.doc("state/capas").onSnapshot(snap=>{ capas = snap.exists ? {...snap.data()} : {};
    if(caixaId){ const it = LIB.find(x=>x.id===caixaId); if(it) desenhaCapa(it); } renderLib(); }, ()=>{});
  db.doc("state/config").onSnapshot(snap=>{ if(snap.exists) S.config = {game:"mafia-oc", est:{}, done:{}, hidden:{}, ...snap.data()}; buildGameSel(); render(); renderLib(); }, fail);
})();
