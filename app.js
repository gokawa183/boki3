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

  // 総勘定元帳練習の成績
  const ld=s['総勘定元帳']||{c:0,w:0};
  const ldDone=ld.c+ld.w;
  const ldR=ldDone>0?Math.round(ld.c/ldDone*100):null;
  html+=`<div class="genre-card">
    <div class="genre-top">
      <div class="genre-name">📒 総勘定元帳練習</div>
      <div class="genre-rate ${rateCol(ldR)}">${ldR!==null?ldR+'%':'未受験'}</div>
    </div>
    <div class="genre-bar-wrap"><div class="genre-bar ${barCol(ldR)}" style="width:${ldR||0}%"></div></div>
    <div class="genre-sub">正解 ${ld.c} / 回答 ${ldDone}問　問題プール：${LEDGER_PROBLEMS.length}問</div>
    <div class="stat-lesson-btns">
      <button class="stat-lesson-btn" onclick="showTab('ledger',document.querySelectorAll('.tab')[5])">📒 元帳練習へ</button>
    </div>
  </div>`;

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
    const tabBtn = [...document.querySelectorAll('.tab')].find(
      b => b.getAttribute('onclick') && b.getAttribute('onclick').includes("'quiz'")
    );
    showTab('quiz', tabBtn);
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
  ['quiz','stats','study','exam','mock','q2study','q3study','kessan','reference','journal','ledger','release'].forEach(t=>document.getElementById('tab-'+t).classList.add('hidden'));
  document.getElementById('tab-'+tab).classList.remove('hidden');
  document.querySelectorAll('.tab').forEach(t=>t.classList.remove('active'));
  if(el)el.classList.add('active');
  if(tab==='stats')renderStats();
  if(tab==='study')renderStudyTab();
  if(tab==='ledger')initLedgerTab();
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

const STUDY_LK_ORDER=['basics','shiwake','kamoku','bspl','deposit','cashcontent','koguchi','kakeuri','kashidaore','maekin','kitte','tegata','yuka','kotei','mibarai','maebara','kessanuri','soukanjo','hojobo','chosahyo','seizan'];

function renderStudyTab(){
  const lkOrder=STUDY_LK_ORDER;
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

function _stripTags(html){
  const d=document.createElement('div');
  d.innerHTML=html;
  return d.textContent||d.innerText||'';
}

function _lessonMatchesQuery(lesson,q){
  if(!q)return false;
  const hit=s=>s&&s.includes(q);
  if(hit(lesson.title))return true;
  for(const s of(lesson.sections||[])){
    if(hit(s.h)||hit(_stripTags(s.p||''))||hit(s.eg||''))return true;
  }
  for(const p of(lesson.practice||[])){
    if(hit(p.q)||hit(p.exp)||(p.opts||[]).some(o=>hit(o)))return true;
  }
  return false;
}

function searchStudy(){
  const q=document.getElementById('studySearchInput').value.trim();
  const msg=document.getElementById('studySearchMsg');
  if(!q){clearStudySearch();return;}
  let found=0;
  STUDY_LK_ORDER.forEach(lk=>{
    const lesson=lessons[lk];
    const card=document.getElementById('sc-'+lk);
    if(!card)return;
    const body=document.getElementById('scb-'+lk);
    const hd=card.querySelector('.study-card-hd');
    if(_lessonMatchesQuery(lesson,q)){
      found++;
      card.style.display='';
      body.classList.add('open');
      hd.classList.add('open');
    }else{
      card.style.display='none';
    }
  });
  if(found===0){
    msg.textContent='該当項目が存在しません';
    msg.style.display='block';
  }else{
    msg.style.display='none';
  }
}

function clearStudySearch(){
  const msg=document.getElementById('studySearchMsg');
  if(msg)msg.style.display='none';
  STUDY_LK_ORDER.forEach(lk=>{
    const card=document.getElementById('sc-'+lk);
    if(card)card.style.display='';
  });
}

// ===== 総勘定元帳 練習 =====
const LEDGER_PROBLEMS=[
  // ── 損益勘定系 ──
  {title:'損益勘定の当期純利益',account:'損益',
   desc:'期末決算において各勘定の残高を損益勘定へ振り替えた結果が以下のとおりです。\n当期純利益（繰越利益剰余金への振替額）を求めなさい。',
   debits: [{label:'仕入（売上原価）',amount:480000},{label:'給料',amount:150000},{label:'支払家賃',amount:72000},{label:'減価償却費',amount:36000},{label:'繰越利益剰余金',amount:null}],
   credits:[{label:'売上',amount:780000},{label:'受取手数料',amount:18000}],
   answer:60000,
   exp:'収益合計 (780,000＋18,000)＝798,000<br>費用合計 (480,000＋150,000＋72,000＋36,000)＝738,000<br>当期純利益 ＝ 798,000 − 738,000 ＝ <strong>60,000円</strong>'},
  {title:'損益勘定の当期純損失',account:'損益',
   desc:'以下の損益勘定では費用が収益を上回り、当期純損失が生じています。\n純損失の金額（繰越利益剰余金への振替額）を求めなさい。\n※純損失は損益勘定の貸方に記入します。',
   debits: [{label:'仕入（売上原価）',amount:520000},{label:'給料',amount:180000},{label:'支払家賃',amount:84000},{label:'支払利息',amount:6000}],
   credits:[{label:'売上',amount:680000},{label:'受取利息',amount:4000},{label:'繰越利益剰余金（純損失）',amount:null}],
   answer:106000,
   exp:'費用合計 (520,000＋180,000＋84,000＋6,000)＝790,000<br>収益合計 (680,000＋4,000)＝684,000<br>純損失 ＝ 790,000 − 684,000 ＝ <strong>106,000円</strong><br>費用超過のため純損失となり、損益勘定の<strong>貸方</strong>に繰越利益剰余金として記入します。'},
  {title:'売上勘定の損益振替',account:'売上',
   desc:'期末に売上勘定の残高を損益勘定へ振り替えます。\n損益勘定への振替額（売上の年間合計）を求めなさい。\n（収益科目は期末に借方へ「損益」として振り替えます）',
   debits: [{label:'損益（期末振替）',amount:null}],
   credits:[{label:'売掛金',amount:480000},{label:'現金',amount:280000},{label:'受取手形',amount:140000}],
   answer:900000,
   exp:'売上の貸方合計 (480,000＋280,000＋140,000)＝<strong>900,000円</strong><br>収益科目は期末に借方へ「損益」として振り替え、残高をゼロにします。'},
  {title:'仕入勘定の損益振替（売上原価算定）',account:'仕入',
   desc:'決算整理において売上原価を算定します。\n期首商品50,000円を繰越商品から戻し入れ、期末商品80,000円を繰越商品へ繰り入れた後、仕入勘定の残高（売上原価）を損益勘定へ振り替えます。\n損益振替額を求めなさい。',
   debits: [{label:'繰越商品（期首戻入）',amount:50000},{label:'買掛金',amount:420000},{label:'現金',amount:90000}],
   credits:[{label:'買掛金（返品）',amount:30000},{label:'繰越商品（期末繰入）',amount:80000},{label:'損益（売上原価）',amount:null}],
   answer:450000,
   exp:'借方合計 (50,000＋420,000＋90,000)＝560,000<br>貸方既知計 (30,000＋80,000)＝110,000<br>売上原価 ＝ 560,000 − 110,000 ＝ <strong>450,000円</strong>'},

  // ── 前月繰越あり・複数取引 ──
  {title:'売掛金勘定の次月繰越（返品・貸倒・手形振替）',account:'売掛金',
   desc:'次の売掛金勘定をもとに、次月繰越の金額を求めなさい。\n当期中に売上返品・貸倒れ・受取手形への振替が発生しています。',
   debits: [{label:'前月繰越',amount:120000},{label:'売上',amount:450000},{label:'売上',amount:180000}],
   credits:[{label:'当座預金',amount:300000},{label:'受取手形（振替）',amount:90000},{label:'貸倒損失',amount:30000},{label:'売上返品',amount:15000},{label:'次月繰越',amount:null}],
   answer:315000,
   exp:'借方合計 (120,000＋450,000＋180,000)＝750,000<br>貸方既知計 (300,000＋90,000＋30,000＋15,000)＝435,000<br>次月繰越 ＝ 750,000 − 435,000 ＝ <strong>315,000円</strong>'},
  {title:'買掛金勘定の次月繰越（返品・手形振替）',account:'買掛金',
   desc:'次の買掛金勘定をもとに、次月繰越の金額を求めなさい。\n（負債→貸方残高のため、次月繰越は借方側に記入）',
   debits: [{label:'当座預金',amount:200000},{label:'支払手形（振替）',amount:150000},{label:'仕入返品',amount:25000},{label:'次月繰越',amount:null}],
   credits:[{label:'前月繰越',amount:180000},{label:'仕入',amount:380000},{label:'仕入',amount:70000}],
   answer:255000,
   exp:'貸方合計 (180,000＋380,000＋70,000)＝630,000<br>借方既知計 (200,000＋150,000＋25,000)＝375,000<br>次月繰越 ＝ 630,000 − 375,000 ＝ <strong>255,000円</strong>'},
  {title:'現金勘定の次月繰越（多科目）',account:'現金',
   desc:'次の現金勘定をもとに、次月繰越の金額を求めなさい。',
   debits: [{label:'前月繰越',amount:85000},{label:'売掛金',amount:220000},{label:'受取手数料',amount:45000},{label:'借入金',amount:200000}],
   credits:[{label:'仕入',amount:160000},{label:'給料',amount:175000},{label:'支払家賃',amount:60000},{label:'消耗品費',amount:15000},{label:'次月繰越',amount:null}],
   answer:140000,
   exp:'借方合計 (85,000＋220,000＋45,000＋200,000)＝550,000<br>貸方既知計 (160,000＋175,000＋60,000＋15,000)＝410,000<br>次月繰越 ＝ 550,000 − 410,000 ＝ <strong>140,000円</strong>'},
  {title:'当座預金勘定の次月繰越（複合取引）',account:'当座預金',
   desc:'次の当座預金勘定をもとに、次月繰越の金額を求めなさい。',
   debits: [{label:'前月繰越',amount:350000},{label:'売掛金',amount:400000},{label:'借入金',amount:200000}],
   credits:[{label:'支払手形',amount:180000},{label:'買掛金',amount:290000},{label:'給料',amount:210000},{label:'次月繰越',amount:null}],
   answer:270000,
   exp:'借方合計 (350,000＋400,000＋200,000)＝950,000<br>貸方既知計 (180,000＋290,000＋210,000)＝680,000<br>次月繰越 ＝ 950,000 − 680,000 ＝ <strong>270,000円</strong>'},

  // ── 手形 ──
  {title:'受取手形勘定の次月繰越（裏書・決済）',account:'受取手形',
   desc:'次の受取手形勘定をもとに、次月繰越の金額を求めなさい。\n当期中に手形の裏書譲渡（買掛金の決済に充当）と期日決済が行われています。',
   debits: [{label:'前月繰越',amount:200000},{label:'売掛金',amount:250000},{label:'売上',amount:100000}],
   credits:[{label:'買掛金（裏書譲渡）',amount:120000},{label:'当座預金（期日決済）',amount:230000},{label:'次月繰越',amount:null}],
   answer:200000,
   exp:'借方合計 (200,000＋250,000＋100,000)＝550,000<br>貸方既知計 (120,000＋230,000)＝350,000<br>次月繰越 ＝ 550,000 − 350,000 ＝ <strong>200,000円</strong>'},
  {title:'支払手形勘定の次月繰越（発行・決済）',account:'支払手形',
   desc:'次の支払手形勘定をもとに、次月繰越の金額を求めなさい。\n（負債→貸方残高のため、次月繰越は借方側に記入）',
   debits: [{label:'当座預金（期日決済）',amount:280000},{label:'次月繰越',amount:null}],
   credits:[{label:'前月繰越',amount:150000},{label:'買掛金',amount:200000},{label:'仕入',amount:180000}],
   answer:250000,
   exp:'貸方合計 (150,000＋200,000＋180,000)＝530,000<br>借方 当座預金280,000 を差し引き<br>次月繰越 ＝ 530,000 − 280,000 ＝ <strong>250,000円</strong>'},

  // ── 固定資産・減価償却 ──
  {title:'備品勘定の次月繰越（売却あり）',account:'備品',
   desc:'当期中に備品（取得原価300,000円）を売却しました。\n次の備品勘定をもとに、次月繰越の金額を求めなさい。',
   debits: [{label:'前月繰越',amount:900000},{label:'未払金（新規購入）',amount:400000}],
   credits:[{label:'諸口（売却・取得原価）',amount:300000},{label:'次月繰越',amount:null}],
   answer:1000000,
   exp:'借方合計 (900,000＋400,000)＝1,300,000<br>売却した備品の取得原価 300,000 を差し引き<br>次月繰越 ＝ 1,300,000 − 300,000 ＝ <strong>1,000,000円</strong>'},
  {title:'減価償却累計額の次月繰越（売却による取崩し）',account:'減価償却累計額',
   desc:'期中に備品を売却し、その備品に係る減価償却累計額240,000円を取り崩しました。\n次の勘定をもとに次月繰越を求めなさい。（貸方残高科目）',
   debits: [{label:'備品売却（取崩し）',amount:240000},{label:'次月繰越',amount:null}],
   credits:[{label:'前月繰越',amount:480000},{label:'減価償却費',amount:120000}],
   answer:360000,
   exp:'貸方合計 (480,000＋120,000)＝600,000<br>借方 売却による取崩 240,000 を差し引き<br>次月繰越 ＝ 600,000 − 240,000 ＝ <strong>360,000円</strong>'},
  {title:'借入金勘定の次月繰越（追加借入・返済）',account:'借入金',
   desc:'当期中に新たに資金を借り入れ、また一部を返済しました。\n次の借入金勘定をもとに次月繰越を求めなさい。（負債→貸方残高）',
   debits: [{label:'現金（返済）',amount:200000},{label:'当座預金（返済）',amount:150000},{label:'次月繰越',amount:null}],
   credits:[{label:'前月繰越',amount:400000},{label:'現金（借入）',amount:300000},{label:'当座預金（借入）',amount:100000}],
   answer:450000,
   exp:'貸方合計 (400,000＋300,000＋100,000)＝800,000<br>借方既知計 (200,000＋150,000)＝350,000<br>次月繰越 ＝ 800,000 − 350,000 ＝ <strong>450,000円</strong>'},

  // ── 決算整理（経過勘定・引当金） ──
  {title:'繰越商品勘定の次月繰越（売上原価算定）',account:'繰越商品',
   desc:'決算整理において仕入勘定を使い売上原価を算定します。\n次の繰越商品勘定をもとに、次月繰越（期末商品棚卸高）を求めなさい。',
   debits: [{label:'前月繰越（期首商品）',amount:50000},{label:'仕入（期末商品繰入）',amount:75000}],
   credits:[{label:'仕入（期首商品戻入）',amount:50000},{label:'次月繰越',amount:null}],
   answer:75000,
   exp:'借方合計 (50,000＋75,000)＝125,000<br>貸方 仕入戻入50,000 を差し引き<br>次月繰越 ＝ 125,000 − 50,000 ＝ <strong>75,000円</strong>（期末商品棚卸高）'},
  {title:'貸倒引当金の次月繰越（実績あり・追加設定）',account:'貸倒引当金',
   desc:'期中に売掛金20,000円が貸し倒れ、引当金を取り崩しました。\nまた期末に引当金を30,000円追加設定しました。次月繰越を求めなさい。',
   debits: [{label:'売掛金（貸倒）',amount:20000},{label:'次月繰越',amount:null}],
   credits:[{label:'前月繰越',amount:40000},{label:'貸倒引当金繰入',amount:30000}],
   answer:50000,
   exp:'貸方合計 (40,000＋30,000)＝70,000<br>借方 貸倒実績 20,000 を差し引き<br>次月繰越 ＝ 70,000 − 20,000 ＝ <strong>50,000円</strong>'},
  {title:'前払保険料の月割計算',account:'支払保険料',
   desc:'8月1日に向こう1年分の火災保険料120,000円を現金で支払った。決算日は12月31日。\n翌年1月〜7月（7ヶ月分）を前払費用として振り替える金額を求めなさい。\n（1年＝12ヶ月で月割計算）',
   debits: [{label:'現金（年払い）',amount:120000}],
   credits:[{label:'前払費用（翌期7ヶ月分）',amount:null}],
   answer:70000,
   exp:'月割額：120,000 ÷ 12 ＝ 10,000円/月<br>当期分（8〜12月）5ヶ月：10,000×5＝50,000円<br>翌期分（1〜7月）7ヶ月：10,000×7＝<strong>70,000円</strong>'},
  {title:'未払利息の月割計上',account:'支払利息',
   desc:'10月1日に3,000,000円を年利2.4%で借り入れた。決算日は12月31日。\n借入日から3ヶ月分の利息が未払いのため未払費用として決算整理する。\n計上する未払利息の金額を求めなさい。（1年＝12ヶ月）',
   debits: [{label:'未払費用（3ヶ月分）',amount:null}],
   credits:[],
   answer:18000,
   exp:'月利：3,000,000 × 2.4% ÷ 12 ＝ 6,000円/月<br>3ヶ月分：6,000 × 3 ＝ <strong>18,000円</strong>'},
  {title:'未収利息の月割計上',account:'受取利息',
   desc:'7月1日に1,200,000円を年利3%で貸し付けた（返済は翌年6月末）。決算日は12月31日。\n7〜12月の6ヶ月分の利息がまだ入金されておらず未収収益として計上する。\n計上する未収利息の金額を求めなさい。（1年＝12ヶ月）',
   debits: [{label:'未収収益（6ヶ月分）',amount:null}],
   credits:[],
   answer:18000,
   exp:'月利：1,200,000 × 3% ÷ 12 ＝ 3,000円/月<br>6ヶ月分：3,000 × 6 ＝ <strong>18,000円</strong>'},
  {title:'損益勘定から繰越利益剰余金を算定',account:'繰越利益剰余金',
   desc:'当期の損益勘定：収益（売上750,000・受取利息15,000）、費用（仕入380,000・給料180,000・支払家賃96,000・減価償却費44,000）。\n前期末の繰越利益剰余金は120,000円。当期純利益を計算したうえで、当期末の繰越利益剰余金の残高を求めなさい。',
   debits: [{label:'次月繰越',amount:null}],
   credits:[{label:'前月繰越',amount:120000}],
   answer:185000,
   exp:'収益合計：750,000＋15,000＝765,000円<br>費用合計：380,000＋180,000＋96,000＋44,000＝700,000円<br>当期純利益：765,000－700,000＝65,000円<br>繰越利益剰余金：120,000＋65,000＝<strong>185,000円</strong>'},

  // ── 不明金額の逆算 ──
  {title:'当座預金の不明金額（買掛金支払額を逆算）',account:'当座預金',
   desc:'次の当座預金勘定において、貸方の（　）にあてはまる買掛金の支払額を求めなさい。',
   debits: [{label:'前月繰越',amount:500000},{label:'売掛金',amount:380000},{label:'借入金',amount:300000}],
   credits:[{label:'買掛金',amount:null},{label:'支払手形',amount:220000},{label:'給料',amount:250000},{label:'次月繰越',amount:380000}],
   answer:330000,
   exp:'借方合計 (500,000＋380,000＋300,000)＝1,180,000<br>貸方既知計 (220,000＋250,000＋380,000)＝850,000<br>買掛金支払額 ＝ 1,180,000 − 850,000 ＝ <strong>330,000円</strong>'},
  {title:'売掛金の不明金額（売上額を逆算）',account:'売掛金',
   desc:'次の売掛金勘定において、借方の（　）にあてはまる売上の金額を求めなさい。',
   debits: [{label:'前月繰越',amount:200000},{label:'売上',amount:null}],
   credits:[{label:'当座預金',amount:350000},{label:'受取手形（振替）',amount:80000},{label:'売上返品',amount:20000},{label:'次月繰越',amount:250000}],
   answer:500000,
   exp:'貸方合計 (350,000＋80,000＋20,000＋250,000)＝700,000<br>借方 前月繰越200,000 を差し引き<br>売上 ＝ 700,000 − 200,000 ＝ <strong>500,000円</strong>'},

  // ── 補助簿系 ──
  {title:'得意先元帳（A商店）の月末残高',account:'売掛金（A商店）',
   desc:'売掛金元帳（得意先元帳）は得意先ごとの売掛金内訳を管理する補助元帳です。\n次のA商店との記録をもとに、月末残高を求めなさい。',
   debits:[{label:'前月繰越',amount:80000},{label:'売上',amount:150000},{label:'売上',amount:60000}],
   credits:[{label:'当座預金（回収）',amount:120000},{label:'売上返品',amount:10000},{label:'次月繰越',amount:null}],
   answer:160000,
   exp:'借方合計 (80,000＋150,000＋60,000)＝290,000<br>貸方既知計 (120,000＋10,000)＝130,000<br>月末残高 ＝ 290,000 − 130,000 ＝ <strong>160,000円</strong>'},
  {title:'仕入先元帳（B商店）の月末残高',account:'買掛金（B商店）',
   desc:'買掛金元帳（仕入先元帳）は仕入先ごとの買掛金内訳を管理する補助元帳です。\n次のB商店との記録をもとに、月末残高（貸方残高）を求めなさい。',
   debits:[{label:'当座預金（支払）',amount:150000},{label:'仕入返品',amount:15000},{label:'次月繰越',amount:null}],
   credits:[{label:'前月繰越',amount:80000},{label:'仕入',amount:220000}],
   answer:135000,
   exp:'貸方合計 (80,000＋220,000)＝300,000<br>借方既知計 (150,000＋15,000)＝165,000<br>月末残高 ＝ 300,000 − 165,000 ＝ <strong>135,000円</strong>'},
  {title:'商品有高帳（先入先出法）の月末在庫',account:'商品有高帳',
   desc:'先入先出法で管理するA商品の当月取引：\n①月初在庫：20個 @400円＝8,000円\n②仕入：30個 @500円＝15,000円\n③払出：25個（先入先出法）\n   月初20個(@400円)＋5個(@500円)＝9,500円を払出\n\n月末在庫の金額を求めなさい。',
   debits:[{label:'月初在庫（20個@400円）',amount:8000},{label:'仕入（30個@500円）',amount:15000}],
   credits:[{label:'払出（先入先出法）',amount:9500},{label:'月末在庫',amount:null}],
   answer:13500,
   exp:'受入合計：8,000＋15,000＝23,000円<br>払出（先入先出法）：月初20個×400円＋5個×500円＝8,000＋2,500＝9,500円<br>月末在庫：23,000－9,500＝<strong>13,500円</strong>（残り25個@500円）'},
  {title:'商品有高帳（移動平均法）の月末在庫',account:'商品有高帳',
   desc:'移動平均法で管理するB商品の当月取引：\n①月初在庫：100個 @300円＝30,000円\n②仕入：100個 @400円＝40,000円\n　（仕入後の移動平均単価：70,000÷200個＝350円）\n③払出：150個 @350円＝52,500円\n\n月末在庫の金額を求めなさい。',
   debits:[{label:'月初在庫（100個@300円）',amount:30000},{label:'仕入（100個@400円）',amount:40000}],
   credits:[{label:'払出（150個@350円）',amount:52500},{label:'月末在庫',amount:null}],
   answer:17500,
   exp:'受入合計：30,000＋40,000＝70,000円<br>移動平均単価：70,000÷200個＝350円/個<br>払出：150個×350円＝52,500円<br>月末在庫：70,000－52,500＝<strong>17,500円</strong>（50個@350円）'},
  {title:'小口現金出納帳の月次補充額',account:'小口現金',
   desc:'定額補充制度（定額50,000円）。当月の小口現金支払：\n・交通費：9,000円\n・消耗品費：6,000円\n・通信費：4,000円\n・雑費：2,000円\n月末に当座預金から定額まで補充した。補充額を求めなさい。',
   debits:[{label:'前月繰越',amount:50000},{label:'当座預金（補充）',amount:null}],
   credits:[{label:'交通費',amount:9000},{label:'消耗品費',amount:6000},{label:'通信費',amount:4000},{label:'雑費',amount:2000},{label:'次月繰越',amount:50000}],
   answer:21000,
   exp:'貸方合計：9,000＋6,000＋4,000＋2,000＋50,000＝71,000円<br>借方 前月繰越50,000 を差し引き<br>補充額 ＝ 71,000 − 50,000 ＝ <strong>21,000円</strong><br>使った分（21,000円）だけ補充して定額50,000円に戻します。'},
  {title:'受取手形記入帳の月末未決済残高',account:'受取手形',
   desc:'受取手形記入帳の当月記録：\n①A社振出：250,000円を受取\n②B社振出：180,000円を受取\n③C社振出：120,000円を受取\n④A社手形250,000円が期日に当座預金へ入金（決済済み）\n⑤B社手形180,000円を買掛金支払のため裏書譲渡\n\n月末時点の未決済手形（自社保有中）の合計金額を求めなさい。',
   debits:[{label:'A社（受取）',amount:250000},{label:'B社（受取）',amount:180000},{label:'C社（受取）',amount:120000}],
   credits:[{label:'A社（期日決済）',amount:250000},{label:'B社（裏書譲渡）',amount:180000},{label:'月末未決済残高',amount:null}],
   answer:120000,
   exp:'受取合計：250,000＋180,000＋120,000＝550,000円<br>減少計：250,000（決済）＋180,000（裏書譲渡）＝430,000円<br>未決済残高 ＝ 550,000 − 430,000 ＝ <strong>120,000円</strong>（C社手形のみ）'},

  // ── 計算式が必要な問題 ──
  {title:'定額法による年間減価償却費',account:'減価償却費',
   desc:'備品（取得原価1,200,000円・残存価額ゼロ・耐用年数5年）を定額法で償却中。\n今期の年間減価償却費を計上する。\n「減価償却費」の金額を求めなさい。',
   debits: [{label:'減価償却累計額',amount:null}],
   credits:[],
   answer:240000,
   exp:'定額法：1,200,000 ÷ 5年 ＝ <strong>240,000円</strong>/年'},
  {title:'固定資産売却損の計算',account:'固定資産売却損',
   desc:'備品（取得原価800,000円・減価償却累計額500,000円）を現金180,000円で売却した。\n帳簿価額（取得原価－累計額）と売却代金の差額が売却損となる。\n「固定資産売却損」の金額を求めなさい。',
   debits: [{label:'諸口（帳簿価額と売却代金の差）',amount:null}],
   credits:[],
   answer:120000,
   exp:'帳簿価額：800,000－500,000＝300,000円<br>売却損：300,000－180,000（売却代金）＝<strong>120,000円</strong>'},
  {title:'貸倒引当金繰入額（差額補充法）',account:'貸倒引当金',
   desc:'期末の売掛金残高600,000円に対し2%の貸倒引当金を差額補充法で設定する。\n前期末の引当金残高は5,000円だった。\n当期の「貸倒引当金繰入」の金額を求めなさい。',
   debits: [{label:'次月繰越',amount:12000}],
   credits:[{label:'前月繰越',amount:5000},{label:'貸倒引当金繰入',amount:null}],
   answer:7000,
   exp:'設定目標額：600,000×2%＝12,000円<br>前期末残高：5,000円<br>繰入額（差額）：12,000－5,000＝<strong>7,000円</strong>'},
  {title:'期中取得備品の月割減価償却費',account:'減価償却費',
   desc:'7月1日に備品960,000円を購入した（残存価額ゼロ・耐用年数4年・定額法）。決算日は3月31日のため当期分は9ヶ月を月割計算で計上する。\n当期の「減価償却費」を求めなさい。',
   debits: [{label:'減価償却累計額（月割9ヶ月分）',amount:null}],
   credits:[],
   answer:180000,
   exp:'年間償却額：960,000 ÷ 4年 ＝ 240,000円<br>月割（9ヶ月）：240,000 × 9 ÷ 12 ＝ <strong>180,000円</strong>'},
];

let _ldgIdx=-1;

function initLedgerTab(){
  if(_ldgIdx===-1)nextLedgerProblem();
}

function nextLedgerProblem(){
  const len=LEDGER_PROBLEMS.length;
  let idx;
  do{idx=Math.floor(Math.random()*len);}while(idx===_ldgIdx&&len>1);
  _ldgIdx=idx;
  _renderLedgerProblem();
}

function _renderLedgerProblem(){
  const p=LEDGER_PROBLEMS[_ldgIdx];
  const el=document.getElementById('ledger-content');
  const maxR=Math.max(p.debits.length,p.credits.length);
  let rows='';
  for(let i=0;i<maxR;i++){
    const d=p.debits[i]||{label:'',amount:''};
    const c=p.credits[i]||{label:'',amount:''};
    const dA=d.amount===null
      ?'<input type="number" id="ledgerAns" class="ldg-ans-inp" placeholder="?" inputmode="numeric">'
      :(d.amount!==''?Number(d.amount).toLocaleString():'');
    const cA=c.amount===null
      ?'<input type="number" id="ledgerAns" class="ldg-ans-inp" placeholder="?" inputmode="numeric">'
      :(c.amount!==''?Number(c.amount).toLocaleString():'');
    rows+=`<tr>
      <td class="ldg-lbl">${d.label||''}</td>
      <td class="ldg-num">${dA}</td>
      <td class="ldg-bar"></td>
      <td class="ldg-num">${cA}</td>
      <td class="ldg-lbl ldg-lbl-r">${c.label||''}</td>
    </tr>`;
  }
  el.innerHTML=`
    <div class="ldg-card">
      <div class="ldg-meta">問題 ${_ldgIdx+1}／${LEDGER_PROBLEMS.length} — ${p.title}</div>
      <p class="ldg-desc">${p.desc.replace(/\n/g,'<br>')}</p>
      <div class="ldg-tbl-wrap">
        <div class="ldg-acct-name">${p.account}</div>
        <table class="ldg-tbl">
          <thead><tr>
            <th class="ldg-lbl">摘要</th><th class="ldg-num">借方</th>
            <th class="ldg-bar"></th>
            <th class="ldg-num">貸方</th><th class="ldg-lbl ldg-lbl-r">摘要</th>
          </tr></thead>
          <tbody>${rows}</tbody>
        </table>
      </div>
      <div id="ldg-result" class="ldg-result" style="display:none"></div>
      <div class="ldg-btns">
        <button class="ldg-check-btn" id="ldgCheckBtn" onclick="checkLedger()">答え合わせ</button>
        <button class="ldg-next-btn" onclick="nextLedgerProblem()">次の問題 →</button>
      </div>
    </div>`;
}

async function checkLedger(){
  const p=LEDGER_PROBLEMS[_ldgIdx];
  const inp=document.getElementById('ledgerAns');
  const res=document.getElementById('ldg-result');
  const btn=document.getElementById('ldgCheckBtn');
  if(!inp||!res)return;
  const val=parseInt(inp.value.replace(/,/g,''));
  if(isNaN(val)){
    res.textContent='数値を入力してください';
    res.className='ldg-result ldg-ng';
    res.style.display='block';
    return;
  }
  const isOk=val===p.answer;
  if(isOk){
    res.innerHTML='✅ 正解！<br>'+p.exp;
    res.className='ldg-result ldg-ok';
  }else{
    res.innerHTML=`❌ 不正解。正解は <strong>${p.answer.toLocaleString()}円</strong> です。<br><br>${p.exp}`;
    res.className='ldg-result ldg-ng';
  }
  res.style.display='block';
  inp.disabled=true;
  btn.disabled=true;
  await recordResult('総勘定元帳',isOk);
}

init();
