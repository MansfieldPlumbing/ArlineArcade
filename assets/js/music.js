/* ============================================================================
   Arline Arcade — generative chiptune background music
   Loops a tasteful lounge/jazz chord progression through the SAME Web Audio
   synth context as sfx.js. No audio files: soft bass + sustained pad + a light
   arpeggio, a few hundred bytes of code, fully offline.
   Progression voicings are in the spirit of the MIT-licensed mood library
   ldrolez/free-midi-chords (https://github.com/ldrolez/free-midi-chords).
   Music-only mute toggle, persisted. Begins on the first user gesture.
   ============================================================================ */
import sfx from './sfx.js';

const LS = 'arline-music';
let enabled = localStorage.getItem(LS) !== '0';        // default on
let ctx = null, master = null, timer = null, playing = false;
let nextBar = 0, bar = 0;

const BPM = 100, BEATS = 4;
const beat = 60 / BPM;
const barDur = beat * BEATS;
const mtof = (m) => 440 * Math.pow(2, (m - 69) / 12);

/* 8-bar casino-lounge loop: Cmaj7 · A7 · Dm7 · G7 · Em7 · A7 · Dm7 · G7 */
const PROG = [
  { bass:48, notes:[60,64,67,71] },  // Cmaj7  C E G B
  { bass:45, notes:[61,64,67,69] },  // A7     C# E G A
  { bass:50, notes:[62,65,69,72] },  // Dm7    D F A C
  { bass:43, notes:[59,62,65,67] },  // G7     B D F G
  { bass:52, notes:[59,62,64,67] },  // Em7    B D E G
  { bass:45, notes:[61,64,67,69] },  // A7
  { bass:50, notes:[62,65,69,72] },  // Dm7
  { bass:43, notes:[59,62,65,67] },  // G7
];

function ensure(){
  ctx = sfx.context(); if(!ctx) return false;
  if(!master){ master = ctx.createGain(); master.gain.value = 0; master.connect(ctx.destination); }
  return true;
}
function voice(freq, start, dur, gain, type, atk){
  const o = ctx.createOscillator(), g = ctx.createGain();
  o.type = type; o.frequency.value = freq;
  g.gain.setValueAtTime(0.0001, start);
  g.gain.linearRampToValueAtTime(gain, start + (atk || 0.012));
  g.gain.exponentialRampToValueAtTime(0.0007, start + dur);
  o.connect(g); g.connect(master);
  o.start(start); o.stop(start + dur + 0.03);
}
function scheduleBar(i, t){
  const ch = PROG[i % PROG.length];
  voice(mtof(ch.bass),   t,           beat*1.6, 0.10,  'triangle', 0.01);  // root on 1
  voice(mtof(ch.bass+7), t + beat*2,  beat*1.4, 0.085, 'triangle', 0.01);  // fifth on 3
  ch.notes.forEach((m)=> voice(mtof(m), t + 0.01, barDur*0.92, 0.045, 'sine', 0.06)); // pad
  for(let b=0;b<BEATS;b++){                                                 // sparse off-beat arp
    const m = ch.notes[b % ch.notes.length] + 12;
    voice(mtof(m), t + b*beat + beat*0.5, beat*0.42, 0.03, 'square', 0.005);
  }
}
function sched(){
  if(!ctx) return;
  while(nextBar < ctx.currentTime + 0.25){ scheduleBar(bar, nextBar); nextBar += barDur; bar++; }
}
function start(){
  if(playing || !enabled) return;
  if(!ensure()) return;
  sfx.unlock();
  playing = true; bar = 0; nextBar = ctx.currentTime + 0.18;
  master.gain.cancelScheduledValues(ctx.currentTime);
  master.gain.setValueAtTime(Math.max(0.0001, master.gain.value), ctx.currentTime);
  master.gain.linearRampToValueAtTime(0.42, ctx.currentTime + 1.6);        // gentle fade-in
  sched();
  timer = setInterval(sched, 30);
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
  btn.title = enabled ? 'Music on' : 'Music off';
}
function toggle(btn){
  enabled = !enabled; localStorage.setItem(LS, enabled ? '1' : '0');
  updateBtn(btn);
  if(enabled) start(); else stop();
}

const btn = document.getElementById('musicToggle');
if(btn){ updateBtn(btn); btn.addEventListener('click', (e)=>{ e.stopPropagation(); toggle(btn); }); }
window.addEventListener('pointerdown', ()=>{ if(enabled) start(); }, { once:true });

export default { start, stop, toggle:()=>toggle(btn), isOn:()=>enabled };
