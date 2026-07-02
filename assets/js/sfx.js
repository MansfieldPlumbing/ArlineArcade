/* ============================================================================
   Arline Arcade — shared game-audio engine  (sampled + synth hybrid)
   ----------------------------------------------------------------------------
   Real 16-bit-flavoured instrument hits from a tiny set of self-hosted FluidR3
   samples (overdriven guitar, electric bass, tinkle bell — CC-BY 3.0, vendored
   under assets/audio/ so the arcade still works fully OFFLINE, no CDN, no GPL),
   layered with punchy synthesized drums and routed through a gentle "soundcard"
   rack (warm lowpass + a whisper of slap-delay) for that late-90s PC-game vibe.

   Design notes:
   - Same public API as before (deal/flip/pickup/place/foundation/invalid/
     shuffle/win + unlock/context/mute) so every game keeps working untouched.
   - Samples load lazily on the first user gesture. Until they finish decoding,
     every voice falls back to a synth pluck, so there is never dead silence.
   - Mobile-safe: the AudioContext is created lazily and unlocked on first tap.
   ========================================================================== */

let ctx = null;
let muted = false;

function ac(){
  if(!ctx){
    const AC = window.AudioContext || window.webkitAudioContext;
    if(!AC) return null;
    ctx = new AC();
  }
  return ctx;
}
const mtof = (m) => 440 * Math.pow(2, (m - 69) / 12);

/* --- the "soundcard" master rack ------------------------------------------ */
let _master = null;
function master(){
  const c = ac(); if(!c) return null;
  if(!_master){
    _master = c.createGain(); _master.gain.value = 0.9;
    const lp = c.createBiquadFilter();                 // warm, slightly dark cutoff
    lp.type = 'lowpass'; lp.frequency.value = 7200; lp.Q.value = 0.4;
    _master.connect(lp); lp.connect(c.destination);     // dry path
    // a whisper of slap-delay for a hint of room (kept subtle so taps stay crisp)
    const send = c.createGain(); send.gain.value = 0.10;
    const dl = c.createDelay();   dl.delayTime.value = 0.14;
    const fb = c.createGain();    fb.gain.value = 0.20;
    const wet = c.createGain();   wet.gain.value = 0.9;
    lp.connect(send); send.connect(dl); dl.connect(fb); fb.connect(dl);
    dl.connect(wet); wet.connect(c.destination);
  }
  return _master;
}

/* --- lazy sample bank ----------------------------------------------------- */
// url()s resolve relative to THIS module, so every game page loads the same files.
const AUDIO_BASE = new URL('../audio/', import.meta.url);
const SAMPLE_DEFS = {
  guitar: { dir:'guitar', notes:{ C3:48, F3:53, C4:60, F4:65, C5:72 } },   // overdriven_guitar
  bass:   { dir:'bass',   notes:{ C2:36, F2:41, C3:48 } },                 // electric_bass_finger
  bell:   { dir:'bell',   notes:{ C6:84 } },                               // tinkle_bell
};
const banks = {};              // inst -> sorted [{ midi, buffer }]
let _loadStarted = false;
function loadSamples(){
  const c = ac(); if(!c || _loadStarted) return; _loadStarted = true;
  for(const [inst, def] of Object.entries(SAMPLE_DEFS)){
    banks[inst] = [];
    for(const [name, midi] of Object.entries(def.notes)){
      const url = new URL(`${def.dir}/${name}.mp3`, AUDIO_BASE).href;
      fetch(url).then(r => r.arrayBuffer())
        .then(a => c.decodeAudioData(a))
        .then(buf => { banks[inst].push({ midi, buffer: buf }); banks[inst].sort((x,y)=>x.midi-y.midi); })
        .catch(() => {});   // a missing/undecodable file just leaves the synth fallback in place
    }
  }
}
export function samplesReady(inst){
  if(inst) return !!(banks[inst] && banks[inst].length);
  return Object.keys(SAMPLE_DEFS).every(k => banks[k] && banks[k].length);
}
function nearest(bank, midi){
  let best = bank[0];
  for(const e of bank) if(Math.abs(e.midi - midi) < Math.abs(best.midi - midi)) best = e;
  return best;
}

/* --- unlock (iOS needs a silent buffer inside a real gesture) -------------- */
let _unlocked = false;
function primeUnlock(){
  const c = ac(); if(!c) return;
  if(c.state === 'suspended') c.resume();
  loadSamples();                                   // kick off the sample fetch/decode
  if(_unlocked) return;
  try{
    const b = c.createBuffer(1, 1, 22050);
    const s = c.createBufferSource(); s.buffer = b; s.connect(c.destination); s.start(0);
    _unlocked = true;
  }catch(_){}
}
export function unlock(){ primeUnlock(); }
const _UNLOCK_EVENTS = ['pointerdown','touchend','mousedown','keydown'];
function _onGesture(){ primeUnlock(); if(_unlocked) _UNLOCK_EVENTS.forEach(ev=>removeEventListener(ev,_onGesture)); }
if(typeof window !== 'undefined') _UNLOCK_EVENTS.forEach(ev=>addEventListener(ev,_onGesture,{passive:true}));
export function context(){ return ac(); }
export function toggleMute(){ muted = !muted; return muted; }
export function isMuted(){ return muted; }
export function setMuted(v){ muted = !!v; }

/* --- note players --------------------------------------------------------- */
/** Play a sampled instrument note (pitch-shifted from the nearest sample).
 *  dest lets the music engine route into its own bus; SFX (dest=null) honour mute.
 *  Returns true if a real sample played, false if it fell back to the synth. */
export function sampleNote(inst, midi, opts = {}){
  const c = ac(); if(!c) return false;
  const { when = c.currentTime, dur = 0.4, gain = 0.7, pan = 0, dest = null } = opts;
  if(!dest && muted) return false;
  const out = dest || master();
  const bank = banks[inst];
  if(!bank || !bank.length){ pluck(midi, { when, dur, gain: gain*0.6, pan, dest: out }); return false; }
  const s = nearest(bank, midi);
  const src = c.createBufferSource(); src.buffer = s.buffer;
  src.playbackRate.value = Math.pow(2, (midi - s.midi) / 12);
  const g = c.createGain();
  g.gain.setValueAtTime(0.0001, when);
  g.gain.linearRampToValueAtTime(gain, when + 0.004);         // quick pick attack
  g.gain.exponentialRampToValueAtTime(0.0006, when + dur);    // natural pluck decay
  src.connect(g);
  let node = g;
  if(pan){ const p = c.createStereoPanner(); p.pan.value = pan; g.connect(p); node = p; }
  node.connect(out);
  src.start(when); src.stop(when + dur + 0.06);
  return true;
}
/** Synth pluck — the graceful fallback before samples finish loading. */
function pluck(midi, { when, dur, gain, pan = 0, dest }){
  const c = ac(); if(!c) return;
  const f = mtof(midi);
  const o = c.createOscillator();  o.type = 'triangle'; o.frequency.value = f;
  const o2 = c.createOscillator(); o2.type = 'sawtooth'; o2.frequency.value = f; o2.detune.value = 7;
  const lp = c.createBiquadFilter(); lp.type = 'lowpass';
  lp.frequency.setValueAtTime(f*6, when); lp.frequency.exponentialRampToValueAtTime(Math.max(f*1.6,320), when + dur);
  const g = c.createGain();
  g.gain.setValueAtTime(0.0001, when);
  g.gain.linearRampToValueAtTime(gain, when + 0.005);
  g.gain.exponentialRampToValueAtTime(0.0006, when + dur);
  o.connect(lp); o2.connect(lp); lp.connect(g);
  let node = g;
  if(pan){ const p = c.createStereoPanner(); p.pan.value = pan; g.connect(p); node = p; }
  node.connect(dest || master());
  o.start(when); o2.start(when); o.stop(when + dur + 0.05); o2.stop(when + dur + 0.05);
}

/* --- synthesized drum kit ------------------------------------------------- */
let _noiseBuf = null;
function noiseBuf(c){
  if(!_noiseBuf){
    const n = Math.floor(c.sampleRate * 0.4);
    _noiseBuf = c.createBuffer(1, n, c.sampleRate);
    const d = _noiseBuf.getChannelData(0);
    for(let i=0;i<n;i++) d[i] = Math.random()*2 - 1;
  }
  return _noiseBuf;
}
/** kind: 'kick' | 'snare' | 'hat'. dest overrides the SFX bus (used by music). */
export function drum(kind, opts = {}){
  const c = ac(); if(!c) return;
  const { when = c.currentTime, gain = 1, dest = null } = opts;
  if(!dest && muted) return;
  const out = dest || master();
  if(kind === 'kick'){
    const o = c.createOscillator(); o.type = 'sine';
    o.frequency.setValueAtTime(155, when); o.frequency.exponentialRampToValueAtTime(46, when + 0.11);
    const g = c.createGain();
    g.gain.setValueAtTime(gain*0.95, when); g.gain.exponentialRampToValueAtTime(0.0006, when + 0.19);
    o.connect(g); g.connect(out); o.start(when); o.stop(when + 0.22);
  } else if(kind === 'snare'){
    const src = c.createBufferSource(); src.buffer = noiseBuf(c);
    const hp = c.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 1300;
    const g = c.createGain();
    g.gain.setValueAtTime(gain*0.6, when); g.gain.exponentialRampToValueAtTime(0.0006, when + 0.16);
    src.connect(hp); hp.connect(g); g.connect(out); src.start(when); src.stop(when + 0.2);
    const o = c.createOscillator(); o.type = 'triangle';
    o.frequency.setValueAtTime(330, when); o.frequency.exponentialRampToValueAtTime(180, when + 0.09);
    const g2 = c.createGain();
    g2.gain.setValueAtTime(gain*0.28, when); g2.gain.exponentialRampToValueAtTime(0.0006, when + 0.12);
    o.connect(g2); g2.connect(out); o.start(when); o.stop(when + 0.14);
  } else { // hat
    const src = c.createBufferSource(); src.buffer = noiseBuf(c);
    const hp = c.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 7500;
    const g = c.createGain();
    g.gain.setValueAtTime(gain*0.32, when); g.gain.exponentialRampToValueAtTime(0.0006, when + 0.045);
    src.connect(hp); hp.connect(g); g.connect(out); src.start(when); src.stop(when + 0.07);
  }
}

/* --- procedural primitives (fallback textures + noise-based voices) ------- */
function tone({ type='square', from, to, t0=0, dur=0.1, gain=0.1, glide='exp' }){
  const c = ac(); if(!c || muted) return;
  const now = c.currentTime + t0;
  const o = c.createOscillator(), g = c.createGain();
  o.type = type; o.frequency.setValueAtTime(from, now);
  if(to != null){
    if(glide === 'exp') o.frequency.exponentialRampToValueAtTime(Math.max(1,to), now + dur);
    else o.frequency.linearRampToValueAtTime(to, now + dur);
  }
  g.gain.setValueAtTime(gain, now); g.gain.exponentialRampToValueAtTime(0.0008, now + dur);
  o.connect(g); g.connect(master());
  o.start(now); o.stop(now + dur + 0.02);
}
function noise({ t0=0, dur=0.1, gain=0.1, filter='bandpass', f0=1800, f1, q=0.8 }){
  const c = ac(); if(!c || muted) return;
  const now = c.currentTime + t0;
  const src = c.createBufferSource(); src.buffer = noiseBuf(c);
  const flt = c.createBiquadFilter(); flt.type = filter; flt.Q.value = q;
  flt.frequency.setValueAtTime(f0, now);
  if(f1 != null) flt.frequency.exponentialRampToValueAtTime(f1, now + dur);
  const g = c.createGain();
  g.gain.setValueAtTime(gain, now); g.gain.exponentialRampToValueAtTime(0.0008, now + dur);
  src.connect(flt); flt.connect(g); g.connect(master());
  src.start(now); src.stop(now + dur + 0.02);
}
/** A soft filtered-noise swoosh with a smooth attack (the card-slide). */
function shh({ t0=0, dur=0.22, gain=0.05, f0=900, f1=4200 }){
  const c = ac(); if(!c || muted) return;
  const now = c.currentTime + t0;
  const src = c.createBufferSource(); src.buffer = noiseBuf(c);
  const flt = c.createBiquadFilter(); flt.type = 'bandpass'; flt.Q.value = 0.55;
  flt.frequency.setValueAtTime(f0, now); flt.frequency.linearRampToValueAtTime(f1, now + dur);
  const g = c.createGain();
  g.gain.setValueAtTime(0.0001, now);
  g.gain.linearRampToValueAtTime(gain, now + dur*0.32);
  g.gain.exponentialRampToValueAtTime(0.0008, now + dur);
  src.connect(flt); flt.connect(g); g.connect(master());
  src.start(now); src.stop(now + dur + 0.02);
}

/* --- card-game voices (sample-backed, with the swoosh/tick textures) ------ */
export const deal = () => {
  const c = ac(); if(!c) return; const now = c.currentTime;
  shh({ dur:0.1, gain:0.03, f0:1700, f1:3200 });
  sampleNote('bass', 40, { when: now, dur:0.13, gain:0.24 });      // soft low thump of the card landing
};
export const flip = () => {
  sampleNote('guitar', 64, { dur:0.13, gain:0.3 });                // quick bright pick
  noise({ dur:0.02, gain:0.02, f0:2600, q:1.2 });
};
export const pickup = () => { sampleNote('guitar', 55, { dur:0.12, gain:0.22 }); };
export const place = () => {
  sampleNote('guitar', 52, { dur:0.16, gain:0.34 });               // firm stab
  noise({ dur:0.03, gain:0.025, f0:2200, q:1.1 });
};
export const foundation = () => {
  const c = ac(); if(!c) return; const now = c.currentTime;
  sampleNote('guitar', 60, { dur:0.22, gain:0.34 });               // stab ...
  sampleNote('bell', 84, { when: now + 0.05, dur:0.6, gain:0.26 });// ... with a bright sparkle on top
};
export const invalid = () => {
  sampleNote('guitar', 42, { dur:0.22, gain:0.3 });                // a sour semitone cluster
  sampleNote('guitar', 43, { dur:0.22, gain:0.26, pan:0.15 });
};

/** Riffle shuffle — noise ticks + swooshes, capped with a low bass thump. */
export function shuffle(){
  const c = ac(); if(!c || muted) return; const now = c.currentTime;
  shh({ t0:0.0,  dur:0.28, gain:0.05,  f0:700,  f1:3400 });
  shh({ t0:0.24, dur:0.26, gain:0.045, f0:1100, f1:4200 });
  let t = 0;
  for(let i=0;i<16;i++){
    t += 0.018 + Math.random()*0.016;
    noise({ t0:t, dur:0.03, gain:0.03 + Math.random()*0.02, filter:'bandpass', f0:1500 + Math.random()*1800, q:1.4 });
  }
  sampleNote('bass', 36, { when: now + t + 0.05, dur:0.18, gain:0.24 });   // deck squares up
}

/** Triumphant sampled-guitar arpeggio + bell topper + a little drum punch. */
export function win(){
  const c = ac(); if(!c || muted) return; const now = c.currentTime;
  const arp = [55, 59, 62, 67, 71];                 // G major run: G3 B3 D4 G4 B4
  arp.forEach((m,i)=> sampleNote('guitar', m, { when: now + i*0.11, dur: i===4?0.5:0.2, gain:0.32 }));
  sampleNote('bell', 84, { when: now + arp.length*0.11, dur:0.9, gain:0.3 });
  drum('kick',  { when: now, gain:0.5 });
  drum('snare', { when: now + 0.22, gain:0.28 });
  drum('snare', { when: now + 0.44, gain:0.34 });
}

export default {
  unlock, context, toggleMute, isMuted, setMuted,
  sampleNote, drum, samplesReady,
  deal, flip, pickup, place, foundation, invalid, shuffle, win,
};
