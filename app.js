const app = document.querySelector('#app');
const toast = document.querySelector('#toast');
const STORAGE_KEY = 'jinhan-quest-v2';
const defaultState = { name: '', completed: [], photo: false, qrUnlocked: [], awardCommentIndex: null, awardCompletedAt: '' };
const qrConfig = window.JINHAN_QR_LOCKS || { requiredStages: [2, 3, 4, 5], hashes: {} };
const qrRequiredStages = new Set(qrConfig.requiredStages || [2, 3, 4, 5]);
let state = loadState();
let route = 'home';
let qrTargetStage = null;
let qrScanner = null;
let qrScannerRunning = false;
let qrBusy = false;
let harvest = { score: 0, time: 20, timer: null };
let photoImage = null;
let photoEffect = 'golden';
const photoFrameImages = {};
const photoFramePromises = {};
let varietyIndex = 0;
let peel = { mask: null, progressMask: null, image: null, coverImage: null, initialAlpha: 0, drawing: false, last: null, assistStep: 0, progress: 0, complete: false, ready: false, error: '' };
let peelRunId = 0;
let drying = { round: 0, dryness: 15, quality: 5, answered: false, finished: false };
const dryingScenarioPool = [
  { kind: 'wind', time: '上午', title: '陽光溫和，東北季風從海面吹來', desc: '乾爽的九降風正吹進新埔，削皮柿適合開始第一輪乾燥。', correct: 'outside', gain: 20, fact: '新竹秋季的九降風來自東北季風；日曬加上乾爽風力，能幫助柿子穩定脫水。' },
  { kind: 'turn', time: '清晨', title: '果實開始變軟，兩面顏色不均', desc: '朝上的一面較乾，接觸網盤的一面仍保留較多水分。', correct: 'turn', gain: 18, fact: '翻面並輕壓整形，可讓水分慢慢往外移動，也能讓果實均勻轉成飽滿柔軟的爆漿柿餅。' },
  { kind: 'rain', time: '午後', title: '烏雲聚集，雨滴開始落下', desc: '空氣濕度快速升高；柿子若淋到雨、表面持續受潮，容易發霉或腐敗。', correct: 'shelter', gain: 5, fact: '遇雨要立刻收進棚內，避免淋雨與持續受潮；等環境恢復乾爽後，再繼續進行乾燥。' },
  { kind: 'wind', time: '雨後上午', title: '雨停轉晴，九降風再次吹起', desc: '天空放晴，東北季風帶來的空氣重新變得乾爽。', correct: 'outside', gain: 21, fact: '確認雨停、環境乾爽後，再移回戶外繼續日曬風乾。' },
  { kind: 'turn', time: '清晨', title: '果肉仍有水分，外形飽滿但略皺', desc: '這是接近爆漿柿餅的中段狀態，需要繼續整理形狀與乾燥。', correct: 'turn', gain: 18, fact: '重複翻面並輕壓整形，可整理出柔軟飽滿的樣子；此時仍有較多水分，還不是最後成品。' },
  { kind: 'bird', time: '上午', title: '五色鳥飛到曬架旁，準備偷吃', desc: '新竹縣縣鳥五色鳥也喜歡成熟柿子的香甜，正靠近網盤。', correct: 'bird', gain: 8, fact: '要溫和趕鳥並保護曬盤。五色鳥是新竹縣縣鳥，常以果實為食，也是農園生態的一員。' },
  { kind: 'humid', time: '傍晚', title: '陽光變弱，晚間濕氣逐漸升高', desc: '風勢減弱，繼續留在戶外可能讓表面回潮。', correct: 'shelter', gain: 6, fact: '傍晚濕度升高時收進棚內，可降低回潮與品質不穩定的風險。' },
  { kind: 'wind', time: '最後上午', title: '最後一輪東北季風，天氣乾爽', desc: '柿餅已轉為漂亮的金橘色，只差最後一段自然風乾。', correct: 'outside', gain: 20, fact: '掌握最後的日曬與九降風，讓台灣柿餅保持金橘色、柔軟而不過度乾黑。' }
];
let dryingScenarios = buildDryingSequence();

function buildDryingSequence() {
  const bird = dryingScenarioPool.find(s => s.kind === 'bird');
  const others = dryingScenarioPool.filter(s => s.kind !== 'bird').sort(() => Math.random() - .5).slice(0, 5);
  const selected = [bird, ...others];
  const arrange = (remaining, result = []) => {
    if (!remaining.length) return result;
    const choices = remaining.map((item,index) => ({ item,index })).sort(() => Math.random() - .5);
    for (const choice of choices) {
      if (result.length && result[result.length - 1].kind === choice.item.kind) continue;
      const next = [...remaining]; next.splice(choice.index,1);
      const solved = arrange(next,[...result,choice.item]);
      if (solved) return solved;
    }
    return null;
  };
  return arrange(selected).map(item => ({ ...item }));
}

const stages = [
  { id: 1, title: '柿餅在哪裡加工？', desc: '認識柿餅的家鄉', icon: '🧭' },
  { id: 2, title: '採收好柿子', desc: '眼明手快採成熟果實', icon: '🧺' },
  { id: 3, title: '旋轉削皮', desc: '體驗老師傅的好手藝', icon: '🌀' },
  { id: 4, title: '九降風曬柿餅', desc: '掌握陽光、風與時間', icon: '🌬️' },
  { id: 5, title: '柿子小學堂', desc: '完成五題，成為小小懂柿長', icon: '🔎' },
  { id: 6, title: '好柿留影', desc: '留下今日農園回憶', icon: '📷' }
];
const awardComments = [
  '一顆柿餅的完成，連結了產地、季節、農人與餐桌，這就是食農教育最真實的一課。',
  '從採收到加工，你已認識新埔柿餅從土地走向餐桌的旅程。',
  '看懂柿子的品種與加工方式，也更懂得珍惜在地農產與農人手藝。',
  '跟著九降風學做柿餅，也把新埔的風土與飲食文化一起帶回家。',
  '太陽、東北季風與濕度共同影響柿餅；觀察自然，就是環境教育的開始。',
  '懂得看天、看風、看果實，就是學習與環境共生的農業智慧。',
  '五色鳥、柿子與農園共享同一片土地，友善守護才能讓生態長久延續。',
  '大墩山的地形、九降風的氣候與農人的經驗，共同成就新埔柿餅。',
  '從金黃柿海看見的，不只是風景，更是土地、農村文化與季節變化。',
  '選擇在地、認識產季、珍惜食物，從一顆柿子開始實踐永續生活。',
  '每一道農產加工，都藏著減少浪費、延長保存與善用自然資源的智慧。',
  '每一顆金黃柿餅，都是陽光、九降風與農人共同完成的風土作品。'
];
const varietyQuestionPool = [
  {
    question: '新埔製作柿餅的主要品種是哪一組？',
    answers: ['富有、次郎、花御所', '牛心柿、石柿、筆柿', '四周柿、蘋果柿、甜柿'],
    correct: 1,
    correctFeedback: '答對了！新埔柿餅常用牛心柿、石柿與筆柿，各自呈現不同的加工特色。',
    wrongFeedback: '答錯了。正確答案是「牛心柿、石柿、筆柿」；這三種都是新埔常見的柿餅加工品種。'
  },
  {
    question: '哪一種柿子因為外形像牛的心臟而得名？',
    answers: ['牛心柿', '石柿', '筆柿'],
    correct: 0,
    correctFeedback: '答對了！牛心柿的果形像牛的心臟，因此得名。',
    wrongFeedback: '答錯了。正確答案是「牛心柿」；它因為果形像牛的心臟而得名。'
  },
  {
    question: '哪一種柿子果實較小、質地細、纖維少，很適合製作柿餅？',
    answers: ['富有甜柿', '四周柿', '石柿'],
    correct: 2,
    correctFeedback: '答對了！石柿果實較小、質地細且纖維少，很適合製作柿餅。',
    wrongFeedback: '答錯了。正確答案是「石柿」；它雖然果實較小，卻是製作柿餅的優良品種。'
  },
  {
    question: '一般浸泡製成水柿的品種是？',
    answers: ['牛心柿', '石柿', '筆柿', '四周柿'],
    correct: 0,
    correctFeedback: '答對了！牛心柿含水量較高，製成水柿後口感較脆。',
    wrongFeedback: '答錯了。正確答案是「牛心柿」；它含水量較高，製成水柿後口感較脆。'
  },
  {
    question: '適合催熟成紅柿的品種是？',
    answers: ['石柿、四周柿', '牛心柿、筆柿', '富有甜柿、次郎甜柿', '筆柿、牛心柿'],
    correct: 0,
    correctFeedback: '答對了！石柿與四周柿肉質較細緻，催熟成紅柿後口感較綿密。',
    wrongFeedback: '答錯了。正確答案是「石柿、四周柿」；這兩種柿子的肉質較細緻，適合催熟成紅柿。'
  },
  {
    question: '筆柿最明顯的外型特色是什麼？',
    answers: ['外型橢圓，形似毛筆筆尖', '外型扁平，像一顆南瓜', '果實呈明顯心形', '果實細小而完全無籽'],
    correct: 0,
    correctFeedback: '答對了！筆柿外型橢圓，形似毛筆筆尖，是由日本引進後再加以改良的品種。',
    wrongFeedback: '答錯了。筆柿最明顯的特色是「外型橢圓，形似毛筆筆尖」。'
  },
  {
    question: '未經處理的新鮮柿子吃起來通常有什麼感覺？',
    answers: ['夭壽澀（甜柿除外）', '像檸檬一樣酸', '像辣椒一樣辣', '完全沒有味道'],
    correct: 0,
    correctFeedback: '答對了！未經處理的澀柿真的會「夭壽澀」；甜柿除外。',
    wrongFeedback: '答錯了。未經處理的澀柿會有強烈澀感；柿子中的單寧與口腔蛋白質作用後，會產生收斂乾澀的感覺。'
  },
  {
    question: '柿子的主要產季是什麼時候？',
    answers: ['秋冬之際（9月～隔年1月）', '春季（2月～4月）', '初夏（5月～6月）', '全年都一樣多'],
    correct: 0,
    correctFeedback: '答對了！柿子主要在秋冬之際成熟，產季約從9月延續到隔年1月。',
    wrongFeedback: '答錯了。正確答案是「秋冬之際（9月～隔年1月）」；中秋節前後，柿子也即將陸續成熟。'
  },
  {
    question: '「澀」是感覺，還是味覺？',
    answers: ['感覺', '味覺', '嗅覺', '聽覺'],
    correct: 0,
    correctFeedback: '答對了！澀不是基本味覺，而是口腔產生的收斂、乾澀感。',
    wrongFeedback: '答錯了。正確答案是「感覺」；單寧與唾液蛋白作用後，會讓口腔產生收斂與乾澀感。'
  }
];
const VARIETY_QUESTION_COUNT = 5;
function buildVarietyQuestions() {
  const shuffled = [...varietyQuestionPool];
  for (let i=shuffled.length-1;i>0;i-=1) {
    const j=Math.floor(Math.random()*(i+1)); [shuffled[i],shuffled[j]]=[shuffled[j],shuffled[i]];
  }
  return shuffled.slice(0,VARIETY_QUESTION_COUNT);
}
let varietyQuestions = buildVarietyQuestions();

function loadState() {
  try {
    const current = localStorage.getItem(STORAGE_KEY);
    if (current) {
      const saved = { ...defaultState, ...JSON.parse(current) };
      saved.completed = [...new Set((saved.completed || []).map(Number).filter(id => id >= 1 && id <= 6))];
      saved.qrUnlocked = [...new Set((saved.qrUnlocked || []).map(Number).filter(id => qrRequiredStages.has(id)))];
      return saved;
    }
    const old = JSON.parse(localStorage.getItem('jinhan-quest-v1') || '{}');
    return { ...defaultState, name: old.name || '', completed: (old.completed || []).filter(id => id <= 4), qrUnlocked: [] };
  }
  catch { return { ...defaultState }; }
}
function saveState() { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); }
function awardHash(value) {
  let hash = 2166136261;
  for (const char of value) { hash ^= char.codePointAt(0); hash = Math.imul(hash, 16777619); }
  return hash >>> 0;
}
function complete(id) {
  if (!state.completed.includes(id)) state.completed.push(id);
  if (id === 6 && !Number.isInteger(state.awardCommentIndex)) {
    state.awardCompletedAt = new Date().toISOString();
    state.awardCommentIndex = awardHash(`${state.name}|${state.awardCompletedAt.slice(0,10)}`) % awardComments.length;
  }
  saveState();
}
function isSequenceReady(id) { return id === 1 || state.completed.includes(id - 1); }
function isQrUnlocked(id) { return !qrRequiredStages.has(id) || state.qrUnlocked.includes(id) || state.completed.includes(id); }
function isUnlocked(id) { return isSequenceReady(id) && isQrUnlocked(id); }
function openStage(id) {
  if (!isSequenceReady(id)) return notify('請先完成上一關，再前往這個地點。');
  if (!isQrUnlocked(id)) {
    qrTargetStage = id;
    return navigate('qr');
  }
  navigate(`stage${id}`);
}
function go(next) {
  const match = /^stage([1-6])$/.exec(next);
  if (match) return openStage(Number(match[1]));
  navigate(next);
}
function navigate(next) {
  clearInterval(harvest.timer);
  if (route === 'qr' && next !== 'qr') void stopQrScanner();
  route = next;
  window.scrollTo({ top: 0, behavior: 'smooth' });
  render();
}
function notify(message) { toast.textContent = message; toast.classList.add('show'); setTimeout(() => toast.classList.remove('show'), 1800); }
function topbar(back = 'map') { return `<header class="topbar"><div class="brand-mini"><span class="brand-fruit" aria-hidden="true"></span>金漢・九降風柿旅</div>${back ? `<button class="icon-btn" data-go="${back}" aria-label="返回">←</button>` : ''}</header>`; }
function action(label, target, secondary = false) { return `<button class="btn ${secondary ? 'btn-secondary' : 'btn-primary'}" data-go="${target}">${label}</button>`; }

function home() {
  return `<section class="screen">${topbar('')}<div class="hero"><div class="hero-orchard"><img src="assets/cover-drying-yard.webp" alt="一墩接著一墩的大墩山連峰，以及金漢柿餅金黃曬場" fetchpriority="high"></div><p class="eyebrow">新竹新埔・大墩山的九降風</p><h1>跟著風<br>去做柿餅</h1><p class="hero-copy">闖過六道體驗關卡，認識一顆柿子如何在陽光與九降風中，變成甜蜜的金黃柿餅。</p><div class="stack">${action(state.name ? `繼續冒險，${escapeHtml(state.name)}` : '開始遊戲', state.name ? 'map' : 'name')}${state.name ? `<button class="btn btn-secondary" id="restart">重新開始</button>` : ''}</div></div></section>`;
}
function nameScreen() {
  return `<section class="screen">${topbar('home')}<div class="hero"><div class="card"><p class="eyebrow">冒險準備</p><h2>小小柿農，你叫什麼名字？</h2><p class="hero-copy">完成闖關後，名字會出現在你的好柿達人證書上。</p><form id="name-form" class="stack"><div><label class="label" for="nickname">玩家暱稱</label><input class="text-input" id="nickname" maxlength="12" autocomplete="nickname" placeholder="例如：小柿子" value="${escapeHtml(state.name)}" required><div class="hint">最多 12 個字，不需填真實姓名。</div></div><button class="btn btn-primary" type="submit">出發闖關 →</button></form></div></div></section>`;
}
function mapScreen() {
  const pct = state.completed.length / 6 * 100;
  const stageCards = stages.map(s => {
    const completed = state.completed.includes(s.id);
    const sequenceReady = isSequenceReady(s.id);
    const qrLocked = sequenceReady && qrRequiredStages.has(s.id) && !isQrUnlocked(s.id);
    const classes = ['stage-card', completed ? 'complete' : '', qrLocked ? 'qr-ready' : ''].filter(Boolean).join(' ');
    const status = completed ? '✓' : qrLocked ? '<span class="stage-qr-label">掃碼</span>' : sequenceReady ? '›' : '🔒';
    const desc = qrLocked ? `📍 到達指定位置，掃描第 ${s.id} 關 QR Code` : s.desc;
    return `<button class="${classes}" data-stage="${s.id}" ${sequenceReady ? '' : 'disabled'}><span class="stage-no">${s.id}</span><span><span class="stage-title">${s.icon} ${s.title}</span><span class="stage-desc">${desc}</span></span><span class="stage-state">${status}</span></button>`;
  }).join('');
  return `<section class="screen">${topbar('home')}<div class="page-head"><p class="eyebrow">金黃柿海冒險地圖</p><h2>${escapeHtml(state.name)}，來探索柿餅好吃的祕密吧！</h2><p>依序完成六關；第二至第五關需到指定位置掃描 QR Code。</p></div><div class="progress-summary"><div class="progress-track"><div class="progress-fill" style="width:${pct}%"></div></div><strong>${state.completed.length}/6</strong></div><div class="stage-list">${stageCards}</div>${state.completed.length === 6 ? action('前往完成頁', 'end') : ''}</section>`;
}
function qrUnlockScreen() {
  const stage = stages.find(item => item.id === qrTargetStage);
  if (!stage) return mapScreen();
  const secureNotice = window.isSecureContext
    ? '相機只會用來辨識現場 QR Code，不會拍照或上傳影像。'
    : '目前不是 HTTPS，手機瀏覽器可能封鎖相機；可先用下方相簿選圖測試。';
  return `<section class="screen">${topbar('map')}<div class="page-head"><p class="eyebrow">第 ${stage.id} 關・現場解鎖</p><h2>掃描指定位置的 QR Code</h2><p>找到「${stage.title}」的現場標示後再掃描，成功就會自動進入關卡。</p></div><div class="card qr-card"><div class="qr-stage-badge"><span>${stage.id}</span><div><strong>${stage.title}</strong><small>上一關已完成，等待現場驗證</small></div></div><div id="qr-reader" class="qr-reader" aria-label="QR Code 相機預覽"></div><div id="qr-status" class="qr-status" role="status" aria-live="polite">${secureNotice}</div><div class="stack qr-actions"><button id="qr-camera-start" class="btn btn-primary">開啟相機掃描</button><label class="btn btn-secondary qr-file-button" for="qr-file-input">從相簿選擇 QR 圖片</label><input id="qr-file-input" class="visually-hidden" type="file" accept="image/*"><button class="btn btn-secondary" data-go="map">先回到地圖</button></div><div class="qr-help"><strong>掃不到時請檢查：</strong><span>允許瀏覽器使用相機、鏡頭擦乾淨、QR Code 完整入鏡，並保持約 15～30 公分距離。</span></div></div></section>`;
}
function quiz() {
  return `<section class="screen">${topbar()}<div class="page-head"><p class="eyebrow">第一關・產地問答</p><h2>柿餅在哪裡加工的？</h2><p>柿餅的風土，從認識家鄉開始。</p></div><div class="card"><div class="question">你現在位於哪一個縣市／鄉鎮？</div><div class="answers">${['苗栗縣／公館鄉','新竹縣／新埔鎮','台中市／新社區','嘉義縣／番路鄉'].map((a,i) => `<button class="answer" data-answer="${i}">${String.fromCharCode(65+i)}　${a}</button>`).join('')}</div><div id="feedback" class="feedback"></div><button id="quiz-next" class="btn btn-primary" hidden>完成第一關 →</button></div></section>`;
}
function harvestScreen() {
  return `<section class="screen">${topbar()}<div class="page-head"><p class="eyebrow">第二關・採收體驗</p><h2>採下 8 顆成熟柿子</h2><p>20 秒內找出橘紅色柿子。小心別把葉子或蟲子放進籃子！</p></div><div class="game-hud"><span>🧺 <b id="score">0</b>/8 顆</span><span>⏱️ <b id="time">20</b> 秒</span></div><div id="orchard" class="orchard-game"><div class="basket" aria-hidden="true"></div></div><button id="harvest-start" class="btn btn-primary" style="margin-top:14px">開始採收</button></section>`;
}
function peelScreen() {
  return `<section class="screen">${topbar()}<div class="page-head"><p class="eyebrow">第三關・削皮體驗</p><h2>旋轉削出一顆好柿子</h2><p>用手指沿著柿子表面來回滑動，均勻削去外皮。</p></div><div class="peel-board"><canvas id="peel-canvas" class="peel-canvas" width="600" height="600" aria-label="柿子削皮觸控區"></canvas><div id="peel-tip" class="peel-tip">從外圈開始，慢慢往中心削</div></div><div class="peel-meter"><div class="progress-track"><div id="peel-fill" class="progress-fill" style="width:0%"></div></div><span id="peel-status" class="peel-status">0%</span></div><div class="peel-tools"><button id="peel-reset" class="btn btn-secondary">重新削皮</button><button id="peel-assist" class="btn btn-secondary">點按輔助削皮</button></div><div id="peel-success" class="peel-success">削皮完成！果肉露出得很均勻。</div><button id="peel-complete" class="btn btn-primary" style="margin-top:14px" hidden>完成第三關 →</button></section>`;
}
function prototype(stage) {
  const peel = stage === 3;
  return `<section class="screen">${topbar()}<div class="page-head"><p class="eyebrow">第${stage}關・體驗雛型</p><h2>${peel ? '旋轉削皮' : '九降風曬柿餅'}</h2><p>${peel ? '好柿餅，從均勻削去外皮開始。' : '新埔冬季乾燥的九降風，是天然製餅好幫手。'}</p></div><div class="card"><div class="prototype-visual ${peel ? '' : 'wind-demo'}"><div class="big-icon">${peel ? '🟠' : '☀️'}</div></div><h2>${peel ? '沿著柿子慢慢削一圈' : '把柿子移到適合的曬棚'}</h2><p>這是可點入的互動雛型頁，正式版預計加入：</p><div class="todo-list">${(peel ? ['手指畫圈削皮','削太厚會扣分','完成一圈即可過關'] : ['陽光、濕度與風力變化','下雨前收進棚內','曬製進度與柿餅顏色']).map(x => `<div class="todo"><span>✓</span><span>${x}</span></div>`).join('')}</div><button class="btn btn-primary" data-complete="${stage}">體驗雛型並過關 →</button></div></section>`;
}
function dryingScreen() {
  if (drying.finished) return dryingResult();
  const s = dryingScenarios[drying.round];
  const level = drying.dryness >= 70 ? 'high' : drying.dryness >= 40 ? 'mid' : 'low';
  return `<section class="screen">${topbar()}<div class="page-head"><p class="eyebrow">第四關・九降風曬製</p><h2>看天氣，也要看果實</h2><p>每次挑戰情境都會重新排列，請依現場狀況選擇。</p></div><div class="drying-dashboard"><div class="drying-stat"><small>曬製進度</small><div class="progress-track"><div id="drying-fill" class="progress-fill" style="width:${drying.dryness}%"></div></div><strong id="drying-value">${drying.dryness}%</strong></div><div class="drying-stat"><small>柿餅品質</small><strong class="quality-secret">🔒 完成後揭曉</strong></div></div><div class="card weather-card"><div class="weather-sky ${s.kind}">${weatherScene(s)}</div><div class="weather-copy"><p class="eyebrow">${s.time}・隨機情境 ${drying.round + 1}/${dryingScenarios.length}</p><h3>${s.title}</h3><p>${s.desc}</p><div class="tray-wrap"><div id="drying-tray" class="drying-tray tray-state-${s.kind}" data-dryness="${level}" aria-label="白鐵網狀圓盤上的削皮柿">${'<i class="tray-fruit"></i>'.repeat(9)}${s.kind === 'bird' ? '<img class="bird-on-tray" src="assets/taiwan-barbet.webp" alt="靠近曬盤的五色鳥">' : ''}</div></div><div class="drying-actions"><button class="drying-action" data-dry-action="outside">☀️　移到戶外<br>日曬風乾</button><button class="drying-action" data-dry-action="turn">🤲　翻面、輕壓<br>整理形狀</button><button class="drying-action" data-dry-action="shelter">🏠　收進棚內<br>避雨乾燥</button><button class="drying-action" data-dry-action="bird">🐦　溫和趕鳥<br>保護曬盤</button></div><div id="drying-feedback" class="drying-feedback" role="status"></div><button id="drying-next" class="btn btn-primary" style="margin-top:12px" hidden>${drying.round === dryingScenarios.length - 1 ? '揭曉柿餅品質 →' : '進入下一個時段 →'}</button></div></div></section>`;
}
function weatherScene(s) {
  if (s.kind === 'wind') return '<span class="monsoon-badge">↙ 東北季風・九降風</span><i class="sun-disc"></i><i class="wind-stream w1"></i><i class="wind-stream w2"></i><i class="wind-stream w3"></i><div class="wind-explain"><span>東北季風</span><b>→</b><span>乾爽九降風</span><b>→</b><span>帶走水分</span></div>';
  if (s.kind === 'rain') return '<i class="cloud c1"></i><i class="cloud c2"></i><i class="cloud c3"></i><div class="rain-drops"></div><div class="weather-icon">🌧️</div>';
  if (s.kind === 'bird') return '<span class="monsoon-badge">新竹縣縣鳥・五色鳥</span><i class="sun-disc"></i><i class="wind-stream w2"></i>';
  if (s.kind === 'turn') return '<div class="process-message"><span>果實狀態</span><strong>表皮經過東北季風的吹拂，慢慢變乾了</strong></div>';
  return '<i class="cloud c1"></i><i class="cloud c2"></i><div class="weather-icon">🌫️</div>';
}
function dryingResult() {
  const passed = drying.dryness >= 75 && drying.quality >= 2;
  return `<section class="screen">${topbar()}<div class="hero"><div class="card drying-result"><p class="eyebrow">第四關・品質揭曉</p>${passed ? '<img class="result-fruit" src="assets/finished-persimmon-cake.webp" alt="完成的橘色台灣柿餅">' : '<div class="result-weather">🌦️</div>'}<h2>${passed ? '九降風柿餅完成！' : '這批柿子需要再照顧'}</h2><p>${passed ? '金黃色削皮柿已轉為柔軟飽滿的金橘色台灣柿餅。' : '乾燥度或品質還沒達到標準，再觀察一次天氣、果實和鳥況吧。'}</p><div class="result-score"><div><small>乾燥度</small><strong>${drying.dryness}%</strong></div><div><small>品質星數</small><strong class="quality-stars">${qualityStars()}</strong></div></div><p class="hint">真正的柿餅通常需要經過約 7–9 天的日曬、風乾、翻面與捻壓。</p><div class="stack" style="margin-top:16px">${passed ? '<button id="drying-complete" class="btn btn-primary">完成第四關 →</button>' : ''}<button id="drying-retry" class="btn btn-secondary">重新挑戰隨機情境</button></div></div></div></section>`;
}
function qualityStars() { return `${'★'.repeat(Math.max(0,drying.quality))}${'☆'.repeat(Math.max(0,5-drying.quality))}`; }
function varietyQuiz() {
  const q = varietyQuestions[varietyIndex];
  return `<section class="screen">${topbar()}<div class="page-head"><p class="eyebrow">第五關・柿子小學堂</p><h2>準備好成為懂柿長了嗎？</h2><p>完成五題，成為小小懂柿長。</p></div><div class="progress-summary"><div class="progress-track"><div class="progress-fill" style="width:${(varietyIndex + 1) / varietyQuestions.length * 100}%"></div></div><strong>${varietyIndex + 1}/${varietyQuestions.length}</strong></div><div class="card"><div class="question">${q.question}</div><div class="answers">${q.answers.map((a,i) => `<button class="answer" data-variety-answer="${i}">${String.fromCharCode(65+i)}　${a}</button>`).join('')}</div><div id="variety-feedback" class="feedback"></div><button id="variety-next" class="btn btn-primary" hidden>${varietyIndex === varietyQuestions.length - 1 ? '完成柿子小學堂 →' : '下一題 →'}</button></div></section>`;
}
function photoScreen() {
  return `<section class="screen">${topbar()}<div class="page-head"><p class="eyebrow">第六關・好柿留影</p><h2>留下今天的農園回憶</h2><p>選擇照片並套用金漢相框。照片只在這台裝置處理，不會上傳。</p></div><div class="card"><label class="upload-zone" for="photo-input"><input id="photo-input" type="file" accept="image/*" capture="environment"><div id="photo-content"><div class="photo-placeholder">📷</div><strong>點一下拍照或選擇照片</strong><p class="photo-caption">直式與橫式照片都會自動套用合適版型</p></div></label><div id="effect-controls" hidden><div class="effect-picker" aria-label="選擇相框樣式"><button class="effect-btn active" data-effect="golden">金黃柿海</button><button class="effect-btn" data-effect="wind">九降風連峰</button><button class="effect-btn" data-effect="postcard">農園明信片</button></div></div><div class="stack" style="margin-top:16px"><button id="photo-share" class="btn btn-secondary" disabled>分享／儲存照片</button><button id="photo-complete" class="btn btn-primary" disabled>完成第六關 →</button></div></div></section>`;
}
function endScreen() {
  const completedAt = state.awardCompletedAt ? new Date(state.awardCompletedAt) : new Date();
  const awardDate = new Intl.DateTimeFormat('zh-TW', { year:'numeric', month:'long', day:'numeric' }).format(completedAt);
  const fallbackIndex = awardHash(`${state.name}|${completedAt.toISOString().slice(0,10)}`) % awardComments.length;
  const commentIndex = Number.isInteger(state.awardCommentIndex) ? state.awardCommentIndex : fallbackIndex;
  const awardComment = awardComments[commentIndex % awardComments.length];
  return `<section class="screen end-screen">${topbar('map')}<div class="hero award-hero"><div class="award-certificate"><div class="award-logo"><img src="assets/jinhan-calligraphy-logo.webp" alt="金漢柿餅"></div><h1 class="award-title">好柿達人獎狀</h1><p class="award-lead">恭喜</p><strong class="award-name">${escapeHtml(state.name)}</strong><div class="award-copy"><span>完成「跟著九降風做柿餅」數位闖關</span><span>認識從採收、削皮、日曬風乾，</span><span>到品種辨識的農園智慧。</span><span>特頒此狀，以資鼓勵。</span></div><div class="award-footer"><div><span>頒發單位</span><strong>金漢柿餅教育農園</strong><small>${awardDate}</small></div><div class="award-seal" aria-label="特優認證">特優</div></div></div><aside class="award-comment" aria-label="好柿學習評語"><span class="award-comment-label">好柿學習評語</span><p>${awardComment}</p><small>金漢柿餅教育農園 × 新竹縣大墩山休閒農業區</small></aside><div class="stack">${action('回到闖關地圖', 'map')}${action('再玩一次', 'home', true)}</div></div></section>`;
}
function escapeHtml(value='') { return value.replace(/[&<>'"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c])); }
function render() {
  const views = { home, name: nameScreen, map: mapScreen, qr: qrUnlockScreen, stage1: quiz, stage2: harvestScreen, stage3: peelScreen, stage4: dryingScreen, stage5: varietyQuiz, stage6: photoScreen, end: endScreen };
  app.innerHTML = (views[route] || home)();
  bind();
}
function bind() {
  app.querySelectorAll('[data-go]').forEach(el => el.addEventListener('click', () => go(el.dataset.go)));
  app.querySelectorAll('[data-stage]').forEach(el => el.addEventListener('click', () => openStage(Number(el.dataset.stage))));
  app.querySelectorAll('[data-complete]').forEach(el => el.addEventListener('click', () => { complete(Number(el.dataset.complete)); go('map'); }));
  document.querySelector('#restart')?.addEventListener('click', () => { if (confirm('要清除暱稱與所有闖關進度嗎？')) { state = { ...defaultState }; saveState(); render(); } });
  document.querySelector('#name-form')?.addEventListener('submit', e => { e.preventDefault(); const name = document.querySelector('#nickname').value.trim(); if (!name) return; state.name = name; saveState(); go('map'); });
  app.querySelectorAll('[data-answer]').forEach(el => el.addEventListener('click', answerQuiz));
  app.querySelectorAll('[data-variety-answer]').forEach(el => el.addEventListener('click', answerVariety));
  document.querySelector('#variety-next')?.addEventListener('click', nextVariety);
  document.querySelector('#quiz-next')?.addEventListener('click', () => { complete(1); go('map'); });
  document.querySelector('#harvest-start')?.addEventListener('click', startHarvest);
  if (route === 'stage3') initPeelGame();
  document.querySelector('#peel-reset')?.addEventListener('click', initPeelGame);
  document.querySelector('#peel-assist')?.addEventListener('click', assistPeel);
  document.querySelector('#peel-complete')?.addEventListener('click', () => { complete(3); go('map'); });
  app.querySelectorAll('[data-dry-action]').forEach(el => el.addEventListener('click', answerDrying));
  document.querySelector('#drying-next')?.addEventListener('click', nextDrying);
  document.querySelector('#drying-retry')?.addEventListener('click', resetDrying);
  document.querySelector('#drying-complete')?.addEventListener('click', () => { complete(4); resetDrying(false); go('map'); });
  document.querySelector('#photo-input')?.addEventListener('change', previewPhoto);
  app.querySelectorAll('[data-effect]').forEach(el => el.addEventListener('click', () => selectEffect(el.dataset.effect)));
  document.querySelector('#photo-share')?.addEventListener('click', sharePhoto);
  document.querySelector('#photo-complete')?.addEventListener('click', () => { complete(6); go('end'); });
  document.querySelector('#qr-camera-start')?.addEventListener('click', startQrCamera);
  document.querySelector('#qr-file-input')?.addEventListener('change', scanQrFile);
}
function setQrStatus(message, type = '') {
  const status = document.querySelector('#qr-status');
  if (!status) return;
  status.textContent = message;
  status.className = `qr-status ${type}`.trim();
}
function createQrScanner() {
  if (qrScanner) return qrScanner;
  if (typeof Html5Qrcode === 'undefined') throw new Error('QR_LIBRARY_MISSING');
  const formats = typeof Html5QrcodeSupportedFormats === 'undefined'
    ? undefined
    : [Html5QrcodeSupportedFormats.QR_CODE];
  qrScanner = new Html5Qrcode('qr-reader', formats ? { formatsToSupport: formats, verbose: false } : false);
  return qrScanner;
}
async function startQrCamera() {
  const button = document.querySelector('#qr-camera-start');
  if (!window.isSecureContext) {
    setQrStatus('手機相機需要 HTTPS。請使用手機測試網址，或先用「從相簿選擇 QR 圖片」。', 'error');
    return;
  }
  if (!navigator.mediaDevices?.getUserMedia) {
    setQrStatus('這個瀏覽器不支援相機掃描，請改用 Chrome／Safari，或從相簿選擇 QR 圖片。', 'error');
    return;
  }
  if (button) button.disabled = true;
  setQrStatus('正在啟動後鏡頭，請在瀏覽器詢問時選擇「允許」…');
  try {
    const scanner = createQrScanner();
    await scanner.start(
      { facingMode: 'environment' },
      { fps: 10, qrbox: { width: 240, height: 240 }, aspectRatio: 1.333334 },
      decodedText => void handleQrResult(decodedText),
      () => {}
    );
    qrScannerRunning = true;
    if (button) button.textContent = '相機掃描中…';
    setQrStatus('請把 QR Code 對準畫面中央；辨識成功後會自動進入關卡。', 'active');
  } catch (error) {
    const name = error?.name || '';
    const message = String(error?.message || error || '');
    if (/NotAllowed|Permission|denied/i.test(`${name} ${message}`)) {
      setQrStatus('相機權限被拒絕。請到瀏覽器網址列旁的權限設定允許相機，再重新整理；也可改用相簿選圖。', 'error');
    } else if (/NotFound|DevicesNotFound|Overconstrained/i.test(`${name} ${message}`)) {
      setQrStatus('找不到可用的相機。請確認其他 App 沒有占用鏡頭，或改用相簿選圖。', 'error');
    } else if (message.includes('QR_LIBRARY_MISSING')) {
      setQrStatus('QR 掃描元件沒有載入，請確認網頁檔案完整後重新整理。', 'error');
    } else {
      setQrStatus('相機啟動失敗。請重新整理後再試，或改用相簿選擇 QR 圖片。', 'error');
    }
    if (button) button.disabled = false;
  }
}
async function scanQrFile(event) {
  const file = event.target.files?.[0];
  if (!file || qrBusy) return;
  setQrStatus('正在辨識圖片中的 QR Code…');
  try {
    if (qrScannerRunning) await stopQrScanner(false);
    const scanner = createQrScanner();
    let decodedText = '';
    try {
      decodedText = await scanner.scanFile(file, true);
    } catch {
      setQrStatus('正在加強圖片亮度與裁切範圍，請稍候…');
      decodedText = await scanQrFileWithFallbacks(file, scanner);
    }
    if (!decodedText) throw new Error('QR_NOT_FOUND');
    await handleQrResult(decodedText);
  } catch (error) {
    if (!qrBusy) setQrStatus('這張圖片沒有辨識到 QR Code。請選擇較清楚、完整的圖片再試。', 'error');
  } finally {
    event.target.value = '';
  }
}
async function scanQrFileWithFallbacks(file, scanner) {
  const nativeResult = await scanQrWithBarcodeDetector(file);
  if (nativeResult) return nativeResult;
  const variants = await createQrImageVariants(file);
  for (const variant of variants) {
    try { return await scanner.scanFile(variant, false); } catch {}
  }
  return '';
}
async function scanQrWithBarcodeDetector(file) {
  if (typeof BarcodeDetector === 'undefined' || typeof createImageBitmap === 'undefined') return '';
  let bitmap;
  try {
    const detector = new BarcodeDetector({ formats:['qr_code'] });
    bitmap = await createImageBitmap(file, { imageOrientation:'from-image' });
    const codes = await detector.detect(bitmap);
    return codes.find(code => code.rawValue)?.rawValue || '';
  } catch {
    return '';
  } finally {
    bitmap?.close?.();
  }
}
async function createQrImageVariants(file) {
  const image = await loadQrImage(file);
  const width = image.naturalWidth || image.width;
  const height = image.naturalHeight || image.height;
  const shortSide = Math.min(width, height);
  const square = shortSide * .84;
  const crops = [
    { x:0, y:0, width, height, max:1800, contrast:false },
    { x:(width-square)/2, y:(height-square)/2, width:square, height:square, max:1500, contrast:false },
    { x:(width-square)/2, y:Math.max(0, Math.min(height-square, height*.55-square/2)), width:square, height:square, max:1500, contrast:true },
  ];
  const variants = [];
  for (const crop of crops) variants.push(await renderQrVariant(image, crop));
  return variants;
}
function loadQrImage(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const image = new Image();
    image.onload = () => { URL.revokeObjectURL(url); resolve(image); };
    image.onerror = () => { URL.revokeObjectURL(url); reject(new Error('IMAGE_LOAD_FAILED')); };
    image.src = url;
  });
}
function renderQrVariant(image, crop) {
  return new Promise((resolve, reject) => {
    const scale = Math.min(1, crop.max / Math.max(crop.width, crop.height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(crop.width * scale));
    canvas.height = Math.max(1, Math.round(crop.height * scale));
    const context = canvas.getContext('2d', { willReadFrequently:true });
    if (!context) return reject(new Error('CANVAS_UNAVAILABLE'));
    context.imageSmoothingEnabled = true;
    context.imageSmoothingQuality = 'high';
    if (crop.contrast) context.filter = 'grayscale(1) contrast(1.8)';
    context.drawImage(image, crop.x, crop.y, crop.width, crop.height, 0, 0, canvas.width, canvas.height);
    canvas.toBlob(blob => {
      if (!blob) return reject(new Error('IMAGE_CONVERSION_FAILED'));
      resolve(new File([blob], 'qr-enhanced.png', { type:'image/png' }));
    }, 'image/png');
  });
}
async function sha256(value) {
  const bytes = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return [...new Uint8Array(digest)].map(byte => byte.toString(16).padStart(2, '0')).join('');
}
async function handleQrResult(decodedText) {
  if (qrBusy || !qrTargetStage) return;
  qrBusy = true;
  try {
    const normalized = String(decodedText || '').trim();
    const actualHash = await sha256(normalized);
    const expectedHash = qrConfig.hashes?.[qrTargetStage];
    if (expectedHash && actualHash === expectedHash) {
      if (!state.qrUnlocked.includes(qrTargetStage)) state.qrUnlocked.push(qrTargetStage);
      saveState();
      const unlockedStage = qrTargetStage;
      setQrStatus(`第 ${unlockedStage} 關解鎖成功！正在進入關卡…`, 'success');
      await stopQrScanner(false);
      setTimeout(() => openStage(unlockedStage), 450);
      return;
    }
    const scannedStage = Number(normalized.match(/(?:^|\|)stage=(\d+)(?:\||$)/)?.[1]);
    if (qrRequiredStages.has(scannedStage)) {
      setQrStatus(`這是第 ${scannedStage} 關的 QR Code；目前需要掃描第 ${qrTargetStage} 關。`, 'error');
    } else {
      setQrStatus('這不是金漢闖關用的有效 QR Code，請掃描現場指定標示。', 'error');
    }
  } catch {
    setQrStatus('驗證 QR Code 時發生錯誤，請重新掃描。', 'error');
  } finally {
    qrBusy = false;
  }
}
async function stopQrScanner(clear = true) {
  if (!qrScanner) return;
  if (qrScannerRunning) {
    try { await qrScanner.stop(); } catch {}
    qrScannerRunning = false;
  }
  if (clear) {
    try { qrScanner.clear(); } catch {}
    qrScanner = null;
  }
}
function answerQuiz(e) {
  const chosen = Number(e.currentTarget.dataset.answer);
  app.querySelectorAll('.answer').forEach((b, i) => { b.disabled = true; if (i === 1) b.classList.add('correct'); });
  if (chosen !== 1) e.currentTarget.classList.add('wrong');
  document.querySelector('#feedback').textContent = chosen === 1 ? '答對了！你現在位於新竹縣新埔鎮。' : '差一點！答案是新竹縣／新埔鎮。這裡的風土孕育出新埔柿餅。';
  document.querySelector('#quiz-next').hidden = false;
}
function answerVariety(e) {
  const q = varietyQuestions[varietyIndex];
  const chosen = Number(e.currentTarget.dataset.varietyAnswer);
  app.querySelectorAll('[data-variety-answer]').forEach((button, index) => {
    button.disabled = true;
    if (index === q.correct) button.classList.add('correct');
  });
  if (chosen !== q.correct) e.currentTarget.classList.add('wrong');
  document.querySelector('#variety-feedback').textContent = chosen === q.correct ? q.correctFeedback : q.wrongFeedback;
  document.querySelector('#variety-next').hidden = false;
}
function nextVariety() {
  if (varietyIndex < varietyQuestions.length - 1) { varietyIndex += 1; render(); }
  else { complete(5); varietyIndex = 0; varietyQuestions = buildVarietyQuestions(); go('map'); }
}
function startHarvest() {
  harvest.score = 0; harvest.time = 20;
  document.querySelector('#harvest-start').disabled = true;
  document.querySelector('#score').textContent = '0'; document.querySelector('#time').textContent = '20';
  spawnTargets();
  harvest.timer = setInterval(() => {
    harvest.time -= 1; document.querySelector('#time').textContent = harvest.time;
    if (harvest.time <= 0) finishHarvest(false);
  }, 1000);
}
function spawnTargets() {
  const orchard = document.querySelector('#orchard'); if (!orchard) return;
  orchard.querySelectorAll('.pick-target').forEach(x => x.remove());
  const types = ['fruit', 'leaf', Math.random() > .4 ? 'bug' : 'leaf'];
  const positions = [];
  types.sort(() => Math.random() - .5).forEach((type, index) => {
    let left, top, safe;
    do {
      left = 7 + Math.random() * 76; top = 13 + Math.random() * 46;
      safe = positions.every(p => Math.hypot(p.left-left, p.top-top) > 18);
    } while (!safe);
    positions.push({ left, top });
    const target = document.createElement('button');
    target.className = type === 'fruit' ? 'pick-target pick-fruit' : `pick-target ${type}`;
    target.setAttribute('aria-label', type === 'fruit' ? '採下柿子' : type === 'leaf' ? '葉子，不要採' : '蟲子，不要採');
    target.style.left = `${left}%`; target.style.top = `${top}%`; target.style.animationDelay = `${index * -.35}s`;
    if (type === 'leaf') target.style.setProperty('--tilt', `${-35 + Math.random()*70}deg`);
    if (type === 'bug') target.textContent = Math.random() > .5 ? '🐛' : '🐞';
    target.addEventListener('click', () => pickTarget(type, target));
    orchard.appendChild(target);
  });
}
function pickTarget(type, target) {
  if (type === 'fruit') {
    harvest.score += 1;
    document.querySelector('#score').textContent = harvest.score;
    showPickPop(target, '+1 好柿！');
    if (harvest.score >= 8) return finishHarvest(true);
  } else if (type === 'bug') {
    harvest.time = Math.max(1, harvest.time - 2);
    document.querySelector('#time').textContent = harvest.time;
    showPickPop(target, '-2 秒');
  } else {
    showPickPop(target, '這是葉子');
  }
  setTimeout(spawnTargets, 220);
}
function showPickPop(target, message) {
  const pop = document.createElement('span'); pop.className = 'pick-pop'; pop.textContent = message;
  pop.style.left = target.style.left; pop.style.top = target.style.top;
  document.querySelector('#orchard')?.appendChild(pop);
  setTimeout(() => pop.remove(), 700);
}
function finishHarvest(won) {
  clearInterval(harvest.timer); document.querySelectorAll('.pick-target').forEach(x => x.remove());
  const btn = document.querySelector('#harvest-start'); if (!btn) return;
  if (won) {
    complete(2);
    const done = btn.cloneNode(true);
    done.disabled = false;
    done.textContent = '採收成功！回到地圖 →';
    done.addEventListener('click', () => go('map'));
    btn.replaceWith(done);
    notify('採到 8 顆成熟柿子！');
  }
  else { btn.disabled = false; btn.textContent = '再試一次'; notify(`時間到，採到 ${harvest.score} 顆`); }
}
function initPeelGame() {
  const canvas = document.querySelector('#peel-canvas'); if (!canvas) return;
  const runId = ++peelRunId;
  peel = { mask: document.createElement('canvas'), progressMask: document.createElement('canvas'), image: peel.image, coverImage: peel.coverImage, initialAlpha: 0, drawing: false, last: null, assistStep: 0, progress: 0, complete: false, ready: false, error: '' };
  [peel.mask, peel.progressMask].forEach(layer => { layer.width = canvas.width; layer.height = canvas.height; });
  const prepare = () => { if (runId === peelRunId && peel.image && peel.coverImage) setupPeelMask(); };
  setPeelControlsDisabled(true);
  drawPeelBoard();
  if (!peel.image) {
    const image = new Image();
    image.onload = () => { if (runId !== peelRunId) return; peel.image = image; prepare(); };
    image.onerror = () => { if (runId !== peelRunId) return; peel.error='削皮完成圖載入失敗'; setPeelControlsDisabled(false); notify('柿子素材載入失敗，請重新整理'); drawPeelBoard(); };
    image.src = 'assets/peeled-persimmon-with-peel.webp';
  }
  if (!peel.coverImage) {
    const coverImage = new Image();
    coverImage.onload = () => { if (runId !== peelRunId) return; peel.coverImage = coverImage; drawPeelBoard(); prepare(); };
    coverImage.onerror = () => { if (runId !== peelRunId) return; peel.error='未削皮柿子載入失敗'; setPeelControlsDisabled(false); notify('未削皮柿子素材載入失敗，請重新整理'); drawPeelBoard(); };
    coverImage.src = 'assets/unpeeled-persimmon.webp';
  }
  prepare();
  canvas.onpointerdown = event => { if (!peel.ready || peel.complete) return; peel.drawing = true; canvas.setPointerCapture(event.pointerId); peel.last = peelPoint(event,canvas); peelStroke(peel.last,peel.last); hidePeelTip(); };
  canvas.onpointermove = event => { if (!peel.drawing) return; const next=peelPoint(event,canvas); peelStroke(peel.last,next); peel.last=next; };
  canvas.onpointerup = canvas.onpointercancel = () => { peel.drawing=false; peel.last=null; updatePeelProgress(); };
}
function setupPeelMask() {
  if (!peel.mask || !peel.progressMask || !peel.coverImage) return;
  const mask = peel.mask.getContext('2d');
  mask.clearRect(0,0,600,600);
  mask.drawImage(peel.coverImage,34,34,532,532);
  const progress = peel.progressMask.getContext('2d');
  progress.clearRect(0,0,600,600);
  progress.fillStyle='#fff'; progress.beginPath(); progress.ellipse(300,320,184,160,0,0,Math.PI*2); progress.fill();
  peel.initialAlpha = countAlpha(peel.progressMask);
  peel.ready = true;
  setPeelControlsDisabled(false);
  updatePeelProgress();
}
function setPeelControlsDisabled(disabled) {
  document.querySelectorAll('#peel-reset,#peel-assist').forEach(button => { button.disabled=disabled; });
}
function peelPoint(event,canvas) {
  const rect=canvas.getBoundingClientRect(); return { x:(event.clientX-rect.left)*canvas.width/rect.width, y:(event.clientY-rect.top)*canvas.height/rect.height };
}
function peelStroke(from,to) {
  if (!peel.ready) return;
  [peel.mask,peel.progressMask].forEach(layer => {
    const mask=layer?.getContext('2d'); if (!mask) return;
    mask.save(); mask.globalCompositeOperation='destination-out'; mask.lineCap='round'; mask.lineJoin='round'; mask.lineWidth=62;
    mask.beginPath(); mask.moveTo(from.x,from.y); mask.lineTo(to.x,to.y); mask.stroke(); mask.restore();
  });
  drawPeelBoard();
}
function assistPeel() {
  if (!peel.ready || peel.complete) return;
  const row=peel.assistStep % 9; const y=180+row*35;
  const halfWidth=Math.sqrt(Math.max(0,1-Math.pow((y-320)/160,2)))*174;
  peelStroke({x:300-halfWidth,y},{x:300+halfWidth,y}); peel.assistStep += 1; hidePeelTip(); updatePeelProgress();
}
function drawPeelBoard() {
  const canvas=document.querySelector('#peel-canvas'); if (!canvas) return;
  const ctx=canvas.getContext('2d'); ctx.clearRect(0,0,600,600);
  const bg=ctx.createLinearGradient(0,0,0,600); bg.addColorStop(0,'#fff8df'); bg.addColorStop(1,'#eed59b'); ctx.fillStyle=bg; ctx.fillRect(0,0,600,600);
  if (!peel.ready) {
    if (peel.coverImage) ctx.drawImage(peel.coverImage,34,34,532,532);
    else { ctx.fillStyle='#735f42'; ctx.font='700 24px Microsoft JhengHei'; ctx.textAlign='center'; ctx.fillText(peel.error || '柿子載入中…',300,305); }
    return;
  }
  if (peel.image) {
    if (!peel.complete) {
      ctx.save(); ctx.beginPath(); ctx.ellipse(300,320,184,160,0,0,Math.PI*2); ctx.clip();
      ctx.drawImage(peel.image,55,55,490,490); ctx.restore();
    } else ctx.drawImage(peel.image,55,55,490,490);
  }
  if (peel.mask && !peel.complete) ctx.drawImage(peel.mask,0,0);
  if (!peel.complete) {
    ctx.save(); ctx.strokeStyle='rgba(255,255,255,.72)'; ctx.lineWidth=5; ctx.setLineDash([12,14]);
    ctx.beginPath(); ctx.ellipse(300,320,184,160,0,0,Math.PI*2); ctx.stroke(); ctx.restore();
  }
}
function countAlpha(canvas) {
  const data=canvas.getContext('2d').getImageData(0,0,canvas.width,canvas.height).data; let count=0;
  for (let i=3;i<data.length;i+=4) if (data[i] > 10) count += 1;
  return count;
}
function updatePeelProgress() {
  if (!peel.ready || !peel.progressMask || !peel.initialAlpha) return;
  const remaining=countAlpha(peel.progressMask); peel.progress=Math.min(100,Math.round((1-remaining/peel.initialAlpha)*100));
  if (peel.progress >= 70) peel.complete=true;
  const status=document.querySelector('#peel-status'); const fill=document.querySelector('#peel-fill');
  if (status) status.textContent=peel.complete ? '完成' : `${peel.progress}%`; if (fill) fill.style.width=peel.complete ? '100%' : `${peel.progress}%`;
  if (peel.complete) {
    document.querySelector('#peel-complete')?.removeAttribute('hidden'); document.querySelector('#peel-success')?.classList.add('show');
    const tip=document.querySelector('#peel-tip'); if (tip) tip.style.opacity='0';
  }
  drawPeelBoard();
}
function hidePeelTip() { const tip=document.querySelector('#peel-tip'); if (tip) tip.style.opacity='0'; }
function answerDrying(event) {
  if (drying.answered) return;
  const scenario = dryingScenarios[drying.round]; const choice = event.currentTarget.dataset.dryAction;
  drying.answered = true;
  app.querySelectorAll('[data-dry-action]').forEach(button => {
    button.disabled = true;
    if (button.dataset.dryAction === scenario.correct) button.classList.add('correct');
  });
  const correct = choice === scenario.correct;
  if (correct) drying.dryness = Math.min(100, drying.dryness + scenario.gain);
  else { drying.quality = Math.max(0, drying.quality - 1); drying.dryness = Math.min(100, drying.dryness + 3); event.currentTarget.classList.add('wrong'); }
  const feedback = document.querySelector('#drying-feedback');
  feedback.innerHTML = `<strong>${correct ? '✅ 判斷正確！' : '💡 這次處理不太適合'}</strong>${scenario.fact}`; feedback.classList.add('show');
  document.querySelector('#drying-value').textContent = `${drying.dryness}%`; document.querySelector('#drying-fill').style.width = `${drying.dryness}%`;
  const tray = document.querySelector('#drying-tray'); if (tray) tray.dataset.dryness = drying.dryness >= 70 ? 'high' : drying.dryness >= 40 ? 'mid' : 'low';
  document.querySelector('#drying-next').hidden = false;
  setTimeout(() => feedback.scrollIntoView({ behavior: 'smooth', block: 'center' }), 80);
}
function nextDrying() {
  if (!drying.answered) return;
  if (drying.round < dryingScenarios.length - 1) { drying.round += 1; drying.answered = false; render(); }
  else { drying.finished = true; render(); }
}
function resetDrying(shouldRender = true) {
  dryingScenarios = buildDryingSequence();
  drying = { round: 0, dryness: 15, quality: 5, answered: false, finished: false };
  if (shouldRender) render();
}
function previewPhoto(e) {
  const file = e.target.files?.[0]; if (!file) return;
  if (!file.type.startsWith('image/')) return notify('請選擇照片檔案');
  const url = URL.createObjectURL(file);
  const image = new Image();
  image.onload = () => {
    photoImage = image;
    photoEffect = 'golden';
    const landscape = image.naturalWidth > image.naturalHeight;
    const size = landscape ? 'width="1600" height="1200"' : 'width="1080" height="1350"';
    const format = landscape ? '橫式 4:3・適合團體照' : '直式 4:5・適合人物照';
    document.querySelector('#photo-content').innerHTML = `<canvas id="photo-canvas" class="photo-canvas" ${size} data-orientation="${landscape ? 'landscape' : 'portrait'}" aria-label="${format}特效照片預覽"></canvas><p class="photo-caption"><strong>${format}</strong><br>點選下方樣式即可更換相框</p>`;
    document.querySelector('#effect-controls').hidden = false;
    ['#photo-share','#photo-complete'].forEach(id => { const button=document.querySelector(id); if (button) button.disabled=true; });
    state.photo = true; saveState(); drawPhoto();
    const orientation = landscape ? 'landscape' : 'portrait';
    loadPhotoFrame(photoEffect, orientation)
      .then(() => {
        if (photoImage !== image) return;
        drawPhoto();
        ['#photo-share','#photo-complete'].forEach(id => { const button=document.querySelector(id); if (button) button.disabled=false; });
        preloadOtherPhotoFrames(orientation);
      })
      .catch(() => notify('相框素材載入失敗，請重新整理後再試'));
    URL.revokeObjectURL(url);
  };
  image.onerror = () => notify('這張照片無法讀取，請換一張試試');
  image.src = url;
}
function selectEffect(effect) {
  photoEffect = effect;
  app.querySelectorAll('[data-effect]').forEach(btn => btn.classList.toggle('active', btn.dataset.effect === effect));
  drawPhoto();
  const orientation = document.querySelector('#photo-canvas')?.dataset.orientation;
  if (orientation) {
    ['#photo-share'].forEach(id => { const button=document.querySelector(id); if (button) button.disabled=true; });
    loadPhotoFrame(effect, orientation)
      .then(() => {
        if (photoEffect !== effect) return;
        drawPhoto();
        ['#photo-share'].forEach(id => { const button=document.querySelector(id); if (button) button.disabled=false; });
      })
      .catch(() => notify('這款相框載入失敗，請再試一次'));
  }
}
function loadPhotoFrame(style, orientation) {
  const key=`${style}-${orientation}`;
  if (photoFrameImages[key]) return Promise.resolve(photoFrameImages[key]);
  if (!photoFramePromises[key]) {
    photoFramePromises[key]=new Promise((resolve,reject)=>{
    const image=new Image();
    image.onload=()=>{photoFrameImages[key]=image;resolve(image);};
    image.onerror=error=>{delete photoFramePromises[key];reject(error);};
    image.src=`assets/photo-frames/${key}.webp?v=3`;
    });
  }
  return photoFramePromises[key];
}
function preloadOtherPhotoFrames(orientation) {
  const load = () => ['golden','wind','postcard']
    .filter(style => style !== photoEffect)
    .forEach(style => loadPhotoFrame(style, orientation).catch(() => {}));
  if ('requestIdleCallback' in window) requestIdleCallback(load, { timeout: 1800 });
  else setTimeout(load, 350);
}
function drawPhoto() {
  const canvas = document.querySelector('#photo-canvas'); if (!canvas || !photoImage) return;
  const ctx = canvas.getContext('2d'); const w = canvas.width; const h = canvas.height;
  const scale = Math.max(w / photoImage.width, h / photoImage.height);
  const sw = w / scale, sh = h / scale, sx = (photoImage.width - sw) / 2, sy = (photoImage.height - sh) / 2;
  ctx.clearRect(0,0,w,h); ctx.drawImage(photoImage,sx,sy,sw,sh,0,0,w,h);
  const key=`${photoEffect}-${canvas.dataset.orientation}`;
  const frame=photoFrameImages[key];
  if (frame) ctx.drawImage(frame,0,0,w,h);
  if (photoEffect === 'postcard' && frame) drawPostcardDetails(ctx,w,h);
}
function drawPostcardDetails(ctx,w,h) {
  const u=Math.min(w,h)/1080;
  const footer=h*.14, top=h-footer;
  ctx.fillStyle='rgba(255,249,232,.98)'; ctx.fillRect(36*u,top,w-72*u,footer);
  ctx.strokeStyle='#aa5433'; ctx.lineWidth=2*u; ctx.beginPath(); ctx.moveTo(44*u,top); ctx.lineTo(w-44*u,top); ctx.stroke();
  ctx.textAlign='center'; ctx.fillStyle='#345133'; ctx.font=`900 ${28*u}px Microsoft JhengHei`; ctx.fillText('金漢・九降風柿旅',w/2,top+footer*.48);
  const date=new Intl.DateTimeFormat('zh-TW',{year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
  ctx.fillStyle='#6d533e'; ctx.font=`700 ${18*u}px Microsoft JhengHei`; ctx.fillText(`新竹新埔　｜　${date}　｜　${state.name || '小小懂柿長'}`,w/2,top+footer*.76);
}
function canvasBlob() { return new Promise(resolve => document.querySelector('#photo-canvas')?.toBlob(resolve,'image/jpeg',.92)); }
async function sharePhoto() {
  const blob = await canvasBlob(); if (!blob) return;
  const file = new File([blob],'金漢好柿留影.jpg',{type:'image/jpeg'});
  if (navigator.canShare?.({files:[file]})) { try { await navigator.share({title:'金漢好柿留影',text:'我完成金漢柿餅教育農園數位闖關！',files:[file]}); } catch {} }
  else { notify('這個瀏覽器不支援照片分享，請改用 Safari 或 Chrome 開啟網站'); }
}
render();
