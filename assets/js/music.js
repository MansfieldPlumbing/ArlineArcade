/* ============================================================================
   Arline Arcade — background music jukebox  (sampled, offline)
   ----------------------------------------------------------------------------
   Three looping 32-step grooves — 90s-MIDI Rock, Reggae/Ska, and Bossanova —
   played through the SHARED sampler + synth drums in sfx.js (self-hosted FluidR3
   guitar/bass samples, no CDN, no files streamed at runtime). The single music
   button cycles: Off → Rock → Reggae → Bossa → Off. Choice is persisted, music
   starts on the first gesture, and it never plays while the tab is hidden.

   Groove patterns (guitar / bass = MIDI notes, 0 = rest; drums 36=kick 38=snare
   42=hat) are original arrangements characteristic of each genre.
   ============================================================================ */
import sfx from './sfx.js';

const LS = 'arline-music', LSG = 'arline-genre';
let enabled  = localStorage.getItem(LS) === '1';                 // default OFF
let genreIdx = Math.max(0, Math.min(2, +(localStorage.getItem(LSG) || 0)));
let ctx = null, master = null, timer = null, playing = false, step = 0, nextTime = 0;

const GENRES = [
  { name:'Rock', bpm:135,
    guitar:[40,0,40,52,0,43,0,45,40,0,40,55,53,0,52,0,38,0,38,50,0,41,0,43,40,40,52,0,47,45,43,42],
    bass:  [28,28,28,28,31,31,33,33,28,28,28,28,31,31,30,29,26,26,26,26,29,29,31,31,28,28,28,28,35,34,32,31],
    drums: [36,42,38,42,36,36,38,42,36,42,38,42,36,42,38,42,36,42,38,42,36,36,38,42,36,42,38,42,38,38,38,0] },
  { name:'Reggae', bpm:120,
    guitar:[0,52,0,52,0,55,0,55,0,57,0,57,0,52,0,52,0,53,0,53,0,55,0,55,0,52,0,52,0,52,0,0],
    bass:  [28,0,31,34,33,0,28,0,35,0,31,0,28,31,33,35,29,0,33,36,31,0,34,0,28,31,33,34,28,0,0,0],
    drums: [42,0,42,38,42,0,42,38,42,0,42,38,42,0,42,38,42,0,42,38,42,0,42,38,42,0,42,38,42,36,38,0] },
  { name:'Bossa', bpm:110,
    guitar:[52,0,52,0,0,55,0,55,0,57,0,57,0,52,0,0,50,0,50,0,0,53,0,53,0,52,0,52,0,0,0,0],
    bass:  [28,0,0,35,33,0,0,28,29,0,0,36,28,0,35,0,26,0,0,33,31,0,0,26,28,0,0,35,28,0,0,0],
    drums: [36,42,42,38,36,42,38,42,36,42,42,38,36,42,38,42,36,42,42,38,36,42,38,42,36,42,42,38,36,38,36,38] },
];

function ensure(){
  ctx = sfx.context(); if(!ctx) return false;
  if(!master){ master = ctx.createGain(); master.gain.value = 0; master.connect(ctx.destination); }
  return true;
}
function schedule(){
  if(!ctx) return;
  const g = GENRES[genreIdx];
  const sd = 60 / g.bpm / 2;                                     // eighth-note step
  while(nextTime < ctx.currentTime + 0.2){
    const i = step % 32;
    const gm = g.guitar[i]; if(gm) sfx.sampleNote('guitar', gm, { when:nextTime, dur:sd*1.5, gain:0.16, dest:master });
    const bm = g.bass[i];   if(bm) sfx.sampleNote('bass',   bm, { when:nextTime, dur:sd*1.9, gain:0.22, dest:master });
    const dm = g.drums[i];
    if(dm === 36)      sfx.drum('kick',  { when:nextTime, gain:0.5,  dest:master });
    else if(dm === 38) sfx.drum('snare', { when:nextTime, gain:0.4,  dest:master });
    else if(dm === 42) sfx.drum('hat',   { when:nextTime, gain:0.55, dest:master });
    nextTime += sd; step++;
  }
}
function start(){
  if(playing || !enabled) return;
  if(!ensure()) return;
  sfx.unlock();
  playing = true; step = 0; nextTime = ctx.currentTime + 0.2;
  master.gain.cancelScheduledValues(ctx.currentTime);
  master.gain.setValueAtTime(0.0001, ctx.currentTime);
  master.gain.linearRampToValueAtTime(0.5, ctx.currentTime + 1.2);   // gentle fade-in
  schedule();
  timer = setInterval(schedule, 40);
}
function stop(){
  playing = false;
  if(timer){ clearInterval(timer); timer = null; }
  if(ctx && master){
    master.gain.cancelScheduledValues(ctx.currentTime);
    master.gain.setValueAtTime(master.gain.value, ctx.currentTime);
    master.gain.linearRampToValueAtTime(0.0001, ctx.currentTime + 0.4);
  }
}
function updateBtn(btn){
  if(!btn) return;
  btn.textContent = enabled ? '♪' : '🔇';
  btn.classList.toggle('off', !enabled);
  btn.setAttribute('aria-pressed', enabled ? 'true' : 'false');
  btn.title = enabled ? `Music: ${GENRES[genreIdx].name} (tap to change)` : 'Music off';
  btn.setAttribute('aria-label', enabled ? `Music on: ${GENRES[genreIdx].name}. Tap to change track.` : 'Music off. Tap to play.');
}
/* One button, four states: Off → Rock → Reggae → Bossa → Off. */
function cycle(btn){
  if(!enabled){ enabled = true; }                       // was off → start current genre
  else if(genreIdx < GENRES.length - 1){ genreIdx++; stop(); }   // next genre
  else { enabled = false; genreIdx = 0; }               // past the last → back to off
  localStorage.setItem(LS, enabled ? '1' : '0');
  localStorage.setItem(LSG, String(genreIdx));
  updateBtn(btn);
  if(enabled) start(); else stop();
}

const btn = document.getElementById('musicToggle');
if(btn){ updateBtn(btn); btn.addEventListener('click', (e)=>{ e.stopPropagation(); cycle(btn); }); }
window.addEventListener('pointerdown', ()=>{ if(enabled) start(); }, { once:true });
document.addEventListener('visibilitychange', ()=>{ if(document.hidden) stop(); else if(enabled) start(); });

export default { start, stop, cycle:()=>cycle(btn), isOn:()=>enabled, genre:()=>GENRES[genreIdx].name };
