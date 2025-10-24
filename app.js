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

const nextBtn             = $('nextBtn');
const resetStatsBtn       = $('resetStats');
const downloadSessionBtn  = $('downloadSessionBtn');

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

  // Turn currentSession.history into a CSV string and trigger a download
function downloadSessionCSV() {
  if (!currentSession) {
    alert('No session loaded.');
    return;
  }

  const rows = currentSession.history || [];
  if (!rows.length) {
    alert('No attempts in this session yet.');
    return;
  }

  // CSV header
  const header = [
    'Problem',
    'StudentAnswer',
    'Correct',
    'TimeSeconds',
    'HintUsed',
    'Timestamp'
  ];

  // Map each attempt into a CSV-safe row
  // We'll include a timestamp per row using Date(...) for teacher reference
  const dataRows = rows.map(item => {
    // Clean commas/quotes for CSV safety
    const clean = (val) => {
      if (val === null || val === undefined) return '';
      const str = String(val);
      // wrap in quotes if it contains comma or quote
      if (str.includes(',') || str.includes('"') || str.includes('\n')) {
        return `"${str.replace(/"/g, '""')}"`;
      }
      return str;
    };

    return [
      clean(item.problemText),
      clean(item.studentAnswer),
      clean(item.correct ? 'Yes' : 'No'),
      clean(item.timeTaken),
      clean(item.hintUsed ? 'Yes' : 'No'),
      clean(new Date().toISOString()) // you could store per-attempt timestamp later if you want
    ].join(',');
  });

  const csvString = [header.join(','), ...dataRows].join('\n');

  // Create a blob and a temporary download link
  const blob = new Blob([csvString], { type: 'text/csv' });

  // Generate a filename with a date stamp so you can keep copies over time
  const now = new Date();
  const yyyy = now.getFullYear();
  const mm = String(now.getMonth()+1).padStart(2,'0');
  const dd = String(now.getDate()).padStart(2,'0');
  const fileName = `numbersense_session_${yyyy}-${mm}-${dd}.csv`;

  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

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
      text: `Split ${n} into two whole-number parts.`,
      hint:`Find two whole numbers that add to ${n}. Start small and build up.`
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
function getHint({ a, b, op }) {
  // SUBTRACTION HINTS
  if (op === '-') {

    // CASE A: both numbers under or equal to 10 and b < a
    // Student is likely still in "counting back" territory
    // Example: 9 - 4
    if (a <= 10 && b < a) {
      // We teach counting down, not formal regroup
      return `Start at ${a}. Count back ${b} steps. Where do you land?`;
    }

    // CASE B: subtracting a big chunk (like 17 - 12)
    // Strategy: take away 10 first, then take away the rest
    // We'll call "the rest" (b - 10) if b is 10 or more
    if (b >= 10 && b < a) {
      const extra = b - 10;
      if (extra > 0) {
        return `Take away 10 first. Then take away ${extra} more. How many are left after both steps?`;
      } else {
        // b is exactly 10
        return `Take away 10. How many are left?`;
      }
    }

    // CASE C: a > 10 and b < a
    // We want to use the “break apart to get to a friendly 10” idea.
    // Example: 14 - 6.
    // We think: go from 14 down to 10 (that used 4), then take away the rest (2).
    if (a > 10 && b < a) {
      const tens = Math.floor(a / 10) * 10; // e.g. 14 -> 10
      const distanceToTen = a - tens;      // how far from a down to that friendly 10
      const stillNeed = b - distanceToTen; // how much more to remove after hitting 10

      // If we can subtract just from the "ones" part without going past 0:
      // Example: 14 - 3. Ones is 4, and 4 >= 3.
      if (distanceToTen >= b) {
        // This reads: "14 is 10 and 4. Take 3 from the 4. Then put 10 with what's left."
        return `${a} is ${tens} and ${distanceToTen}. Take away ${b} from the ${distanceToTen}. Then put the ${tens} with what is left.`;
      }

      // Otherwise we need a two-step subtraction using 10 as an in-between.
      // Example: 14 - 6:
      //   "Go from 14 down to 10. That used 4. You still need to take away 2 more from 10."
      if (stillNeed > 0 && tens - stillNeed >= 0) {
        return `Think of ${a} as ${tens} and ${distanceToTen}. First go down from ${a} to ${tens} (that used ${distanceToTen}). You still need to take away ${stillNeed} more from ${tens}.`;
      }
    }

    // CASE D: generic fallback for subtraction
    // For anything like 25 - 7, 30 - 18, etc. that doesn't hit a special case above
    return `You have ${a}. You give away ${b}. Picture taking ${b} away. How many are left?`;
  }

  // ADDITION HINTS
  // (op === '+')

  // CASE 1: doubles (like 6 + 6)
  // We teach "double" as a known fact pattern, but we won't say the answer.
  if (a === b) {
    return `Double ${a}. That means counting ${a} two times.`;
  }

  // We'll define some helpers for clarity
  const bigger = Math.max(a, b);
  const smaller = Math.min(a, b);

  // CASE 2: both parts are 10 or less
  // This is usually where the student is either counting all or counting on.
  // We encourage "start at the bigger number and count up the smaller".
  if (a <= 10 && b <= 10) {
    // If the sum crosses 10 (like 8 + 5), we want to introduce "make 10".
    if (a + b > 10) {
      // classic make-10 language
      return `Make 10 first. Take what you need to get to 10, then add the rest.`;
    }

    // Otherwise, standard "count up" language
    return `Start at ${bigger}. Count up ${smaller} more. What number do you get?`;
  }

  // CASE 3: make a friendly 10 for larger numbers that are close to a 10 boundary
  // e.g. 14 + 6 -> think "14 + 6 is like 14 + 6 = 20; you can see 14 needs 6 to reach 20"
  // For a student with weak number sense, we don't want full place value terms,
  // but we DO want them thinking in chunks of 10 or 20.
  // We'll just say "push it to the next friendly number".
  const nextFriendly10 = Math.ceil(bigger / 10) * 10; // next 10 up from bigger
  const needToFriendly = nextFriendly10 - bigger;
  // Only use this hint if it's reasonable (needToFriendly is positive and less than smaller,
  // which means we can "use part of the smaller number" to get to that multiple of 10).
  if (needToFriendly > 0 && needToFriendly < smaller) {
    return `Build a friendly number. Use part of the smaller number to get from ${bigger} up to ${nextFriendly10}. Then add what is left.`;
  }

  // CASE 4: generic addition fallback
  return `Put ${a} and ${b} together. Think about adding the smaller number onto the bigger number.`;
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
    answerInput.placeholder = 'Type two whole numbers, like 2+3';
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

  // download session data as CSV
  downloadSessionBtn.addEventListener('click', () => {
    downloadSessionCSV();
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
