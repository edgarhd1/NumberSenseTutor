// NumberSense Tutor v3.1
// Fixes:
// - modeSelect, opSelect, maxNumber now update state and generate correct problems
// - newProblem() now reflects visual / word / decompose properly
// - UI wiring for buttons and keyboard is set up after session start

const SESSIONS_KEY = 'ns_sessions_v1';

// DOM helpers
const $ = (id)=>document.getElementById(id);

// Elements
const sessionOverlay   = $('sessionOverlay');
const continueBtn      = $('continueSessionBtn');
const newBtn           = $('newSessionBtn');

const appShell         = $('appShell');

const modeSelect       = $('modeSelect');
const opSelect         = $('opSelect');
const maxNumber        = $('maxNumber');

const problemArea      = $('problemArea');
const visualArea       = $('visualArea');

const answerForm       = $('answerForm');
const answerInput      = $('answerInput');
const checkBtn         = $('checkBtn');

const nextBtn          = $('nextBtn');
const resetStatsBtn    = $('resetStats');

const hintBtn          = $('hintBtn');
const hintText         = $('hintText');
const feedback         = $('feedback');
const timerEl          = $('timer');

const statCorrect      = $('statCorrect');
const statAttempted    = $('statAttempted');
const statAvgTime      = $('statAvgTime');
const statStreak       = $('statStreak');

const historyBody      = $('historyBody');

// runtime state
const state = {
  mode:       'flash',        // 'flash' | 'visual' | 'word' | 'decompose'
  op:         'mix',          // 'add' | 'sub' | 'mix'
  max:        20,
  current:    null,           // current problem object
  startTime:  null,
  timerInt:   null,
  hintUsed:   false
};

// current session object
let currentSession = null;

/* -------------------------
   SESSION MANAGEMENT
------------------------- */

function loadAllSessions(){
  const raw = localStorage.getItem(SESSIONS_KEY);
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function saveAllSessions(all){
  localStorage.setItem(SESSIONS_KEY, JSON.stringify(all));
}

function createNewSession(){
  return {
    createdAt: Date.now(),
    lastUsedAt: Date.now(),
    history: [],
    stats: {
      correct:0,
      attempted:0,
      times:[],
      streak:0
    }
  };
}

function persistSession(){
  let all = loadAllSessions();
  if (!all.length){
    all = [currentSession];
  } else {
    all[all.length-1] = currentSession;
  }
  currentSession.lastUsedAt = Date.now();
  saveAllSessions(all);
}

// Session choice buttons
continueBtn.addEventListener('click', () => {
  const all = loadAllSessions();
  if (!all.length){
    currentSession = createNewSession();
    persistSession();
  } else {
    currentSession = all[all.length-1];
  }
  startApp();
});

newBtn.addEventListener('click', () => {
  const all = loadAllSessions();
  currentSession = createNewSession();
  all.push(currentSession);
  saveAllSessions(all);
  startApp();
});

/* -------------------------
   APP STARTUP
------------------------- */

function startApp(){
  // hide overlay, show app shell
  sessionOverlay.style.display = 'none';
  appShell.setAttribute('aria-hidden','false');

  // sync UI controls from our current state defaults
  modeSelect.value = state.mode;
  opSelect.value   = state.op;
  maxNumber.value  = state.max;

  // wire all UI events now that DOM is "live"
  wireUI();

  // show stats / history from session
  renderStats();
  renderHistoryTable();

  // get first problem
  newProblem();
}

/* -------------------------
   PROBLEM GENERATION
------------------------- */

function randInt(min,max){
  return Math.floor(Math.random()*(max-min+1))+min;
}

// Builds one new math/decompose problem object
function generateProblem(mode, op, max){
  // Decompose mode: split N into parts
  if (mode === 'decompose'){
    const n = randInt(5, Math.max(6, max));
    const a = randInt(1, n-1);
    const b = n - a;
    return {
      type:'decompose',
      n,
      text:`Split ${n} into two parts`,
      hint:`Think of two numbers that add to ${n}. Try pairs like 1 + ${n-1}, 2 + ${n-2}, …`
    };
  }

  // Decide + or - for arithmetic modes
  const fullop = (op === 'mix')
    ? (Math.random() < 0.5 ? 'add' : 'sub')
    : op;

  if (fullop === 'add'){
    const a = randInt(1, max-1);
    const b = randInt(1, Math.max(1,max-a));
    return {
      type:'arith',
      a,b,
      op:'+',
      answer:(a+b),
      text:`${a} + ${b} = ?`,
      hint:getHint({a,b,op:'+'})
    };
  } else {
    const a = randInt(2, max);
    const b = randInt(1, a-1);
    return {
      type:'arith',
      a,b,
      op:'-',
      answer:(a-b),
      text:`${a} - ${b} = ?`,
      hint:getHint({a,b,op:'-'})
    };
  }
}

// Strategy hint text
function getHint({a,b,op}){
  if (op === '-'){
    if (a >= 10 && b <= 10){
      const tens = Math.floor(a/10)*10;
      const rest = a - tens;
      return `${a} is ${tens} and ${rest}. Take away ${b}: ${rest-b} left.`;
    }
    if (a <= 10 && b < a){
      return `Start at ${a}, count back ${b}.`;
    }
    return `What’s left when you take ${b} away from ${a}?`;
  }

  if (a + b === 10) {
    return `Make 10: ${a} + ${b} = 10`;
  }
  if (a < 10 && b < 10 && a + b > 10) {
    return `Make 10 using ${10-a} from ${b}, then add what's left.`;
  }
  if (a === b) {
    return `Double ${a}: ${a}+${a}=${a+b}.`;
  }
  return `Add ${a} and ${b}.`;
}

// Story wording for word mode
function makeStory(cur){
  const patterns = [
    ({a,b,op}) => op==='+' ?
      `You have ${a} toy cars and your friend gives you ${b} more. How many now?` :
      `You had ${a} stickers and gave away ${b}. How many left?`,
    ({a,b,op}) => op==='+' ?
      `There are ${a} apples on a tree and ${b} fall down. How many apples total on the ground?` :
      `You collected ${a} shells and lost ${b}. How many remain?`,
    ({a,b,op}) => op==='+' ?
      `A class reads ${a} pages on Monday and ${b} pages on Tuesday. How many pages total?` :
      `A baker made ${a} cupcakes and sold ${b}. How many are left?`
  ];
  const pick = patterns[Math.floor(Math.random()*patterns.length)];
  return pick(cur);
}

/* -------------------------
   RENDER / NEW PROBLEM
------------------------- */

function newProblem(){
  // build & store new problem
  const cur = generateProblem(state.mode, state.op, state.max);
  state.current = cur;
  state.startTime = Date.now();
  state.hintUsed = false;

  // clear feedback and visuals
  feedback.textContent = '';
  hintText.textContent = '';
  visualArea.innerHTML = '';

  // problem text depends on mode:
  // - word mode -> story
  // - other modes -> cur.text
  if (state.mode === 'word' && cur.type === 'arith') {
    problemArea.textContent = makeStory(cur);
  } else {
    problemArea.textContent = cur.text;
  }

  // visual mode draws ten-frames (arith or decompose)
  if (state.mode === 'visual' && (cur.type === 'arith' || cur.type === 'decompose')) {
    renderVisual(cur);
  }

  // adjust input field type/placeholder for mode
  configureAnswerFieldForMode();

  // reset input
  answerInput.value = '';
  answerInput.focus();

  // restart timer
  startTimer();
}

// Build the visual (ten-frame style)
function renderVisual(cur){
  let n;
  if (cur.type === 'arith'){
    n = (cur.op === '+') ? (cur.a + cur.b) : cur.a;
  } else {
    n = cur.n;
  }

  const container = document.createElement('div');
  container.className = 'card';
  container.setAttribute('aria-label','ten-frames');

  const framesCount = Math.ceil(n/10);
  for (let f=0; f<framesCount; f++){
    const frame = document.createElement('div');
    frame.className='tenframe';
    const base = f*10;
    for (let i=1; i<=10; i++){
      const cell = document.createElement('div');
      cell.className='cell';
      const index = base+i;
      if (index <= n) cell.classList.add('filled');
      frame.appendChild(cell);
    }
    container.appendChild(frame);
  }

  // If subtraction, cross out b from the filled dots
  if (cur.type === 'arith' && cur.op === '-') {
    const totalCells = container.querySelectorAll('.cell.filled');
    for (let i=totalCells.length-1, rem=cur.b; rem>0 && i>=0; i--, rem--){
      totalCells[i].classList.add('crossed');
      totalCells[i].classList.remove('filled');
    }
  }

  visualArea.appendChild(container);
}

/* -------------------------
   ANSWER CHECKING
------------------------- */

// Accept "3+7", "3,7", "3 7"
function parseDecompose(raw){
  const m = raw.match(/(\d+)\s*(?:[,+\s])\s*(\d+)/);
  if(!m) return null;
  return [parseInt(m[1],10), parseInt(m[2],10)];
}

// Generate list like "1+14 • 2+13 • ..."
function allDecomposePairs(n){
  const pairs=[];
  for(let a=1; a<=Math.floor(n/2); a++){
    const b=n-a;
    pairs.push(`${a}+${b}`);
  }
  return pairs;
}

function checkAnswerAndAdvance(){
  if (!state.current) return;

  stopTimer();
  const timeTaken = Math.round((Date.now()-state.startTime)/1000);

  const cur = state.current;
  const raw = answerInput.value.trim();
  if (!raw){
    feedback.textContent = 'Please type an answer first.';
    startTimer(); // resume timer if they didn't actually answer
    return;
  }

  let correct = false;
  let correctAnswer = null;

  if (cur.type === 'decompose'){
    const parts = parseDecompose(raw);
    if(parts){
      const sum = parts[0] + parts[1];
      correct = (sum === cur.n);
      correctAnswer = null;
    } else {
      feedback.textContent = 'Format example: 3+7 or 3,7';
      startTimer();
      return;
    }
  } else {
    const num = Number(raw);
    if(Number.isFinite(num)){
      correct = (num === cur.answer);
      correctAnswer = cur.answer;
    } else {
      feedback.textContent = 'Please enter a number.';
      startTimer();
      return;
    }
  }

  // student-facing feedback
  if (correct){
    if (cur.type === 'decompose'){
      const pairs = allDecomposePairs(cur.n).join(' • ');
      feedback.innerHTML =
        `Correct — all ways to make ${cur.n}: ` +
        `<span style="font-weight:600">${pairs}</span> (took ${timeTaken}s)`;
    } else {
      feedback.textContent =
        `Correct — ${problemTextForHistory(cur)} = ${correctAnswer} (took ${timeTaken}s)`;
    }
  } else {
    if (cur.type === 'decompose'){
      feedback.textContent =
        `Not quite. Try another way to split ${cur.n}. (took ${timeTaken}s)`;
    } else {
      feedback.textContent =
        `Not quite. The answer is ${correctAnswer}. (took ${timeTaken}s)`;
    }
  }

  // update session stats
  currentSession.stats.attempted++;
  currentSession.stats.times.push(timeTaken);
  if (correct){
    currentSession.stats.correct++;
    currentSession.stats.streak = (currentSession.stats.streak || 0) + 1;
  } else {
    currentSession.stats.streak = 0;
  }

  // log the attempt for history table
  currentSession.history.push({
    problemText: displayTextForHistory(cur),
    studentAnswer: raw,
    correct,
    timeTaken,
    hintUsed: state.hintUsed
  });

  persistSession();
  renderStats();
  renderHistoryTable();

  // immediately create next problem so Enter can't double count
  newProblem();
}

function displayTextForHistory(cur){
  // what we show in the history column "Problem"
  if (state.mode === 'word' && cur.type === 'arith') {
    return makeStory(cur);
  }
  return cur.text;
}

function problemTextForHistory(cur){
  if (cur.type === 'arith'){
    return `${cur.a} ${cur.op} ${cur.b}`;
  } else {
    return cur.text;
  }
}

/* -------------------------
   STATS + HISTORY UI
------------------------- */

function averageTime(times){
  if (!times.length) return 0;
  const sum = times.reduce((a,b)=>a+b,0);
  return Math.round(sum / times.length);
}

function renderStats(){
  statCorrect.textContent   = currentSession.stats.correct || 0;
  statAttempted.textContent = currentSession.stats.attempted || 0;
  statAvgTime.textContent   = averageTime(currentSession.stats.times);
  statStreak.textContent    = currentSession.stats.streak || 0;
}

function renderHistoryTable(){
  historyBody.innerHTML = '';
  const rows = [...currentSession.history].slice().reverse();
  for (const item of rows){
    const tr = document.createElement('tr');
    tr.className = item.correct ? 'correct' : 'wrong';

    const tdProb = document.createElement('td');
    tdProb.textContent = item.problemText;

    const tdAns = document.createElement('td');
    tdAns.textContent = item.studentAnswer;

    const tdCor = document.createElement('td');
    tdCor.textContent = item.correct ? 'Yes' : 'No';

    const tdTime = document.createElement('td');
    tdTime.textContent = item.timeTaken;

    const tdHint = document.createElement('td');
    tdHint.textContent = item.hintUsed ? 'Yes' : 'No';

    tr.appendChild(tdProb);
    tr.appendChild(tdAns);
    tr.appendChild(tdCor);
    tr.appendChild(tdTime);
    tr.appendChild(tdHint);

    historyBody.appendChild(tr);
  }
}

/* -------------------------
   HINTS
------------------------- */

function showHint(){
  const cur = state.current;
  if (!cur) return;
  state.hintUsed = true;

  if (cur.type === 'decompose'){
    hintText.textContent = cur.hint ||
      `Think of two numbers that add to ${cur.n}. Start small and work up.`;
  } else if (cur.type === 'arith'){
    hintText.textContent = cur.hint ||
      'Use what you know about tens to solve it.';
  } else {
    hintText.textContent = 'Think carefully about what the story is asking.';
  }
}

/* -------------------------
   INPUT / TIMING / EVENTS
------------------------- */

function configureAnswerFieldForMode(){
  if (state.current && state.current.type === 'decompose'){
    answerInput.setAttribute('type','text');
    answerInput.setAttribute('inputmode','numeric');
    answerInput.setAttribute('pattern','[0-9, +]*');
    answerInput.removeAttribute('step');
    answerInput.placeholder = 'e.g., 3+7 or 3,7';
  } else {
    answerInput.setAttribute('type','number');
    answerInput.setAttribute('inputmode','numeric');
    answerInput.setAttribute('pattern','[0-9]*');
    answerInput.setAttribute('step','1');
    answerInput.placeholder = 'Type answer';
  }
}

// sanitize paste
answerInput.addEventListener('paste',(e)=>{
  e.preventDefault();
  const text=(e.clipboardData||window.clipboardData).getData('text')||'';
  const cleaned = (state.current && state.current.type === 'decompose')
    ? text.replace(/[^0-9,+ ]/g,'')
    : text.replace(/[^0-9]/g,'');
  document.execCommand('insertText', false, cleaned);
});

// block invalid keys, N shortcut
answerInput.addEventListener('keydown',(e)=>{
  if (e.key === 'Enter'){
    return; // form submit will handle
  }
  if ((e.key === 'n' || e.key === 'N') &&
      !e.ctrlKey && !e.metaKey && !e.altKey && !e.altGraphKey){
    e.preventDefault();
    newProblem();
    return;
  }
  const navKeys=['Backspace','Delete','ArrowLeft','ArrowRight','Tab','Home','End'];
  if (navKeys.includes(e.key) || e.ctrlKey || e.metaKey){
    return;
  }
  const ok = (state.current && state.current.type==='decompose')
    ? /[0-9,+ ]/.test(e.key)
    : /[0-9]/.test(e.key);
  if (!ok){
    e.preventDefault();
  }
});

// global N / H shortcuts when not typing
function globalKeydown(e){
  if (e.target === answerInput) return;
  if (e.key.toLowerCase() === 'n'){
    newProblem();
  }
  if (e.key.toLowerCase() === 'h'){
    showHint();
  }
}

// timing
function startTimer(){
  stopTimer();
  timerEl.textContent = 'Time: 0s';
  state.startTime = Date.now();
  state.timerInt = setInterval(()=>{
    timerEl.textContent = 'Time: ' +
      Math.round((Date.now()-state.startTime)/1000) + 's';
  },300);
}
function stopTimer(){
  if (state.timerInt){
    clearInterval(state.timerInt);
    state.timerInt = null;
  }
}

/* -------------------------
   WIRE UI
------------------------- */

function wireUI(){
  // Only wire once. If wireUI somehow runs twice, ignore duplicates.
  if (wireUI._wired) return;
  wireUI._wired = true;

  // answer form submit (Enter / Check)
  answerForm.addEventListener('submit',(e)=>{
    e.preventDefault();
    checkAnswerAndAdvance();
  });

  // new problem button
  nextBtn.addEventListener('click',()=>{
    newProblem();
  });

  // hint button
  hintBtn.addEventListener('click',()=>{
    showHint();
  });

  // reset all data (wipe local sessions)
  resetStatsBtn.addEventListener('click',()=>{
    if (confirm('This will erase all saved sessions and progress. Are you sure?')){
      localStorage.removeItem(SESSIONS_KEY);
      currentSession = createNewSession();
      persistSession();
      renderStats();
      renderHistoryTable();
      newProblem();
    }
  });

  // global keyboard shortcuts
  document.addEventListener('keydown', globalKeydown);

  // modeSelect change -> update state.mode, regenerate new problem
  modeSelect.addEventListener('change', (e)=>{
    state.mode = e.target.value;   // 'flash','visual','word','decompose'
    newProblem();
  });

  // opSelect change -> update state.op, regenerate
  opSelect.addEventListener('change', (e)=>{
    state.op = e.target.value;     // 'mix','add','sub'
    newProblem();
  });

  // maxNumber change -> clamp and regenerate
  maxNumber.addEventListener('change', (e)=>{
    let v = parseInt(e.target.value,10);
    if (!Number.isFinite(v)) v = 20;
    v = Math.max(5, Math.min(100, v));
    state.max = v;
    maxNumber.value = v;
    newProblem();
  });
}
