// NumberSense Tutor v3
// Key updates:
// - Enter now: grade AND immediately advance to a new problem
// - No repeated scoring on the same problem
// - Session history stored and displayed
// - Session picker overlay on load
// - Hint toggle removed; Hint button always available in controls

const SESSIONS_KEY = 'ns_sessions_v1'; // all sessions history
// We'll store array of sessions. Each session = { history: [...], stats: {...}, createdAt, lastUsedAt }
// The "current session" is last element of that array unless starting new

// Grab elements
const $ = (id)=>document.getElementById(id);

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

// internal runtime state
const state = {
  mode:       'flash',        // flash | visual | word | decompose
  op:         'mix',          // add | sub | mix
  max:        20,
  current:    null,           // {type:'arith'|'decompose', ...}
  startTime:  null,
  timerInt:   null,
  hintUsed:   false
};

// currentSession is an object {history:[], stats:{correct,attempted,times[],streak}, createdAt,lastUsedAt}
let currentSession = null;

/* -------------------------
   SESSION LOAD / SAVE
------------------------- */

function loadAllSessions(){
  const raw = localStorage.getItem(SESSIONS_KEY);
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) return parsed;
    return [];
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

// call this whenever we update currentSession
function persistSession(){
  let all = loadAllSessions();
  // by convention, currentSession is the last session in the array
  if (!all.length){
    all = [currentSession];
  } else {
    all[all.length-1] = currentSession;
  }
  currentSession.lastUsedAt = Date.now();
  saveAllSessions(all);
}

// choose session flow
continueBtn.addEventListener('click', () => {
  let all = loadAllSessions();
  if (!all.length){
    // nothing to continue -> make a new session
    currentSession = createNewSession();
    persistSession();
  } else {
    currentSession = all[all.length-1];
  }
  startApp();
});

newBtn.addEventListener('click', () => {
  let all = loadAllSessions();
  currentSession = createNewSession();
  all.push(currentSession);
  saveAllSessions(all);
  startApp();
});

function startApp(){
  // hide overlay, show app
  sessionOverlay.style.display = 'none';
  appShell.setAttribute('aria-hidden','false');

  // ui wiring that depends on session being ready
  wireUI();

  // sync selects from defaults (we can later persist these too if needed)
  modeSelect.value = state.mode;
  opSelect.value = state.op;
  maxNumber.value = state.max;

  // render initial stats/history
  renderStats();
  renderHistoryTable();

  // create first problem
  newProblem();
}


/* -------------------------
   PROBLEM GENERATION
------------------------- */

function randInt(min,max){
  return Math.floor(Math.random()*(max-min+1))+min;
}

function generateProblem(mode, op, max){
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
  const p = patterns[Math.floor(Math.random()*patterns.length)];
  return p(cur);
}


/* -------------------------
   RENDER A NEW PROBLEM
------------------------- */

function newProblem(){
  // build new problem
  const cur = generateProblem(state.mode, state.op, state.max);
  state.current = cur;
  state.startTime = Date.now();
  state.hintUsed = false;

  // draw UI
  feedback.textContent = '';
  hintText.textContent = '';
  visualArea.innerHTML = '';

  // show either symbol problem or story problem (word mode)
  if (state.mode === 'word' && cur.type === 'arith') {
    problemArea.textContent = makeStory(cur);
  } else {
    problemArea.textContent = cur.text;
  }

  // visual / ten-frame mode
  if (state.mode === 'visual' && (cur.type === 'arith' || cur.type === 'decompose')) {
    renderVisual(cur);
  }

  // configure input for this mode
  configureAnswerFieldForMode();

  // reset and focus input
  answerInput.value = '';
  answerInput.focus();

  // restart timer
  startTimer();
}

function renderVisual(cur){
  // We visualize:
  // - addition: filled dots = a+b
  // - subtraction: start with a dots and "cross out" b
  // - decomposition: show n dots
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

  // cross out for subtraction
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

function parseDecompose(raw){
  // accept "3+7", "3,7", "3 7"
  const m = raw.match(/(\d+)\s*(?:[,+\s])\s*(\d+)/);
  if(!m) return null;
  return [parseInt(m[1],10), parseInt(m[2],10)];
}

function allDecomposePairs(n){
  // returns ["1+14","2+13",...], no reversed duplicates
  const pairs=[];
  for(let a=1; a<=Math.floor(n/2); a++){
    const b=n-a;
    pairs.push(`${a}+${b}`);
  }
  return pairs;
}

function checkAnswerAndAdvance(){
  // If no current problem, do nothing
  if (!state.current) return;

  // Stop the timer immediately to get final time
  stopTimer();
  const timeTaken = Math.round((Date.now()-state.startTime)/1000);

  const cur = state.current;
  const raw = answerInput.value.trim();
  if (!raw){
    feedback.textContent = 'Please type an answer first.';
    startTimer(); // resume timing if they hadn't actually answered
    return;
  }

  let correct = false;
  let correctAnswer = null;

  if (cur.type === 'decompose'){
    const parts = parseDecompose(raw);
    if(parts){
      const sum = parts[0] + parts[1];
      correct = (sum === cur.n);
      correctAnswer = null; // we do not reveal decompose full answer set if wrong
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

  // Feedback text
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

  // Update session stats
  currentSession.stats.attempted++;
  currentSession.stats.times.push(timeTaken);
  if (correct){
    currentSession.stats.correct++;
    currentSession.stats.streak = (currentSession.stats.streak || 0) + 1;
  } else {
    currentSession.stats.streak = 0;
  }

  // Log this attempt in session history
  currentSession.history.push({
    problemText: displayTextForHistory(cur),
    studentAnswer: raw,
    correct,
    timeTaken,
    hintUsed: state.hintUsed
  });

  // Persist session to localStorage
  persistSession();

  // Refresh stats + history UI
  renderStats();
  renderHistoryTable();

  // Immediately start next problem so Enter can't "double count"
  newProblem();
}

function displayTextForHistory(cur){
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
   RENDER STATS + HISTORY
------------------------- */

function averageTime(times){
  if (!times.length) return 0;
  const sum = times.reduce((a,b)=>a+b,0);
  const avg = sum / times.length;
  // round to nearest whole second for display
  return Math.round(avg);
}

function renderStats(){
  statCorrect.textContent   = currentSession.stats.correct || 0;
  statAttempted.textContent = currentSession.stats.attempted || 0;
  statAvgTime.textContent   = averageTime(currentSession.stats.times);
  statStreak.textContent    = currentSession.stats.streak || 0;
}

function renderHistoryTable(){
  historyBody.innerHTML = '';
  // latest attempt at the top
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
    hintText.textContent = cur.hint || `Think of two numbers that add to ${cur.n}. Start small and work up.`;
  } else if (cur.type === 'arith'){
    hintText.textContent = cur.hint || 'Use what you know about tens to solve it.';
  } else {
    hintText.textContent = 'Think carefully about what the story is asking.';
  }
}


/* -------------------------
   INPUT / TIMER / EVENTS
------------------------- */

function configureAnswerFieldForMode(){
  if (state.current && state.current.type === 'decompose'){
    answerInput.setAttribute('type', 'text');
    answerInput.setAttribute('inputmode', 'numeric');
    answerInput.setAttribute('pattern', '[0-9, +]*');
    answerInput.removeAttribute('step');
    answerInput.placeholder = 'e.g., 3+7 or 3,7';
  } else {
    answerInput.setAttribute('type', 'number');
    answerInput.setAttribute('inputmode', 'numeric');
    answerInput.setAttribute('pattern', '[0-9]*');
    answerInput.setAttribute('step', '1');
    answerInput.placeholder = 'Type answer';
  }
}

// sanitize pasted text
answerInput.addEventListener('paste',(e)=>{
  e.preventDefault();
  const text=(e.clipboardData||window.clipboardData).getData('text')||'';
  const cleaned = (state.current && state.current.type === 'decompose')
    ? text.replace(/[^0-9,+ ]/g,'')
    : text.replace(/[^0-9]/g,'');
  document.execCommand('insertText', false, cleaned);
});

// block invalid typing, plus N shortcut
answerInput.addEventListener('keydown',(e)=>{
  if (e.key === 'Enter'){
    // let form submit handle it
    return;
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

// Also allow N and H globally when not typing
document.addEventListener('keydown',(e)=>{
  if (e.target===answerInput) return;
  if (e.key.toLowerCase()==='n'){
    newProblem();
  }
  if (e.key.toLowerCase()==='h'){
    showHint();
  }
});

// Answer form submit (Enter or Check click)
answerForm.addEventListener('submit',(e)=>{
  e.preventDefault();
  checkAnswerAndAdvance();
});

// New problem button
nextBtn.addEventListener('click',()=>{
  newProblem();
});

// Hint button
hintBtn.addEventListener('click',()=>{
  showHint();
});

// Reset all data (wipe sessions)
resetStatsBtn.addEventListener('click',()=>{
  if (confirm('This will erase all saved sessions and progress. Are you sure?')){
    localStorage.removeItem(SESSIONS_KEY);
    // start brand new session
    currentSession = createNewSession();
    persistSession();
    renderStats();
    renderHistoryTable();
    newProblem();
  }
});


/* -------------------------
   TIMER
------------------------- */

function startTimer(){
  stopTimer();
  timerEl.textContent = 'Time: 0s';
  state.startTime = Date.now();
  state.timerInt = setInterval(()=>{
    timerEl.textContent = 'Time: ' + Math.round((Date.now()-state.startTime)/1000) + 's';
  },300);
}
function stopTimer(){
  if(state.timerInt){
    clearInterval(state.timerInt);
    state.timerInt=null;
  }
}
