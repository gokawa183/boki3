// ===== 状態管理（Claude storage API / localStorage フォールバック） =====
const STORE_KEY = 'boki3_v1';

// Claude storage API が使えるか判定
const useCloudStorage = typeof window !== 'undefined' && window.storage && typeof window.storage.get === 'function';

// ── 読み込み ──
async function loadStore() {
  if (useCloudStorage) {
    try {
      const res = await window.storage.get(STORE_KEY);
      return res ? JSON.parse(res.value) : {};
    } catch(e) { return {}; }
  } else {
    try {
      return JSON.parse(localStorage.getItem(STORE_KEY)) || {};
    } catch(e) { return {}; }
  }
}

// ── 保存 ──
async function saveStore(data) {
  if (useCloudStorage) {
    try {
      await window.storage.set(STORE_KEY, JSON.stringify(data));
    } catch(e) {}
  } else {
    try {
      localStorage.setItem(STORE_KEY, JSON.stringify(data));
    } catch(e) {}
  }
}

// ── 特定キーを更新して保存 ──
async function updateStore(key, value) {
  const s = await loadStore();
  s[key] = value;
  await saveStore(s);
}

// ── 起動時にデータを復元してアプリを初期化 ──
const pqState  = {};
const missedQs = {};

async function initStore() {
  const s = await loadStore();
  Object.assign(pqState,  s.pqState  || {});
  Object.assign(missedQs, s.missedQs || {});
}

// pqState・missedQs 保存ラッパー
function savePqState()  { updateStore('pqState',  pqState); }
function saveMissedQs() { updateStore('missedQs', missedQs); }

/* ================================================================
   アプリ本体 (UI・ロジック)
   通常はここを編集する必要はありません
================================================================ */

// ===== 成績管理 =====
async function loadStats() {
  const s = await loadStore();
  return s.statsData || {};
}
function saveStats(s) { updateStore('statsData', s); }
function resetStats() {
  if(confirm('成績・練習問題の回答・間違えた問題をすべてリセットしますか？')) {
    Object.keys(pqState).forEach(k => delete pqState[k]);
    Object.keys(missedQs).forEach(k => delete missedQs[k]);
    if (useCloudStorage) {
      window.storage.delete(STORE_KEY).catch(()=>{});
    } else {
      try { localStorage.removeItem(STORE_KEY); } catch(e) {}
    }
    renderStats();
    // 基礎学習タブが開いていれば再描画
    if (!document.getElementById('tab-study').classList.contains('hidden')) {
      renderStudyTab();
    }
  }
}
async function recordResult(cat,isOk){
  const s = await loadStats();
  if(!s[cat]) s[cat]={c:0,w:0};
  if(isOk) s[cat].c++; else s[cat].w++;
  await updateStore('statsData', s);
}
async function renderStats(){
  const s = await loadStats();
  const cats2=['現金・預金','売掛買掛','固定資産','決算整理','その他'];

  // カテゴリごとの基礎学習レッスンキー一覧
  const catLessons={
    '現金・預金':['deposit','cashcontent'],
    '売掛買掛':['kakeuri','kitte'],
    '固定資産':['kotei'],
    '決算整理':['mibarai','maebara','kessanuri'],
    'その他':['bspl'],
  };

  const totalC=Object.values(s).reduce((a,v)=>a+v.c,0);
  const totalW=Object.values(s).reduce((a,v)=>a+v.w,0);
  const totalD=totalC+totalW;
  const totalR=totalD>0?Math.round(totalC/totalD*100):null;
  const rateCol=r=>r===null?'g-none':r>=70?'g-hi':r>=50?'g-md':'g-lo';
  const barCol=r=>r===null?'b-none':r>=70?'b-hi':r>=50?'b-md':'b-lo';
  const el=document.getElementById('statsContent');
  if(totalD===0){
    el.innerHTML='<div class="no-stats">まだ問題を解いていません。<br>練習問題タブから挑戦してみましょう！</div>';
    return;
  }
  let html=`<div class="stats-total">
    <div class="st-item"><div class="st-val ok-col">${totalC}</div><div class="st-lbl">正解数</div></div>
    <div class="st-item"><div class="st-val ng-col">${totalW}</div><div class="st-lbl">不正解数</div></div>
    <div class="st-item"><div class="st-val rt-col">${totalR!==null?totalR+'%':'－'}</div><div class="st-lbl">総合正解率</div></div>
    <div class="st-item"><div class="st-val" style="color:#fff">${totalD}</div><div class="st-lbl">回答数</div></div>
  </div>`;
  cats2.forEach(cat=>{
    const d=s[cat]||{c:0,w:0};
    const done=d.c+d.w;
    const r=done>0?Math.round(d.c/done*100):null;
    const pool=rawQs.filter(q=>q.cat===cat).length;
    const lks=catLessons[cat]||[];
    const btns=lks.map(lk=>{
      const title=lessons[lk]?lessons[lk].title:'基礎学習';
      return `<button class="stat-lesson-btn" onclick="goToStudy('${lk}')">📖 ${title}</button>`;
    }).join('');
    html+=`<div class="genre-card">
      <div class="genre-top">
        <div class="genre-name">${cat}</div>
        <div class="genre-rate ${rateCol(r)}">${r!==null?r+'%':'未受験'}</div>
      </div>
      <div class="genre-bar-wrap"><div class="genre-bar ${barCol(r)}" style="width:${r||0}%"></div></div>
      <div class="genre-sub">正解 ${d.c} / 回答 ${done}問　問題プール：${pool}問</div>
      ${btns?`<div class="stat-lesson-btns">${btns}</div>`:''}
    </div>`;
  });
  el.innerHTML=html;
}

// ===== シャッフル =====
function shuffleQ(raw){
  const opts=[...raw.opts];
  const correct=opts[0];
  for(let i=opts.length-1;i>0;i--){
    const j=Math.floor(Math.random()*(i+1));
    [opts[i],opts[j]]=[opts[j],opts[i]];
  }
  return {...raw,opts,ans:opts.indexOf(correct)};
}

let selCat='全問題',curQs=[],idx=0,correct=0,wrong=0,answered=false;
const cats=['全問題','現金・預金','売掛買掛','固定資産','決算整理','その他'];

async function init(){
  // まず全タブを確実にhiddenにする
  ['quiz','stats','study','exam','mock','q2study','q3study','kessan','reference','journal']
    .forEach(t => {
      const el = document.getElementById('tab-'+t);
      if(el) el.classList.add('hidden');
    });

  // ストレージからデータを復元（失敗しても続行）
  try { await initStore(); } catch(e) {}

  const pool = rawQs.length;
  document.getElementById('poolSize').textContent = pool;
  renderChips(); loadQs(); renderJournals();

  // visited フラグを確認
  let visited = false;
  try {
    const s = await loadStore();
    visited = !!s.visited;
  } catch(e) {}

  if (visited) {
    document.getElementById('welcome-screen').classList.add('hidden');
    document.getElementById('app-area').classList.remove('hidden');
    renderStats();
  }
  // 初回はウェルカム画面を表示（app-areaはhiddenのまま）
}

function renderChips(){
  document.getElementById('chips').innerHTML=cats.map(c=>{
    const cnt=c==='全問題'?rawQs.length:rawQs.filter(q=>q.cat===c).length;
    return `<button class="chip ${c===selCat?'active':''}" onclick="pickCat('${c}')">${c}(${cnt})</button>`;
  }).join('');
}
function pickCat(c){selCat=c;renderChips();loadQs();}

function loadQs(){
  const base=selCat==='全問題'?[...rawQs]:rawQs.filter(q=>q.cat===selCat);
  const shuffled=base.sort(()=>Math.random()-.5);
  curQs=shuffled.slice(0,Math.min(QUIZ_COUNT,shuffled.length)).map(shuffleQ);
  idx=0;correct=0;wrong=0;answered=false;
  document.getElementById('resultScreen').classList.add('hidden');
  hideBanner();updateProgress();renderQ();
}

function updateProgress(){
  const total=curQs.length,pct=total>0?Math.round((idx/total)*100):0;
  document.getElementById('pBar').style.width=pct+'%';
  document.getElementById('qN').textContent=Math.min(idx+1,total);
  document.getElementById('qT').textContent=total;
  document.getElementById('cCnt').textContent=correct;
  document.getElementById('wCnt').textContent=wrong;
  const done=correct+wrong;
  document.getElementById('scoreDisp').textContent=done>0?Math.round(correct/done*100)+'%':'－';
}

function renderQ(){
  const area=document.getElementById('quizArea');
  hideBanner();
  if(idx>=curQs.length){showResult();return;}
  const q=curQs[idx];answered=false;
  area.innerHTML=`
    <div class="qcard" id="qCard">
      <div class="q-meta">${q.cat} — Q${idx+1}</div>
      <div class="q-text">${q.q}</div>
      <div class="opts" id="opts">
        ${q.opts.map((o,i)=>`
          <button class="opt" id="opt${i}" onclick="pick(${i})">
            <span class="olbl">${String.fromCharCode(65+i)}.</span>
            <span>${o}</span>
            <span class="oico" id="ico${i}"></span>
          </button>`).join('')}
      </div>
      <div class="exp" id="exp"><div class="exp-ttl">✦ 解　説</div><div>${q.exp}</div></div>
      <div class="btn-row">
        <button class="next-btn" id="nextBtn" onclick="nextQ()">次の問題へ →</button>
        <button class="study-btn" id="studyBtn" onclick="goToStudy(curQs[idx].lk)">📖 この分野の基礎を学ぶ</button>
      </div>
    </div>`;
}

function pick(i){
  if(answered)return;
  answered=true;
  const q=curQs[idx];
  const ok=(i===q.ans);
  recordResult(q.cat,ok);
  const banner=document.getElementById('banner');
  const card=document.getElementById('qCard');
  if(ok){
    banner.className='banner ok show';
    banner.innerHTML='<span class="b-icon">✅</span><span class="b-text">正解！<small>その通りです！</small></span>';
    card.classList.add('st-ok');correct++;
  }else{
    banner.className='banner ng show';
    banner.innerHTML=`<span class="b-icon">❌</span><span class="b-text">不正解<small>正解は「${String.fromCharCode(65+q.ans)}」です</small></span>`;
    card.classList.add('st-ng');wrong++;
    addMissedQ(q);
  }
  for(let j=0;j<q.opts.length;j++){
    const btn=document.getElementById('opt'+j);
    const ico=document.getElementById('ico'+j);
    btn.disabled=true;
    if(j===q.ans){btn.classList.add('oc');ico.textContent='✓';}
    else if(j===i){btn.classList.add('ow');ico.textContent='✗';}
    else btn.classList.add('od');
  }
  document.getElementById('exp').classList.add('show');
  document.getElementById('nextBtn').classList.add('show');
  if(!ok)document.getElementById('studyBtn').classList.add('show');
  updateProgress();
  banner.scrollIntoView({behavior:'smooth',block:'nearest'});
}

function nextQ(){idx++;updateProgress();renderQ();}
function hideBanner(){const b=document.getElementById('banner');b.className='banner';b.innerHTML='';}

function showResult(){
  document.getElementById('quizArea').innerHTML='';
  const total=correct+wrong,rate=total>0?Math.round(correct/total*100):0;
  const cls=rate>=70?'sg':rate>=50?'so':'sb';
  const msg=rate>=70?'🎉 合格圏内！':'📈 あと少し！解説を復習しよう';
  const r=document.getElementById('resultScreen');
  r.classList.remove('hidden');
  r.innerHTML=`<div class="r-score ${cls}">${rate}%</div>
    <div class="r-lbl">正解率 ─ ${correct}問正解 / ${total}問中</div>
    <div class="r-msg">${msg}</div>
    <button class="r-btn" onclick="loadQs()">もう一度挑戦する</button>
    <button class="r-btn sec" onclick="showTab('stats',document.querySelectorAll('.tab')[1])">📊 成績を確認する</button>`;
}

// 保存済み回答のUI復元（pickPQ から呼ばれる）
function restorePQ(lk,qi,chosenOi){
  const pq=lessons[lk].practice[qi];
  for(let i=0;i<pq.opts.length;i++){
    const btn=document.getElementById(`pqb-${lk}-${qi}-${i}`);
    const ico=document.getElementById(`pqi-${lk}-${qi}-${i}`);
    if(!btn)continue;
    btn.disabled=true;
    if(i===pq.ans){btn.classList.add('p-ok');ico.textContent='✓';}
    else if(i===chosenOi){btn.classList.add('p-ng');ico.textContent='✗';}
    else btn.classList.add('p-dim');
  }
  const expEl=document.getElementById(`pqe-${lk}-${qi}`);
  if(expEl)expEl.classList.add('show');
}

function showPQResult(lk){
  const lesson=lessons[lk];
  const total=lesson.practice.length;
  let okCount=0;
  lesson.practice.forEach((p,i)=>{if(pqState[`${lk}-${i}`]===p.ans)okCount++;});
  const rate=Math.round(okCount/total*100);
  const resultEl=document.getElementById(`pqr-${lk}`);
  if(!resultEl)return;
  resultEl.className=`pq-result show ${rate===100?'all-ok':'not-ok'}`;
  resultEl.textContent=rate===100?'🎉 全問正解！完璧です！':`✅ ${okCount}/${total}問 正解！解説を読んでもう一度確認してみよう`;
}

function toggleRef(h){h.nextElementSibling.classList.toggle('open');h.classList.toggle('open');}

function renderJournals(){
  // グループ別にまとめる
  const groups = {};
  journals.forEach(e => {
    if (!groups[e.group]) groups[e.group] = [];
    groups[e.group].push(e);
  });
  document.getElementById('journalList').innerHTML = Object.entries(groups).map(([gname, items], gi) => `
    <div class="ref-card">
      <div class="ref-hd" onclick="toggleRef(this)">${gname}（${items.length}パターン） <span class="tog">▼</span></div>
      <div class="ref-bd">
        ${items.map(e => `
          <div class="jcard" style="margin-bottom:10px;box-shadow:none;border:1px solid var(--border)">
            <div class="jttl">${e.title}</div>
            <table class="jtbl">
              <thead><tr><th>借　方</th><th>金　額</th><th>貸　方</th><th>金　額</th></tr></thead>
              <tbody>${buildRows(e.d,e.c)}</tbody>
            </table>
            <div class="jnote">${e.note}</div>
          </div>`).join('')}
      </div>
    </div>`).join('');
}
function buildRows(d,c){
  const mx=Math.max(d.length,c.length);let r='';
  for(let i=0;i<mx;i++){
    const di=d[i]||['',''],ci=c[i]||['',''];
    r+=`<tr><td class="jd">${di[0]}</td><td class="ja">${di[1]}</td><td class="jc">${ci[0]}</td><td class="ja">${ci[1]}</td></tr>`;
  }
  return r;
}

function showTab(tab,el){
  ['quiz','stats','study','exam','mock','q2study','q3study','kessan','reference','journal'].forEach(t=>document.getElementById('tab-'+t).classList.add('hidden'));
  document.getElementById('tab-'+tab).classList.remove('hidden');
  document.querySelectorAll('.tab').forEach(t=>t.classList.remove('active'));
  if(el)el.classList.add('active');
  if(tab==='stats')renderStats();
  if(tab==='study')renderStudyTab();
}

// ===== 決算対策 採点関数 =====
function checkKessan(no, correct, ansId, resId, expId) {
  const ans = parseInt(document.getElementById(ansId).value);
  const res = document.getElementById(resId);
  const exp = document.getElementById(expId);
  res.style.display = 'block';
  exp.style.display = 'block';
  if (ans === correct) {
    res.textContent = '✅ 正解！ ' + correct.toLocaleString() + '円';
    res.style.background = 'var(--cl)';
    res.style.color = 'var(--cg)';
  } else {
    res.textContent = '❌ 不正解。正解は ' + correct.toLocaleString() + '円 です。';
    res.style.background = 'var(--wl)';
    res.style.color = 'var(--wg)';
  }
}
function resetKessan(ansId, resId, expId) {
  document.getElementById(ansId).value = '';
  document.getElementById(resId).style.display = 'none';
  document.getElementById(expId).style.display = 'none';
}
function checkQ2E1(){
  const ans = parseInt(document.getElementById('q2e1ans').value);
  const result = document.getElementById('q2e1-result');
  const exp = document.getElementById('q2e1-exp');
  result.style.display = 'block';
  exp.style.display = 'block';
  if(ans === 70000){
    result.textContent = '✅ 正解！ 70,000円';
    result.style.background = 'var(--cl)';
    result.style.color = 'var(--cg)';
  } else {
    result.textContent = '❌ 不正解。正解は 70,000円 です。';
    result.style.background = 'var(--wl)';
    result.style.color = 'var(--wg)';
  }
}
function resetQ2E1(){
  document.getElementById('q2e1ans').value = '';
  document.getElementById('q2e1-result').style.display = 'none';
  document.getElementById('q2e1-exp').style.display = 'none';
}

function checkQ2E2(){
  const ans = parseInt(document.getElementById('q2e2ans').value);
  const result = document.getElementById('q2e2-result');
  const exp = document.getElementById('q2e2-exp');
  result.style.display = 'block';
  exp.style.display = 'block';
  if(ans === 300000){
    result.textContent = '✅ 正解！ 300,000円';
    result.style.background = 'var(--cl)';
    result.style.color = 'var(--cg)';
  } else {
    result.textContent = '❌ 不正解。正解は 300,000円 です。';
    result.style.background = 'var(--wl)';
    result.style.color = 'var(--wg)';
  }
}

function checkQ3E(){
  const a1 = parseInt(document.getElementById('q3e1ans').value);
  const a2 = parseInt(document.getElementById('q3e2ans').value);
  const r1 = document.getElementById('q3e1-result');
  const r2 = document.getElementById('q3e2-result');
  const exp = document.getElementById('q3e-exp');
  r1.style.display = 'block';
  r2.style.display = 'block';
  exp.style.display = 'block';
  if(a1 === 390000){
    r1.textContent = '✅ 正解！ 390,000円';
    r1.style.color = 'var(--cg)';
  } else {
    r1.textContent = '❌ 不正解。正解は 390,000円';
    r1.style.color = 'var(--wg)';
  }
  if(a2 === 60000){
    r2.textContent = '✅ 正解！ 60,000円';
    r2.style.color = 'var(--cg)';
  } else {
    r2.textContent = '❌ 不正解。正解は 60,000円';
    r2.style.color = 'var(--wg)';
  }
}
function resetQ3E(){
  document.getElementById('q3e1ans').value = '';
  document.getElementById('q3e2ans').value = '';
  document.getElementById('q3e1-result').style.display = 'none';
  document.getElementById('q3e2-result').style.display = 'none';
  document.getElementById('q3e-exp').style.display = 'none';
}
function startApp(tab) {
  // 全タブを確実にhiddenにしてからアプリを表示
  ['quiz','stats','study','exam','mock','q2study','q3study','kessan','reference','journal']
    .forEach(t => {
      const el = document.getElementById('tab-'+t);
      if(el) el.classList.add('hidden');
    });
  document.getElementById('welcome-screen').classList.add('hidden');
  document.getElementById('app-area').classList.remove('hidden');
  const tabBtn = [...document.querySelectorAll('.tab')].find(
    b => b.getAttribute('onclick') && b.getAttribute('onclick').includes(`'${tab}'`)
  );
  showTab(tab, tabBtn);
  updateStore('visited', true);
}

function renderStudyTab(){
  const lkOrder=['basics','shiwake','kamoku','deposit','cashcontent','kakeuri','tegata','kitte','kotei','mibarai','maebara','chosahyo','seizan','bspl','kessanuri'];
  const el=document.getElementById('studyList');
  el.innerHTML=lkOrder.map(lk=>{
    const lesson=lessons[lk];
    if(!lesson)return '';
    // 練習問題の進捗
    const total=lesson.practice?lesson.practice.length:0;
    const done=lesson.practice?lesson.practice.filter((_,i)=>pqState[`${lk}-${i}`]!==undefined).length:0;
    const okCount=lesson.practice?lesson.practice.filter((p,i)=>pqState[`${lk}-${i}`]===p.ans).length:0;
    const badge=total>0?(done===total?`✅ ${okCount}/${total}`:`${done}/${total}問済`):'';
    return `<div class="study-card" id="sc-${lk}">
      <div class="study-card-hd" onclick="toggleStudyCard('${lk}',this)">
        <div class="study-card-hd-left">
          <span class="study-card-title">${lesson.title}</span>
        </div>
        <div style="display:flex;align-items:center;gap:8px">
          ${badge?`<span style="font-size:.7rem;color:var(--gold);font-weight:700">${badge}</span>`:''}
          <span class="study-card-tog">▼</span>
        </div>
      </div>
      <div class="study-card-body" id="scb-${lk}">
        ${lesson.sections.map(s=>`
          <div class="lesson-sec">
            <h4>${s.h}</h4>
            <p>${s.p}</p>
            ${s.eg?`<div class="lesson-eg">${s.eg}</div>`:''}
          </div>`).join('')}
        ${renderPracticeInline(lk,lesson)}
        ${renderMissedInline(lk)}
      </div>
    </div>`;
  }).join('');
}

function renderPracticeInline(lk,lesson){
  if(!lesson.practice||lesson.practice.length===0)return '';
  let html=`<div class="practice-area">
    <div class="practice-title">✏️ 練習問題に挑戦！</div>`;
  lesson.practice.forEach((pq,qi)=>{
    const saved=pqState[`${lk}-${qi}`];
    const answered=saved!==undefined;
    html+=`<div class="pq-block" id="pq-${lk}-${qi}">
      <div class="pq-num">Q${qi+1}</div>
      <div class="pq-text">${pq.q}</div>
      <div class="pq-opts">
        ${pq.opts.map((o,oi)=>{
          let cls='pq-btn';
          let ico='';
          let disabled='';
          if(answered){
            disabled='disabled';
            if(oi===pq.ans){cls+=' p-ok';ico='✓';}
            else if(oi===saved){cls+=' p-ng';ico='✗';}
            else cls+=' p-dim';
          }
          return `<button class="${cls}" id="pqb-${lk}-${qi}-${oi}" onclick="pickPQ('${lk}',${qi},${oi})" ${disabled}>
            <span class="pq-lbl">${String.fromCharCode(65+oi)}.</span>
            <span>${o}</span>
            <span class="pq-ico" id="pqi-${lk}-${qi}-${oi}">${ico}</span>
          </button>`;
        }).join('')}
      </div>
      <div class="pq-exp${answered?' show':''}" id="pqe-${lk}-${qi}">${pq.exp}</div>
    </div>`;
  });
  // 全問完了の結果表示
  const total=lesson.practice.length;
  const done=lesson.practice.filter((_,i)=>pqState[`${lk}-${i}`]!==undefined).length;
  let resultHtml='';
  if(done===total){
    const okCount=lesson.practice.filter((p,i)=>pqState[`${lk}-${i}`]===p.ans).length;
    const rate=Math.round(okCount/total*100);
    const cls=rate===100?'all-ok':'not-ok';
    const msg=rate===100?'🎉 全問正解！完璧です！':`✅ ${okCount}/${total}問 正解！解説を読んでもう一度確認してみよう`;
    resultHtml=`<div class="pq-result show ${cls}">${msg}</div>`;
  }
  html+=`${resultHtml}<button class="reset-btn" style="margin-top:8px" onclick="retryPractice('${lk}')">🔄 やり直す</button></div>`;
  return html;
}

function goToStudy(lk){
  // 基礎学習タブへ遷移してカードを開く
  const studyTabBtn=document.querySelectorAll('.tab')[2];
  showTab('study',studyTabBtn);
  // 少し待ってからカードを開く
  setTimeout(()=>{
    const body=document.getElementById('scb-'+lk);
    const hd=body?body.previousElementSibling:null;
    if(body&&!body.classList.contains('open')){
      body.classList.add('open');
      if(hd)hd.classList.add('open');
    }
    // スクロール
    const card=document.getElementById('sc-'+lk);
    if(card)card.scrollIntoView({behavior:'smooth',block:'start'});
  },50);
}
// ===== 模擬試験 =====
// 第2問：固定問題（勘定記入）
const mockQ2Data = [
  {
    title:'【小問1】売掛金勘定の記入',
    note:'次の取引をもとに、売掛金勘定の（　）に入る金額または勘定科目名を答えなさい。\n① 商品200,000円を掛けで販売した\n② 売掛金150,000円を現金で回収した\n③ 売掛金のうち20,000円が返品された',
    ledger:{
      name:'売 掛 金',
      rows:[
        {date:'①',desc:'売上',  debit:200000, credit:null},
        {date:'②',desc:'現金',  debit:null,   credit:150000},
        {date:'③',desc:'売上',  debit:null,   credit:20000},
        {date:'残',desc:'次月繰越',debit:null, credit:'?残高'},
      ]
    },
    answer:{残高: 30000},
    points: 10,
  },
  {
    title:'【小問2】買掛金勘定の記入',
    note:'次の取引をもとに、買掛金勘定の（　）に入る金額を答えなさい。\n① 商品300,000円を掛けで仕入れた\n② 買掛金200,000円を当座預金で支払った\n③ 仕入れた商品のうち30,000円を返品した',
    ledger:{
      name:'買 掛 金',
      rows:[
        {date:'①',desc:'仕入',       debit:null,   credit:300000},
        {date:'②',desc:'当座預金',   debit:200000, credit:null},
        {date:'③',desc:'仕入（返品）',debit:30000,  credit:null},
        {date:'残',desc:'次月繰越',   debit:'?残高', credit:null},
      ]
    },
    answer:{残高: 70000},
    points: 10,
  }
];

// 第3問：決算整理後残高試算表（固定）
const mockQ3Data = {
  title:'【第3問】決算整理後残高試算表の作成',
  note:'下記の決算整理事項にもとづき、決算整理後残高試算表を完成させなさい。\n\n【残高試算表（決算整理前）】\n現金：80,000 / 売掛金：200,000 / 繰越商品：40,000 / 備品：300,000\n買掛金：120,000 / 借入金：100,000 / 資本金：500,000\n売上：600,000 / 仕入：350,000 / 給料：150,000 / 支払家賃：60,000\n支払利息：6,000\n\n【決算整理事項】\n① 期末商品棚卸高：50,000円\n② 備品の減価償却費：60,000円（定額法・間接法）\n③ 支払家賃の前払分：10,000円\n④ 支払利息の未払分：3,000円',
  items:[
    {label:'現金',          debit: 80000,   credit: null,   editable: false, side:'debit'},
    {label:'売掛金',         debit: 200000,  credit: null,   editable: false, side:'debit'},
    {label:'繰越商品',       debit: null,    credit: null,   editable: true,  side:'debit',  answer: 50000,  hint:'期末商品'},
    {label:'前払費用',       debit: null,    credit: null,   editable: true,  side:'debit',  answer: 10000,  hint:'家賃の前払分'},
    {label:'備品',           debit: 300000,  credit: null,   editable: false, side:'debit'},
    {label:'減価償却累計額', debit: null,    credit: null,   editable: true,  side:'credit', answer: 60000,  hint:'備品の減価償却'},
    {label:'買掛金',         debit: null,    credit: 120000, editable: false, side:'credit'},
    {label:'未払費用',       debit: null,    credit: null,   editable: true,  side:'credit', answer: 3000,   hint:'利息の未払分'},
    {label:'借入金',         debit: null,    credit: 100000, editable: false, side:'credit'},
    {label:'資本金',         debit: null,    credit: 500000, editable: false, side:'credit'},
    {label:'売上',           debit: null,    credit: 600000, editable: false, side:'credit'},
    {label:'仕入',           debit: null,    credit: null,   editable: true,  side:'debit',  answer: 340000, hint:'仕入±商品振替'},
    {label:'給料',           debit: 150000,  credit: null,   editable: false, side:'debit'},
    {label:'支払家賃',       debit: null,    credit: null,   editable: true,  side:'debit',  answer: 50000,  hint:'60,000-前払10,000'},
    {label:'支払利息',       debit: null,    credit: null,   editable: true,  side:'debit',  answer: 9000,   hint:'6,000+未払3,000'},
    {label:'減価償却費',     debit: null,    credit: null,   editable: true,  side:'debit',  answer: 60000,  hint:'備品の償却'},
  ],
  totalPoints: 35,
};

// 模試の状態
let mockState = {
  active: false,
  section: 1,      // 1=第1問 2=第2問 3=第3問
  q1idx: 0,
  q1qs: [],
  q1answers: {},   // idx -> 選んだoptionIndex
  q2answers: {},   // '0' '1' -> 入力値
  q3answers: {},   // label -> 入力値
  timerSec: 3600,
  timerInterval: null,
  finished: false,
};

function startMock() {
  // 第1問：rawQsからランダム15問選択・シャッフル
  const pool = [...rawQs].sort(() => Math.random() - .5).slice(0, 15).map(shuffleQ);
  mockState = {
    active: true, section: 1, q1idx: 0,
    q1qs: pool, q1answers: {}, q2answers: {}, q3answers: {},
    timerSec: 3600, timerInterval: null, finished: false,
  };
  document.getElementById('mock-start').classList.add('hidden');
  document.getElementById('mock-exam').classList.remove('hidden');
  document.getElementById('mock-result').classList.add('hidden');
  renderMockQ1();
  startMockTimer();
}

function startMockTimer() {
  mockState.timerInterval = setInterval(() => {
    mockState.timerSec--;
    updateMockTimer();
    if (mockState.timerSec <= 0) {
      clearInterval(mockState.timerInterval);
      submitMock();
    }
  }, 1000);
}

function updateMockTimer() {
  const s = mockState.timerSec;
  const m = Math.floor(s / 60), sec = s % 60;
  const el = document.getElementById('mockTimer');
  if (!el) return;
  el.textContent = `${String(m).padStart(2,'0')}:${String(sec).padStart(2,'0')}`;
  el.className = 'mock-timer' + (s <= 300 ? ' danger' : s <= 600 ? ' warning' : '');
}

// ── 第1問 ──
function renderMockQ1() {
  const q = mockState.q1qs[mockState.q1idx];
  const i = mockState.q1idx;
  const total = mockState.q1qs.length;
  const saved = mockState.q1answers[i];
  document.getElementById('mockProgressLabel').textContent = `第1問  ${i+1} / ${total}`;
  document.getElementById('mock-q1-area').innerHTML = `
    <div class="mock-q-header">第1問　仕訳（45点） — 1問3点</div>
    <div class="mock-q-block">
      <div class="mock-q-num">${q.cat}　Q${i+1}</div>
      <div class="mock-q-text">${q.q}</div>
      <div class="mock-opts">
        ${q.opts.map((o,oi)=>`
          <button class="mock-opt${saved===oi?' selected':''}" onclick="selectMockQ1(${oi})">
            <span style="font-family:'DM Mono',monospace;font-size:.72rem;min-width:18px">${String.fromCharCode(65+oi)}.</span>
            <span>${o}</span>
          </button>`).join('')}
      </div>
    </div>`;
  updateMockNav();
}

function selectMockQ1(oi) {
  if (mockState.finished) return;
  mockState.q1answers[mockState.q1idx] = oi;
  renderMockQ1();
}

// ── 第2問 ──
function renderMockQ2() {
  document.getElementById('mockProgressLabel').textContent = '第2問　勘定記入（20点）';
  let html = '<div class="mock-q-header">第2問　勘定記入（20点） — 各10点</div>';
  mockQ2Data.forEach((q2, qi) => {
    const saved = mockState.q2answers[qi] ?? '';
    html += `<div class="mock-q-block">
      <div class="mock-q-num">${q2.title}</div>
      <div class="mock-section-note" style="white-space:pre-line">${q2.note}</div>
      <table class="mock-fill-table">
        <thead><tr><th>日付</th><th>摘要</th><th>借方</th><th>貸方</th></tr></thead>
        <tbody>
          ${q2.ledger.rows.map(r => {
            const isBlank = (r.debit === '?残高' || r.credit === '?残高');
            const dVal = r.debit === '?残高' ? '' : (r.debit ? r.debit.toLocaleString() : '');
            const cVal = r.credit === '?残高' ? '' : (r.credit ? r.credit.toLocaleString() : '');
            return `<tr>
              <td style="text-align:center;font-size:.75rem">${r.date}</td>
              <td>${r.desc}</td>
              <td class="${r.debit==='?残高'?'fill-cell':''}">${r.debit==='?残高'
                ?`<input type="number" id="mock-q2-${qi}" value="${mockState.q2answers[qi]??''}" oninput="saveMockQ2(${qi},this.value)" placeholder="金額">`
                :dVal}</td>
              <td class="${r.credit==='?残高'?'fill-cell':''}">${r.credit==='?残高'
                ?`<input type="number" id="mock-q2-${qi}" value="${mockState.q2answers[qi]??''}" oninput="saveMockQ2(${qi},this.value)" placeholder="金額">`
                :cVal}</td>
            </tr>`;
          }).join('')}
        </tbody>
      </table>
    </div>`;
  });
  document.getElementById('mock-q2-area').innerHTML = html;
  updateMockNav();
}

function saveMockQ2(qi, val) {
  mockState.q2answers[qi] = parseInt(val) || 0;
}

// ── 第3問 ──
function renderMockQ3() {
  document.getElementById('mockProgressLabel').textContent = '第3問　残高試算表（35点）';
  const q3 = mockQ3Data;
  let rows = q3.items.map(item => {
    const saved = mockState.q3answers[item.label] ?? '';
    const dCell = item.side === 'debit'
      ? (item.editable
          ? `<td class="fill-cell"><input type="number" value="${saved}" oninput="saveMockQ3('${item.label}',this.value)" placeholder="${item.hint||''}"></td>`
          : `<td style="text-align:right">${item.debit ? item.debit.toLocaleString() : ''}</td>`)
      : `<td></td>`;
    const cCell = item.side === 'credit'
      ? (item.editable
          ? `<td class="fill-cell"><input type="number" value="${saved}" oninput="saveMockQ3('${item.label}',this.value)" placeholder="${item.hint||''}"></td>`
          : `<td style="text-align:right">${item.credit ? item.credit.toLocaleString() : ''}</td>`)
      : `<td></td>`;
    return `<tr><td style="font-size:.78rem">${item.label}</td>${dCell}${cCell}</tr>`;
  }).join('');

  document.getElementById('mock-q3-area').innerHTML = `
    <div class="mock-q-header">第3問　決算整理後残高試算表の作成（35点）</div>
    <div class="mock-q-block">
      <div class="mock-section-note" style="white-space:pre-line">${q3.note}</div>
      <table class="mock-fill-table">
        <thead><tr><th>勘定科目</th><th>借方残高</th><th>貸方残高</th></tr></thead>
        <tbody>${rows}</tbody>
      </table>
      <p style="font-size:.72rem;color:#888;margin-top:6px">※ 色付きセルに金額を入力してください</p>
    </div>`;
  updateMockNav();
}

function saveMockQ3(label, val) {
  mockState.q3answers[label] = parseInt(val) || 0;
}

// ── ナビゲーション ──
function updateMockNav() {
  const prevBtn = document.getElementById('mockPrevBtn');
  const nextBtn = document.getElementById('mockNextBtn');
  const submitBtn = document.getElementById('mockSubmitBtn');
  const s = mockState.section;
  const idx = mockState.q1idx;
  const total = mockState.q1qs.length;

  if (s === 1) {
    prevBtn.style.display = idx > 0 ? 'inline-block' : 'none';
    if (idx < total - 1) {
      nextBtn.textContent = '次の問題 →';
      nextBtn.classList.remove('hidden');
      submitBtn.classList.add('hidden');
    } else {
      nextBtn.textContent = '第2問へ →';
      nextBtn.classList.remove('hidden');
      submitBtn.classList.add('hidden');
    }
  } else if (s === 2) {
    prevBtn.style.display = 'inline-block';
    prevBtn.textContent = '← 第1問へ';
    nextBtn.textContent = '第3問へ →';
    nextBtn.classList.remove('hidden');
    submitBtn.classList.add('hidden');
  } else {
    prevBtn.style.display = 'inline-block';
    prevBtn.textContent = '← 第2問へ';
    nextBtn.classList.add('hidden');
    submitBtn.classList.remove('hidden');
  }
}

function mockNav(dir) {
  if (dir === 1) {
    if (mockState.section === 1) {
      if (mockState.q1idx < mockState.q1qs.length - 1) {
        mockState.q1idx++;
        renderMockQ1();
      } else {
        mockState.section = 2;
        document.getElementById('mock-q1-area').classList.add('hidden');
        document.getElementById('mock-q2-area').classList.remove('hidden');
        renderMockQ2();
      }
    } else if (mockState.section === 2) {
      mockState.section = 3;
      document.getElementById('mock-q2-area').classList.add('hidden');
      document.getElementById('mock-q3-area').classList.remove('hidden');
      renderMockQ3();
    }
  } else {
    if (mockState.section === 1 && mockState.q1idx > 0) {
      mockState.q1idx--;
      renderMockQ1();
    } else if (mockState.section === 2) {
      mockState.section = 1;
      document.getElementById('mock-q2-area').classList.add('hidden');
      document.getElementById('mock-q1-area').classList.remove('hidden');
      mockState.q1idx = mockState.q1qs.length - 1;
      renderMockQ1();
    } else if (mockState.section === 3) {
      mockState.section = 2;
      document.getElementById('mock-q3-area').classList.add('hidden');
      document.getElementById('mock-q2-area').classList.remove('hidden');
      renderMockQ2();
    }
  }
}

// ── 採点 ──
function submitMock() {
  if (!confirm('採点しますか？（未回答の問題は0点になります）')) return;
  clearInterval(mockState.timerInterval);
  mockState.finished = true;

  // 第1問採点
  let q1Score = 0;
  mockState.q1qs.forEach((q, i) => {
    if (mockState.q1answers[i] === q.ans) q1Score += 3;
  });

  // 第2問採点
  let q2Score = 0;
  mockQ2Data.forEach((q2, qi) => {
    const ans = Object.values(q2.answer)[0];
    if (parseInt(mockState.q2answers[qi]) === ans) q2Score += q2.points;
  });

  // 第3問採点（1箇所あたり5点 ×7箇所=35点）
  let q3Score = 0;
  const editableItems = mockQ3Data.items.filter(it => it.editable);
  const perItem = Math.floor(mockQ3Data.totalPoints / editableItems.length);
  editableItems.forEach(item => {
    if (parseInt(mockState.q3answers[item.label]) === item.answer) q3Score += perItem;
  });

  const total = q1Score + q2Score + q3Score;
  const pass = total >= 70;
  const elapsed = 3600 - mockState.timerSec;
  const em = Math.floor(elapsed/60), es = elapsed%60;

  // 結果画面
  document.getElementById('mock-exam').classList.add('hidden');
  const resultEl = document.getElementById('mock-result');
  resultEl.classList.remove('hidden');

  resultEl.innerHTML = `
    <div class="mock-result-score">
      <div class="mrs-total ${pass?'pass':'fail'}">${total}点</div>
      <div class="mrs-label">100点満点 ／ 合格基準70点</div>
      <div class="mrs-verdict">${pass?'🎉 合格おめでとうございます！':'😢 不合格。解説を確認して再チャレンジ！'}</div>
      <div class="mrs-breakdown">
        <span>第1問 ${q1Score}/45</span>
        <span>第2問 ${q2Score}/20</span>
        <span>第3問 ${q3Score}/35</span>
        <span>経過時間 ${em}分${String(es).padStart(2,'0')}秒</span>
      </div>
    </div>

    <div class="mock-result-detail">
      <div class="mrd-title">第1問　仕訳 — ${q1Score}点 / 45点</div>
      ${mockState.q1qs.map((q,i)=>{
        const ok = mockState.q1answers[i] === q.ans;
        const chosenOpt = mockState.q1answers[i] !== undefined ? q.opts[mockState.q1answers[i]] : '（未回答）';
        return `<div class="mrd-row">
          <span style="font-size:.75rem;flex:1">${q.cat}：${q.q.slice(0,28)}…</span>
          <span class="${ok?'mrd-ok':'mrd-ng'}">${ok?'✓ 正解':'✗ 不正解'}</span>
        </div>`;
      }).join('')}
    </div>

    <div class="mock-result-detail">
      <div class="mrd-title">第2問　勘定記入 — ${q2Score}点 / 20点</div>
      ${mockQ2Data.map((q2,qi)=>{
        const ans = Object.values(q2.answer)[0];
        const ok = parseInt(mockState.q2answers[qi]) === ans;
        return `<div class="mrd-row">
          <span style="font-size:.75rem">${q2.title}</span>
          <span class="${ok?'mrd-ok':'mrd-ng'}">${ok?'✓ 正解':'✗ 不正解（正解：${ans.toLocaleString()}円）'}</span>
        </div>`;
      }).join('')}
    </div>

    <div class="mock-result-detail">
      <div class="mrd-title">第3問　残高試算表 — ${q3Score}点 / 35点</div>
      ${editableItems.map(item=>{
        const ok = parseInt(mockState.q3answers[item.label]) === item.answer;
        return `<div class="mrd-row">
          <span style="font-size:.75rem">${item.label}（${item.hint}）</span>
          <span class="${ok?'mrd-ok':'mrd-ng'}">${ok?'✓':'✗'} 正解：${item.answer.toLocaleString()}円</span>
        </div>`;
      }).join('')}
    </div>

    <button class="mock-retry-btn" onclick="resetMock()">🔄 もう一度受験する</button>
  `;
}

function resetMock() {
  document.getElementById('mock-result').classList.add('hidden');
  document.getElementById('mock-start').classList.remove('hidden');
  document.getElementById('mock-q1-area').classList.remove('hidden');
  document.getElementById('mock-q2-area').classList.add('hidden');
  document.getElementById('mock-q3-area').classList.add('hidden');
}


function addMissedQ(q) {
  const lk = q.lk;
  if (!missedQs[lk]) missedQs[lk] = [];
  const already = missedQs[lk].some(m => m.q === q.q);
  if (!already) {
    missedQs[lk].push({q: q.q, opts: q.opts, ans: q.ans, exp: q.exp});
    saveMissedQs();
    // 基礎学習タブが表示中なら即時更新
    refreshMissedArea(lk);
  }
}

function refreshMissedArea(lk) {
  // カードのbodyが開いている場合だけ更新
  const body = document.getElementById('scb-' + lk);
  if (!body || !body.classList.contains('open')) return;
  const existing = document.getElementById('missed-area-' + lk);
  const newHtml = renderMissedInline(lk);
  if (existing) {
    const tmp = document.createElement('div');
    tmp.innerHTML = newHtml;
    if (tmp.firstElementChild) existing.replaceWith(tmp.firstElementChild);
  } else if (newHtml) {
    body.insertAdjacentHTML('beforeend', newHtml);
  }
}

function renderMissedInline(lk) {
  const list = missedQs[lk];
  if (!list || list.length === 0) return '';
  const items = list.map((m, mi) => {
    const key = `missed-${lk}-${mi}`;
    const saved = pqState[key];
    const answered = saved !== undefined;
    const optsHtml = m.opts.map((o, oi) => {
      let cls = 'pq-btn';
      let ico = '';
      let disabled = '';
      if (answered) {
        disabled = 'disabled';
        if (oi === m.ans) { cls += ' p-ok'; ico = '✓'; }
        else if (oi === saved) { cls += ' p-ng'; ico = '✗'; }
        else cls += ' p-dim';
      }
      return `<button class="${cls}" id="pqb-${key}-${oi}" onclick="pickMissedQ('${lk}',${mi},${oi})" ${disabled}>
        <span class="pq-lbl">${String.fromCharCode(65+oi)}.</span>
        <span>${o}</span>
        <span class="pq-ico" id="pqi-${key}-${oi}">${ico}</span>
      </button>`;
    }).join('');
    return `<div class="pq-block" id="pqb-block-${key}">
      <div class="pq-num" style="color:var(--wg)">❌ 間違えた問題 ${mi+1}</div>
      <div class="pq-text">${m.q}</div>
      <div class="pq-opts">${optsHtml}</div>
      <div class="pq-exp${answered?' show':''}" id="pqe-${key}">${m.exp}</div>
    </div>`;
  }).join('');
  return `<div class="practice-area" id="missed-area-${lk}" style="border-top:2px dashed var(--wb);margin-top:14px;padding-top:14px">
    <div class="practice-title" style="color:var(--wg)">❌ 間違えた問題をもう一度解こう</div>
    ${items}
  </div>`;
}

function pickMissedQ(lk, mi, oi) {
  const key = `missed-${lk}-${mi}`;
  if (pqState[key] !== undefined) return;
  pqState[key] = oi;
  savePqState();
  const m = missedQs[lk][mi];
  for (let i = 0; i < m.opts.length; i++) {
    const btn = document.getElementById(`pqb-${key}-${i}`);
    const ico = document.getElementById(`pqi-${key}-${i}`);
    if (!btn) continue;
    btn.disabled = true;
    if (i === m.ans) { btn.classList.add('p-ok'); ico.textContent = '✓'; }
    else if (i === oi) { btn.classList.add('p-ng'); ico.textContent = '✗'; }
    else btn.classList.add('p-dim');
  }
  const expEl = document.getElementById(`pqe-${key}`);
  if (expEl) expEl.classList.add('show');
}

function pickPQ(lk,qi,oi){
  const key=`${lk}-${qi}`;
  if(pqState[key]!==undefined)return; // 回答済み
  pqState[key]=oi;
  savePqState();
  restorePQ(lk,qi,oi);
  const lesson=lessons[lk];
  const total=lesson.practice.length;
  const done=lesson.practice.filter((_,i)=>pqState[`${lk}-${i}`]!==undefined).length;
  if(done===total)showPQResult(lk);
}

function retryPractice(lk){
  const lesson=lessons[lk];
  if(!lesson||!lesson.practice)return;
  lesson.practice.forEach((_,i)=>delete pqState[`${lk}-${i}`]);
  savePqState();
  // 練習問題エリアだけ再描画
  const body=document.getElementById('scb-'+lk);
  if(!body)return;
  const pa=body.querySelector('.practice-area');
  const newHtml=renderPracticeInline(lk,lesson);
  if(pa){
    const tmp=document.createElement('div');
    tmp.innerHTML=newHtml;
    pa.replaceWith(tmp.firstElementChild);
  }
}

function toggleStudyCard(lk,hd){
  const body=document.getElementById('scb-'+lk);
  body.classList.toggle('open');
  hd.classList.toggle('open');
}

init();
