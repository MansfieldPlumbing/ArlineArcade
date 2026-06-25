/* Craps — Arline Arcade.
   Two real 3D dice (CSS preserve-3d cubes) that tumble + bounce on the felt, then
   settle to show the roll. Standard craps come-out / point flow drives the status.
   Rules are public; bet-resolution cross-checked against skent259/crapssim (MIT). */

// value -> cube rotation that brings that face to the front (matches .fN placement in CSS)
const SHOW = { 1:[0,0], 2:[0,-90], 3:[-90,0], 4:[90,0], 5:[0,90], 6:[0,180] };
// pip positions per face value, as [x%, y%] within the face
const PIPS = {
  1:[[50,50]],
  2:[[28,28],[72,72]],
  3:[[28,28],[50,50],[72,72]],
  4:[[28,28],[72,28],[28,72],[72,72]],
  5:[[28,28],[72,28],[50,50],[28,72],[72,72]],
  6:[[28,25],[72,25],[28,50],[72,50],[28,75],[72,75]],
};
const TILT = 'rotateX(-16deg) rotateY(22deg)';      // constant 3/4 "camera" on .lift
const reduce = matchMedia('(prefers-reduced-motion:reduce)').matches;

function buildDie(el, value){
  el.innerHTML = '';
  for (let f = 1; f <= 6; f++){
    const face = document.createElement('div');
    face.className = 'face f' + f;
    for (const [x,y] of PIPS[f]){
      const pip = document.createElement('span');
      pip.className = 'pip';
      pip.style.left = x + '%'; pip.style.top = y + '%';
      face.appendChild(pip);
    }
    el.appendChild(face);
  }
  setFace(el, value);
}
function setFace(el, v){
  const [x,y] = SHOW[v];
  el.style.transform = `rotateX(${x}deg) rotateY(${y}deg)`;
  el.dataset.val = v;
}

// --- elements ---
const dice  = [document.getElementById('die0'),  document.getElementById('die1')];
const lifts = [document.getElementById('lift0'), document.getElementById('lift1')];
const shads = [document.getElementById('sh0'),   document.getElementById('sh1')];
const totalEl  = document.getElementById('total');
const statusEl = document.getElementById('status');
const hintEl   = document.getElementById('hint');
const puckEl   = document.getElementById('puck');
const rollBtn  = document.getElementById('rollBtn');
const pit      = document.getElementById('pit');

buildDie(dice[0], 4);
buildDie(dice[1], 3);
lifts.forEach(l => l.style.transform = TILT);

// --- game state ---
let phase = 'comeout';   // 'comeout' | 'point'
let point = 0;
let rolling = false;

function bounceH(){ return Math.min(200, Math.max(90, Math.round(innerHeight * 0.26))); }

function animateDie(i, value){
  const H = bounceH();
  const die = dice[i], lift = lifts[i], sh = shads[i];
  const [fx,fy] = SHOW[value];
  const nx = 2 + Math.floor(Math.random()*3), ny = 2 + Math.floor(Math.random()*3);
  const dir = i ? 1 : -1;                       // dice spin opposite ways
  const dur = 1000 + Math.floor(Math.random()*220);

  // cube tumble: from wherever it is, spin several turns, settle exactly on the value
  die.animate(
    [ { transform: die.style.transform },
      { transform: `rotateX(${fx + dir*360*nx}deg) rotateY(${fy + dir*360*ny}deg)` } ],
    { duration: dur, easing: 'cubic-bezier(.15,.62,.28,1)', fill: 'forwards' }
  );
  // vertical bounce (tilt preserved each keyframe)
  const up = 'cubic-bezier(.18,.7,.42,1)', down = 'cubic-bezier(.5,0,.82,.5)';
  lift.animate([
    { transform:`translateY(0px) ${TILT}`,              easing:up   },
    { transform:`translateY(${-H}px) ${TILT}`,    offset:.30, easing:down },
    { transform:`translateY(0px) ${TILT}`,        offset:.58, easing:up   },
    { transform:`translateY(${-H*0.4}px) ${TILT}`,offset:.74, easing:down },
    { transform:`translateY(0px) ${TILT}`,        offset:.9,  easing:up   },
    { transform:`translateY(${-H*0.12}px) ${TILT}`,offset:.96,easing:down },
    { transform:`translateY(0px) ${TILT}` },
  ], { duration: dur, fill:'forwards' });
  // contact shadow tightens as the die rises
  sh.animate([
    { transform:'translateX(-50%) scale(1)',   opacity:.5  },
    { transform:'translateX(-50%) scale(.55)', opacity:.2, offset:.30 },
    { transform:'translateX(-50%) scale(1)',   opacity:.5, offset:.58 },
    { transform:'translateX(-50%) scale(.78)', opacity:.32,offset:.74 },
    { transform:'translateX(-50%) scale(1)',   opacity:.5  },
  ], { duration: dur, fill:'forwards' });

  return new Promise(res => setTimeout(() => { setFace(die, value); res(); }, dur));
}

function resolve(a, b){
  const t = a + b;
  totalEl.textContent = t;
  statusEl.classList.remove('win','lose');
  const say = (msg, cls) => { statusEl.textContent = msg; if (cls) statusEl.classList.add(cls); };

  if (phase === 'comeout'){
    if (t === 7 || t === 11){ say(`${t} — a natural! Pass line wins. 🎉`, 'win'); }
    else if (t === 2 || t === 3 || t === 12){ say(`${t} — craps. Line loses.`, 'lose'); }
    else {
      point = t; phase = 'point';
      puckEl.textContent = String(t); puckEl.classList.replace('off','on');
      say(`Point is ${t} — roll ${t} again before a 7.`);
      hintEl.textContent = `Make the ${t} to win · a 7 now loses`;
    }
  } else {
    if (t === point){
      say(`${t} — point made! Pass line wins. 🎉`, 'win'); endPoint();
    } else if (t === 7){
      say(`Seven out — line loses.`, 'lose'); endPoint();
    } else {
      say(`Rolled ${t} — point is still ${point}. Roll again.`);
    }
  }
}
function endPoint(){
  phase = 'comeout'; point = 0;
  puckEl.textContent = 'OFF'; puckEl.classList.replace('on','off');
  setTimeout(() => { hintEl.textContent = '7 or 11 wins · 2, 3, 12 craps'; }, 1400);
}

async function roll(){
  if (rolling) return;
  rolling = true; rollBtn.disabled = true;
  totalEl.textContent = '';
  statusEl.classList.remove('win','lose');
  if (phase === 'comeout') statusEl.textContent = 'Rolling…';

  const a = 1 + Math.floor(Math.random()*6), b = 1 + Math.floor(Math.random()*6);
  if (reduce){ setFace(dice[0], a); setFace(dice[1], b); }
  else { await Promise.all([ animateDie(0, a), animateDie(1, b) ]); }
  resolve(a, b);

  rolling = false; rollBtn.disabled = false;
}

rollBtn.addEventListener('click', roll);
pit.addEventListener('click', roll);
