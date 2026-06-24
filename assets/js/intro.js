/* ============================================================================
   Arline Arcade — cinematic intro
   100% original WebGL2 shader: falling playing cards + gold coins over a dark
   casino table, then the logo pops with a chiptune sting and the arcade fades in.
   Efficient by design: single fullscreen pass, capped resolution, ~26 analytic
   ray/quad tests per pixel — no path tracing, no DOF. Degrades gracefully to a
   pure-CSS logo pop if WebGL2 is unavailable or anything throws.
   ============================================================================ */
import sfx from './sfx.js';

const SEEN_KEY = 'arline-intro-v1';
const T_LOGO = 1.55;   // seconds until the logo pops
const T_END  = 5.2;    // seconds until we hand off to the arcade

const intro = document.getElementById('intro');
const canvas = document.getElementById('introgl');
const logo  = document.getElementById('introLogo');
const skip  = document.getElementById('introSkip');

const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;

/* Already seen this session, or no intro markup -> just reveal the arcade. */
if(!intro){ /* not on the home page */ }
else if(sessionStorage.getItem(SEEN_KEY)){ removeIntro(true); }
else { start(); }

function removeIntro(instant){
  if(!intro) return;
  sessionStorage.setItem(SEEN_KEY,'1');
  if(instant){ intro.remove(); document.body.classList.remove('intro-lock'); return; }
  intro.classList.add('gone');
  setTimeout(()=>{ intro.remove(); document.body.classList.remove('intro-lock'); }, 650);
}

function start(){
  document.body.classList.add('intro-lock');
  let finished = false;
  const finish = ()=>{ if(finished) return; finished = true; removeIntro(false); };
  // hard safety: never strand the user on the splash, whatever happens below
  setTimeout(finish, (T_END + 1.5) * 1000);

  // audio: unlock on load (PWA) and on the first touch; arm a riffle.
  const arm = ()=>{ sfx.unlock(); sfx.shuffle(); window.removeEventListener('pointerdown', arm); };
  sfx.unlock(); sfx.shuffle();
  window.addEventListener('pointerdown', arm, {once:true});

  skip && skip.addEventListener('click', (e)=>{ e.stopPropagation(); finish(); });
  intro.addEventListener('click', finish);

  let gl = null;
  try{ gl = !reduce && canvas && canvas.getContext('webgl2', {antialias:true, alpha:false, powerPreference:'high-performance'}); }
  catch(_){ gl = null; }

  const t0 = performance.now();
  let popped = false;
  const popLogo = ()=>{
    if(popped) return; popped = true;
    logo && logo.classList.add('pop');
    sfx.win();
  };

  if(reduce || !gl){
    // Fallback: no shader. Logo pops over the CSS table, shorter timeline.
    canvas && (canvas.style.display='none');
    setTimeout(popLogo, reduce?150:500);
    setTimeout(finish, reduce?1600:3200);
    return;
  }

  const prog = buildProgram(gl);
  if(!prog){ canvas.style.display='none'; setTimeout(popLogo,400); setTimeout(finish,3000); return; }
  const uRes = gl.getUniformLocation(prog,'u_res');
  const uTime= gl.getUniformLocation(prog,'u_time');

  const resize = ()=>{
    const dpr = Math.min(window.devicePixelRatio||1, 1.5);
    // cap the longest drawing-buffer edge for steady mobile framerates
    const cap = 1280;
    let w = Math.round(innerWidth*dpr), h = Math.round(innerHeight*dpr);
    const s = Math.min(1, cap/Math.max(w,h));
    canvas.width = Math.max(2, Math.round(w*s));
    canvas.height= Math.max(2, Math.round(h*s));
  };
  resize(); window.addEventListener('resize', resize);

  gl.useProgram(prog);
  gl.bindVertexArray(gl.createVertexArray()); // some drivers require a bound VAO for attribute-less draws
  let raf = 0;
  const frame = ()=>{
    const t = (performance.now()-t0)/1000;
    if(t >= T_LOGO) popLogo();
    if(t >= T_END){ cancelAnimationFrame(raf); window.removeEventListener('resize',resize); finish(); return; }
    gl.viewport(0,0,canvas.width,canvas.height);
    gl.uniform2f(uRes, canvas.width, canvas.height);
    gl.uniform1f(uTime, t);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    raf = requestAnimationFrame(frame);
  };
  raf = requestAnimationFrame(frame);
}

/* ---- WebGL helpers ------------------------------------------------------- */
function buildProgram(gl){
  const vs = `#version 300 es
  void main(){ vec2 p = vec2((gl_VertexID<<1)&2, gl_VertexID&2); gl_Position = vec4(p*2.0-1.0, 0.0, 1.0); }`;
  const fs = FRAG;
  const v = compile(gl, gl.VERTEX_SHADER, vs);
  const f = compile(gl, gl.FRAGMENT_SHADER, fs);
  if(!v||!f) return null;
  const p = gl.createProgram();
  gl.attachShader(p,v); gl.attachShader(p,f); gl.linkProgram(p);
  if(!gl.getProgramParameter(p, gl.LINK_STATUS)){ console.warn('intro link:', gl.getProgramInfoLog(p)); return null; }
  return p;
}
function compile(gl, type, src){
  const s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s);
  if(!gl.getShaderParameter(s, gl.COMPILE_STATUS)){ console.warn('intro shader:', gl.getShaderInfoLog(s)); return null; }
  return s;
}

/* ---- the original fragment shader ---------------------------------------- */
const FRAG = `#version 300 es
precision highp float;
out vec4 outColor;
uniform vec2 u_res;
uniform float u_time;

const float PI = 3.14159265;
const int NCARD = 16;
const int NCOIN = 10;

float hash11(float p){ return fract(sin(p*127.1)*43758.5453); }

mat3 rotX(float a){ float s=sin(a),c=cos(a); return mat3(1.,0.,0., 0.,c,s, 0.,-s,c); }
mat3 rotY(float a){ float s=sin(a),c=cos(a); return mat3(c,0.,-s, 0.,1.,0., s,0.,c); }
mat3 rotZ(float a){ float s=sin(a),c=cos(a); return mat3(c,s,0., -s,c,0., 0.,0.,1.); }

float sdRoundRect(vec2 p, vec2 b, float r){ vec2 q=abs(p)-(b-r); return length(max(q,0.))+min(max(q.x,q.y),0.)-r; }
float sdDiamond(vec2 p, float r){ p=abs(p); return (p.x+p.y)-r; }

void cardPose(float id, float t, out vec3 pos, out mat3 R){
  float h0=hash11(id*1.7+0.3), h1=hash11(id*3.1+1.1), h2=hash11(id*5.7+2.2);
  float cols=6.0, col=mod(id,cols), row=floor(id/cols);
  float speed=mix(0.07,0.12,h2);
  float ft=t*speed + row*0.21 + h1;
  float ph=fract(ft), cyc=floor(ft);
  float z=mix(-3.0,0.4, hash11(id*9.1+cyc*13.7));
  float spread=2.1 + (-z)*0.55;
  float x=mix(-spread,spread,(col+0.5)/cols) + (hash11(id*2.3+cyc*7.1)-0.5)*0.45;
  float y=mix(3.4,-3.4,ph);
  pos=vec3(x,y,z);
  float ax=(h2-0.5)*0.7 + 0.15*sin(t*0.5+id);
  float ay=(h1<0.5?0.0:PI) + 0.25*sin(t*0.4+id*1.3);
  float az=h0*6.2831 + 0.22*sin(t*0.3+id);
  R = rotY(ay)*rotX(ax)*rotZ(az);
}

void coinPose(float id, float t, out vec3 pos, out mat3 R){
  float h1=hash11(id*4.3+0.7), h2=hash11(id*6.1+2.9);
  float cols=5.0, col=mod(id,cols), row=floor(id/cols);
  float speed=mix(0.09,0.15,h2);
  float ft=t*speed + row*0.17 + h1;
  float ph=fract(ft), cyc=floor(ft);
  float z=mix(0.5,1.7, hash11(id*7.7+cyc*11.3));
  float spread=2.4 + z*0.2;
  float x=mix(-spread,spread,(col+0.5)/cols) + (hash11(id*3.9+cyc*5.3)-0.5)*0.3;
  float y=mix(3.0,-3.0,ph);
  pos=vec3(x,y,z);
  float ax=t*(1.4+h1)+id, ay=t*(1.1+h2)+id*1.7, az=h1*6.28;
  R = rotY(ay)*rotX(ax)*rotZ(az);
}

vec3 cardFace(vec2 uv, float front, float tint){
  // uv in card local space, roughly [-1,1]
  vec3 cream = vec3(0.97,0.95,0.89);
  vec3 navy  = vec3(0.07,0.11,0.26);
  vec3 gold  = vec3(0.90,0.74,0.40);
  vec3 ink   = (tint<0.5) ? vec3(0.78,0.12,0.12) : vec3(0.10,0.11,0.15);
  if(front>0.5){
    vec3 col = cream;
    float border = 1.0 - smoothstep(0.0,0.05, abs(sdRoundRect(uv, vec2(0.92,0.92), 0.18)));
    col = mix(col, gold, border*0.9);
    float pip = 1.0 - smoothstep(0.0,0.04, sdDiamond(uv, 0.42));
    col = mix(col, ink, pip*0.95);
    float corner = 1.0 - smoothstep(0.0,0.05, sdDiamond(uv-vec2(-0.62,0.66),0.10));
    corner = max(corner, 1.0 - smoothstep(0.0,0.05, sdDiamond(uv-vec2(0.62,-0.66),0.10)));
    col = mix(col, ink, corner);
    return col;
  } else {
    vec3 col = navy;
    float lattice = 0.5+0.5*sin((uv.x+uv.y)*16.0)*sin((uv.x-uv.y)*16.0);
    col = mix(col, gold*0.5, lattice*0.5);
    float border = 1.0 - smoothstep(0.0,0.05, abs(sdRoundRect(uv, vec2(0.86,0.86), 0.14)));
    col = mix(col, gold, border*0.85);
    return col;
  }
}

vec3 shadeLit(vec3 base, vec3 n, vec3 v, float shiny){
  vec3 l1=normalize(vec3(0.4,0.8,0.6)), l2=normalize(vec3(-0.7,0.3,0.5));
  float d1=max(dot(n,l1),0.0), d2=max(dot(n,l2),0.0);
  vec3 h1=normalize(l1+v);
  float sp=pow(max(dot(n,h1),0.0), shiny)*0.6;
  float rim=pow(1.0-max(dot(n,v),0.0), 3.0)*0.25;
  vec3 amb=base*0.30;
  vec3 col = amb + base*(d1*0.95*vec3(1.2,1.05,0.85) + d2*0.35*vec3(0.6,0.7,1.0)) + sp*vec3(1.2,1.0,0.7) + rim*vec3(0.8,0.85,1.0);
  return col;
}

vec3 background(vec2 uv){
  float y = clamp(uv.y*0.5+0.55, 0.0, 1.0);
  vec3 bg = mix(vec3(0.015,0.04,0.03), vec3(0.02,0.06,0.05), y);     // deep felt green->black
  float glow = pow(max(0.0,1.0-length(uv*vec2(0.8,1.0))), 3.0);
  bg += vec3(0.10,0.08,0.03)*glow;                                    // warm center pool
  return bg;
}

void main(){
  vec2 uv = (gl_FragCoord.xy - 0.5*u_res)/u_res.y;
  vec3 ro = vec3(0.0, 0.0, 4.6);
  vec3 ta = vec3(0.0);
  vec3 ww = normalize(ta-ro), uu = normalize(cross(ww,vec3(0,1,0))), vv = cross(uu,ww);
  vec3 rd = normalize(uv.x*uu + uv.y*vv + 1.9*ww);

  float bestT = 1e9;
  vec3 col = background(uv);
  bool hit = false;
  vec3 hitCol = vec3(0.0); vec3 hitN; float hitShiny=40.0;

  // falling cards
  for(int i=0;i<NCARD;i++){
    float id=float(i);
    vec3 pos; mat3 R; cardPose(id,u_time,pos,R);
    mat3 invR=transpose(R);
    vec3 roL=invR*(ro-pos), rdL=invR*rd;
    if(abs(rdL.z)<1e-4) continue;
    float t=-roL.z/rdL.z; if(t<=0.0 || t>=bestT) continue;
    vec2 p=(roL+rdL*t).xy;
    if(sdRoundRect(p, vec2(0.5,0.72), 0.08) > 0.0) continue;
    bestT=t; hit=true;
    float front = rdL.z<0.0 ? 1.0 : 0.0;
    vec3 nL=vec3(0.0,0.0, rdL.z<0.0?1.0:-1.0);
    hitN = normalize(R*nL);
    vec2 fuv = p/vec2(0.5,0.72);
    hitCol = cardFace(fuv, front, hash11(id*5.0));
    hitShiny = 60.0;
  }
  // gold coins
  for(int i=0;i<NCOIN;i++){
    float id=float(i);
    vec3 pos; mat3 R; coinPose(id,u_time,pos,R);
    mat3 invR=transpose(R);
    vec3 roL=invR*(ro-pos), rdL=invR*rd;
    if(abs(rdL.z)<1e-4) continue;
    float t=-roL.z/rdL.z; if(t<=0.0 || t>=bestT) continue;
    vec2 p=(roL+rdL*t).xy;
    float rr=length(p);
    if(rr > 0.26) continue;
    bestT=t; hit=true;
    vec3 nL=vec3(0.0,0.0, rdL.z<0.0?1.0:-1.0);
    hitN=normalize(R*nL);
    vec3 gold=vec3(0.95,0.76,0.30);
    float ring=smoothstep(0.02,0.0,abs(rr-0.20));
    vec3 c=mix(gold, vec3(1.0,0.9,0.55), ring*0.6);
    c=mix(c, gold*0.7, smoothstep(0.16,0.26,rr));
    hitCol=c; hitShiny=120.0;
  }

  if(hit){
    vec3 p = ro + rd*bestT;
    vec3 vv2 = normalize(ro-p);
    vec3 lit = shadeLit(hitCol, hitN, vv2, hitShiny);
    float fog = exp(-0.02*bestT*bestT);
    col = mix(background(uv), lit, clamp(fog,0.0,1.0));
  }

  // vignette + tonemap + gamma
  vec2 q = gl_FragCoord.xy/u_res;
  float vig = pow(16.0*q.x*q.y*(1.0-q.x)*(1.0-q.y), 0.20);
  col *= mix(0.55, 1.05, clamp(vig,0.0,1.0));
  col = col/(1.0+col);
  col = pow(col, vec3(1.0/2.2));
  outColor = vec4(col, 1.0);
}`;
