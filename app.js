const SETTINGS_KEY='ns_settings_v2';
const STATS_KEY='ns_stats_v2';

// Grab elements
const els = (id) => document.getElementById(id);
const modeSelect    = els('modeSelect');
const opSelect      = els('opSelect');
const maxNumber     = els('maxNumber');
const hintLevel     = els('hintLevel');
const problemArea   = els('problemArea');
const visualArea    = els('visualArea');
const answerInput   = els('answerInput');
const checkBtn      = els('checkBtn');
const nextBtn       = els('nextBtn');
const hintBtn       = els('hintBtn');
const hintText      = els('hintText');
const feedback      = els('feedback');
const timer         = els('timer');
const statCorrect   = els('statCorrect');
const statAttempted = els('statAttempted');
const statAvgTime   = els('statAvgTime');
const statStreak    = els('statStreak');
const resetStats    = els('resetStats');
const answerForm    = els('answerForm'); // <form> around the input+check

// App state
const state = {
  mode:'flash',        // flash | visual | word | decompose
  op:'mix',            // add | sub | mix
  max:20,
  hint:true,
  current:null,        // current problem object
  startTime:null,      // timestamp when current problem started
  stats:loadStats(),   // {correct, attempted, times[], streak}
  scoringLock:false    // prevents double-counting the SAME attempt
};

// init
applySavedSettings();
wireUI();
updateStats();
newProblem();

/* --------------------------
   SETTINGS / PERSISTENCE
---------------------------*/
function applySavedSettings(){
  const s = JSON.parse(localStorage.getItem(SETTINGS_KEY)||'null');
  if (s){
    state.mode  = s.mode || state.mode;
    state.op    = s.op   || state.op;
    state.max   = s.max  || state.max;
    state.hint  = !!s.hint;
  }
  modeSelect.value   = state.mode;
  opSelect.value     = state.op;
  maxNumber.value    = state.max;
  hintLevel.value    = state.hint ? 'on' : 'off';
}

function saveSettings(){
  localStorage.setItem(SETTINGS_KEY,JSON.stringify({
    mode:state.mode,
    op:state.op,
    max:state.max,
    hint:state.hint
  }));
}

/* --------------------------
   MODE HELPERS
---------------------------*/
function isDecomposeMode() {
  return state.current && state.current.type === 'decompose';
}

// Dynamically choose input behavior (text for decompose, number otherwise)
function setAnswerInputType() {
  if (isDecomposeMode()) {
    answerInput.setAttribute('type', 'text');
    answerInput.setAttribute('inputmode', 'numeric');
    answerInput.setAttribute('pattern', '[0-9, +]*');
    answerInput.setAttribute('autocomplete', 'off');
    answerInput.removeAttribute('step');
    answerInput.placeholder = 'e.g., 3+7 or 3,7';
  } else {
    answerInput.setAttribute('type', 'number');
    answerInput.setAttribute('inputmode', 'numeric');
    answerInput.setAttribute('pattern', '[0-9]*');
    answerInput.setAttribute('step', '1');
    answerInput.setAttribute('autocomplete', 'off');
    answerInput.placeholder = 'Type answer';
  }
}

/* --------------------------
   INPUT SANITIZING
---------------------------*/
function sanitizeAnswerField() {
  const val = answerInput.value || '';
  const allowed = isDecomposeMode() ? /[0-9,+ ]/g : /[0-9]/g;
  const cleaned = (val.match(allowed) || []).join('');
  if (val !== cleaned) answerInput.value = cleaned;
}

// sanitize pasted text
answerInput.addEventListener('paste', (e) => {
  e.preventDefault();
  const text = (e.clipboardData || window.clipboardData).getData('text') || '';
  const cleaned = isDecomposeMode()
    ? text.replace(/[^0-9,+ ]/g,'')
    : text.replace(/[^0-9]/g,'');
  document.execCommand('insertText', false, cleaned);
});

// final cleanup for any weird input events
answerInput.addEventListener('input', sanitizeAnswerField);

// Block typing of non-allowed keys AND map N shortcut
answerInput.addEventListener('keydown', (e) => {
  // Let browser handle Enter (form submit), so don't block Enter
  if (e.key === 'Enter') {
    return;
  }

  // N shortcut -> new problem (and don't let "n" appear)
  if ((e.key === 'n' || e.key === 'N') &&
      !e.ctrlKey && !e.metaKey && !e.altKey && !e.altGraphKey) {
    e.preventDefault();
    newProblem();
    return;
  }

  // navigation/system keys always allowed
  const navKeys = ['Backspace','Delete','ArrowLeft','ArrowRight','Tab','Home','End'];
  if (navKeys.includes(e.key) || e.ctrlKey || e.metaKey) return;

  // only allow digits (and comma/plus/space in decompose mode)
  const ok = isDecomposeMode()
    ? /[0-9,+ ]/.test(e.key)
    : /[0-9]/.test(e.key);

  if (!ok) e.preventDefault();
});

/* --------------------------
   UI WIRING
---------------------------*/
function wireUI(){
  // form submit = clicking Check OR pressing Enter
  answerForm.addEventListener('submit', (e) => {
    e.preventDefault();
    checkAnswer(); // <-- ALWAYS just check
  });

  modeSelect.addEventListener('change', e => {
    state.mode = e.target.value;
    saveSettings();
    newProblem();
  });

  opSelect.addEventListener('change', e => {
    state.op = e.target.value;
    saveSettings();
    newProblem();
  });

  maxNumber.addEventListener('change', e => {
    let v = parseInt(e.target.value || 20, 10);
    if(!Number.isFinite(v)) v = 20;
    v = Math.max(5, Math.min(100, v));
    state.max = v;
    maxNumber.value = v;
    saveSettings();
    newProblem();
  });

  hintLevel.addEventListener('change', e => {
    state.hint = (e.target.value === 'on');
    hintBtn.disabled = !state.hint;
    saveSettings();
  });

  // New Problem button
  nextBtn.addEventListener('click', () => {
    newProblem();
  });

  // Hint button
  hintBtn.addEventListener('click', showHint);

  // Global shortcuts when NOT typing in the box:
  // N = new problem, H = hint
  document.addEventListener('keydown', e => {
    if (e.target === answerInput) return; // don't interfere while typing
    if (e.key.toLowerCase() === 'n') {
      newProblem();
    }
    if (e.key.toLowerCase() === 'h') {
      showHint();
    }
  });

  // Reset stats button
  resetStats.addEventListener('click', () => {
    if (confirm('Reset local progress?')) {
      state.stats = {correct:0, attempted:0, times:[], streak:0};
      saveStats();
      updateStats();
    }
  });

  // disable hint if off
  hintBtn.disabled = !state.hint;
}

/* --------------------------
   PROBLEM GENERATION
---------------------------*/
function randInt(min,max){
  return Math.floor(Math.random()*(max-min+1))+min;
}

function generateProblem(mode, op, max){
  // decompose mode
  if (mode === 'decompose'){
    const n = randInt(5, Math.max(6, max));
    const a = randInt(1, n-1);
    const b = n - a;
    return {
      type:'decompose',
      n,
      parts:[a,b],
      text:`Split ${n} into two parts`,
      answer:`${a},${b}`,
      hint:`Try pairs like 1 + ${n-1}, 2 + ${n-2}, …`
    };
  }

  // choose + or - if mixed
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
      text:`${a} + ${b} = ?`,
      answer:(a+b),
      hint:getHint({a,b,op:'+'})
    };
  } else {
    const a = randInt(2, max);
    const b = randInt(1, a-1);
    return {
      type:'arith',
      a,b,
      op:'-',
      text:`${a} - ${b} = ?`,
      answer:(a-b),
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
    return `What’s left when you take ${b} from ${a}?`;
  }

  // addition hints
  if (a + b === 10) {
    return `Make 10: ${a} + ${b} = 10`;
  }
  if (a < 10 && b < 10 && a + b > 10) {
    return `Make 10 with ${10-a} from ${b}, then add the rest.`;
  }
  if (a === b) {
    return `Double ${a}: ${a}+${a}=${a+b}.`;
  }
  return `Add ${a} and ${b}.`;
}

/* --------------------------
   RENDER CURRENT PROBLEM
---------------------------*/
function renderCurrent(){
  const cur = state.current;
  if (!cur) return;

  // Problem text / word problem mode
  problemArea.textContent =
    (state.mode === 'word' && cur.type === 'arith')
      ? generateStory(cur)
      : cur.text;

  // clear UI areas
  visualArea.innerHTML = '';
  hintText.textContent = '';
  feedback.textContent = '';

  // Render visual ten-frame if in Visual mode
  if (state.mode === 'visual' && (cur.type === 'arith' || cur.type === 'decompose')) {
    const n = (cur.type === 'arith')
      ? (cur.op === '+' ? cur.a + cur.b : cur.a)
      : cur.n;

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

    // if subtraction, cross out the ones taken away
    if (cur.type === 'arith' && cur.op === '-') {
      const totalCells = container.querySelectorAll('.cell.filled');
      for (let i=totalCells.length-1, rem=cur.b; rem>0 && i>=0; i--, rem--){
        totalCells[i].classList.add('crossed');
        totalCells[i].classList.remove('filled');
      }
    }

    visualArea.appendChild(container);
  }

  // Make sure input is set up for this mode
  setAnswerInputType();
  answerInput.value = '';
  answerInput.focus();

  // reset the per-question scoring lock
  state.scoringLock = false;

  // restart timer
  startTimer();
}

// Word problem generator text
function generateStory(cur){
  const patterns = [
    ({a,b,op}) => op==='+' ?
      `You have ${a} toy cars and your friend gives you ${b} more. How many now?` :
      `You had ${a} stickers and gave away ${b}. How many left?`,
    ({a,b,op}) => op==='+' ?
      `There are ${a} apples on a tree and ${b} fall down. Total on the ground?` :
      `You collected ${a} shells and lost ${b}. How many remain?`,
    ({a,b,op}) => op==='+' ?
      `A class reads ${a} pages on Monday and ${b} on Tuesday. Pages in all?` :
      `A baker made ${a} cupcakes and sold ${b}. Cupcakes left?`
  ];
  const pick = patterns[Math.floor(Math.random()*patterns.length)];
  return pick(cur);
}

/* --------------------------
   NEW PROBLEM
---------------------------*/
function newProblem(){
  state.current   = generateProblem(state.mode, state.op, state.max);
  state.startTime = Date.now();
  renderCurrent();
}

/* --------------------------
   ANSWER CHECKING
---------------------------*/
function parseDecompose(raw){
  // accept "3+7", "3,7", "3 7"
  const m = raw.match(/(\d+)\s*(?:[,+\s])\s*(\d+)/);
  if(!m) return null;
  return [parseInt(m[1],10), parseInt(m[2],10)];
}

// returns ["1+14","2+13","3+12", ...] with no reversed duplicates
function allDecomposePairs(n){
  const pairs=[];
  for(let a=1; a<=Math.floor(n/2); a++){
    const b=n-a;
    pairs.push(`${a}+${b}`);
  }
  return pairs;
}

function checkAnswer(){
  // if we already scored this exact attempt and haven't typed anything new,
  // don't add another attempt.
  if (state.scoringLock) {
    return;
  }

  const cur = state.current;
  if(!cur){
    return;
  }

  const raw = answerInput.value.trim();
  if(!raw){
    feedback.textContent = 'Please type an answer.';
    return;
  }

  let correct = false;

  if(cur.type === 'decompose'){
    const parts = parseDecompose(raw);
    if(parts){
      correct = (parts[0] + parts[1] === cur.n);
    } else {
      feedback.textContent = 'Format: try 3+7 or 3,7';
      return;
    }
  } else {
    const num = Number(raw);
    if(Number.isFinite(num)){
      correct = (num === cur.answer);
    }
  }

  const timeTaken = Math.round((Date.now()-state.startTime)/1000);

  // update stats for THIS attempt
  state.stats.attempted++;
  state.stats.times.push(timeTaken);

  if (correct){
    state.stats.correct++;
    state.stats.streak = (state.stats.streak || 0) + 1;

    if (cur.type === 'decompose'){
      const pairs = allDecomposePairs(cur.n).join(' • ');
      feedback.innerHTML =
        `✅ Correct — all ways to make ${cur.n}: ` +
        `<span style="font-weight:600">${pairs}</span> ` +
        `(took ${timeTaken}s)`;
    } else {
      feedback.textContent =
        `✅ Correct — ${cur.a} ${cur.op} ${cur.b} = ${cur.answer} ` +
        `(took ${timeTaken}s)`;
    }
  } else {
    state.stats.streak = 0;

    if (cur.type === 'decompose'){
      // don't give the answer away
      feedback.textContent = `❌ Not quite. Try another split for ${cur.n}.`;
    } else {
      // for normal +/-, we *do* give the correct answer
      feedback.textContent =
        `❌ Not quite. Answer is ${cur.answer}.`;
    }
  }

  saveStats();
  updateStats();
  stopTimer();

  // lock this attempt so hammering Enter doesn't keep inflating stats
  state.scoringLock = true;
}

/* --------------------------
   HINT BUTTON
---------------------------*/
function showHint(){
  const cur = state.current;
  if(!cur) return;

  if(!state.hint){
    hintText.textContent = 'Hints are off.';
    return;
  }

  if(cur.type === 'decompose'){
    hintText.textContent = cur.hint ||
      `Think of two numbers that add to ${cur.n}. Start small and work up.`;
  } else {
    hintText.textContent = cur.hint ||
      'Use what you know about 10s to solve it.';
  }
}

/* --------------------------
   STATS
---------------------------*/
function updateStats(){
  statCorrect.textContent   = state.stats.correct || 0;
  statAttempted.textContent = state.stats.attempted || 0;
  const times = state.stats.times || [];
  const avg = times.length
    ? Math.round(times.reduce((a,b)=>a+b,0)/times.length)
    : 0;
  statAvgTime.textContent   = avg;
  statStreak.textContent    = state.stats.streak || 0;
}

function saveStats(){
  localStorage.setItem(STATS_KEY, JSON.stringify(state.stats));
}

function loadStats(){
  const s = localStorage.getItem(STATS_KEY);
  return s
    ? JSON.parse(s)
    : {correct:0, attempted:0, times:[], streak:0};
}

/* --------------------------
   TIMER
---------------------------*/
let timerInterval=null;

function startTimer(){
  stopTimer();
  timer.textContent = 'Time: 0s';
  state.startTime = Date.now();
  timerInterval = setInterval(() => {
    timer.textContent = 'Time: ' +
      Math.round((Date.now()-state.startTime)/1000) + 's';
  }, 300);
}

function stopTimer(){
  if(timerInterval){
    clearInterval(timerInterval);
    timerInterval = null;
  }
}
