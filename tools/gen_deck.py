#!/usr/bin/env python3
# Arline Arcade — Solitaire deck generator.
#   Number cards (A-10): original bold faces (big rank + corner suit + big center suit), gold frame.
#   Court cards (J/Q/K): classic English-pattern figures (Byron Knoll, PUBLIC DOMAIN,
#       via notpeter/Vector-Playing-Cards) rendered to PNG, framed in our gaudy gold.
#   Back: original crimson-and-gold filigree (NOT a copy of Bicycle's Rider Back).
# Re-run after tweaks:  python3 gen_deck.py [preview.png]   ->  writes assets/cards/royal/.
from PIL import Image, ImageDraw, ImageFont, ImageChops
import math, os, sys
GOLD=(226,190,86); GOLDH=(255,242,190); GOLD2=(150,112,40)
INK=(26,28,35); RED=(213,28,0); CRIM=(122,20,30); CRIM2=(78,8,16)
W,H=400,600
FN='/home/user/ArlineArcade/assets/fonts/selawk.ttf'
COURTDIR=os.path.join(os.path.dirname(os.path.abspath(__file__)),'court')

# ---------- suit signed-distance masks (for number/pip cards) ----------
def ssf(e0,e1,x): t=max(0.,min(1.,(x-e0)/(e1-e0))); return t*t*(3-2*t)
def ln(x,y): return math.hypot(x,y)
def mC(p,q,cx,cy,r): return 1-ssf(r-0.03,r+0.02,ln(p-cx,q-cy))
def mT(p,q,a,b,c):
    d1=(p-b[0])*(a[1]-b[1])-(a[0]-b[0])*(q-b[1]); d2=(p-c[0])*(b[1]-c[1])-(b[0]-c[0])*(q-c[1]); d3=(p-a[0])*(c[1]-a[1])-(c[0]-a[0])*(q-a[1])
    return 0. if (min(d1,d2,d3)<0 and max(d1,d2,d3)>0) else 1.
def mDi(p,q): return 1.0 if (abs(p)/0.66+abs(q)/0.92)<=1 else 0.0
def mHe(p,q):
    a=max(mC(p,q,-0.26,0.30,0.44), mC(p,q,0.26,0.30,0.44))
    a=max(a, mT(p,q,(-0.70,0.18),(0.70,0.18),(0.,-0.66)))
    return max(a, mC(p,q,0.,-0.30,0.16))
def mSp(p,q):
    a=mT(p,q,(0.,0.94),(-0.6,-0.12),(0.6,-0.12)); a=max(a,mC(p,q,-0.32,-0.18,0.34)); a=max(a,mC(p,q,0.32,-0.18,0.34)); return max(a,mT(p,q,(0.,-0.06),(-0.22,-0.66),(0.22,-0.66)))
def mCl(p,q):
    a=mC(p,q,0.,0.36,0.31); a=max(a,mC(p,q,-0.33,-0.06,0.31)); a=max(a,mC(p,q,0.33,-0.06,0.31)); return max(a,mT(p,q,(0.,-0.04),(-0.18,-0.62),(0.18,-0.62)))
SUITS=[('spade','S',INK,mSp),('heart','H',RED,mHe),('diamond','D',RED,mDi),('club','C',INK,mCl)]
def lbl(r): return {1:'A',11:'J',12:'Q',13:'K'}.get(r,str(r))
def suit_on(im,cx,cy,hs,c,fn):
    px=im.load()
    for y in range(max(0,int(cy-hs)),min(im.height,int(cy+hs+1))):
        for x in range(max(0,int(cx-hs)),min(im.width,int(cx+hs+1))):
            m=fn((x-cx)/hs,(cy-y)/hs)
            if m>0.02:
                m=min(1.,m); r,g,b,a=px[x,y]; px[x,y]=(int(c[0]*m+r*(1-m)),int(c[1]*m+g*(1-m)),int(c[2]*m+b*(1-m)),255)

# ---------- shared gold frame ----------
def gold_frame(d):
    d.rounded_rectangle([6,6,W-7,H-7],radius=int(W*0.075),outline=GOLD,width=max(3,int(W*0.018)))
    d.rounded_rectangle([14,14,W-15,H-15],radius=int(W*0.06),outline=GOLD2,width=2)
    for fx,fy in [(0.10,0.066),(0.90,0.066),(0.10,0.934),(0.90,0.934)]:
        cx,cy=int(W*fx),int(H*fy); rr=int(W*0.02); d.polygon([(cx,cy-rr),(cx+rr,cy),(cx,cy+rr),(cx-rr,cy)],fill=GOLD)
def base(): return Image.new('RGBA',(W,H),(255,255,255,255))

# ---------- number / ace cards ----------
def number_card(rank,c,fn):
    im=base(); d=ImageDraw.Draw(im)
    suit_on(im,W//2,int(H*0.57),W*0.40,c,fn)                     # big center suit
    fsz=int(W*0.46); f=ImageFont.truetype(FN,fsz)               # big rank, top-left
    d.text((int(W*0.095),int(W*0.02)),lbl(rank),font=f,fill=c,stroke_width=max(2,int(fsz*0.03)),stroke_fill=c)
    suit_on(im,int(W*0.175),int(W*0.495),W*0.082,c,fn)          # small corner suit under rank
    gold_frame(d); return im

# ---------- court cards: frame a classic PD figure ----------
def autocrop_white(im,thr=10):
    g=im.convert('L'); diff=ImageChops.difference(g,Image.new('L',g.size,255))
    bbox=diff.point(lambda p:255 if p>thr else 0).getbbox(); return im.crop(bbox) if bbox else im
def court_card(rank,suitletter):
    im=base(); d=ImageDraw.Draw(im)
    src=os.path.join(COURTDIR,f'{lbl(rank)}{suitletter}_hi.png')
    fig=autocrop_white(Image.open(src).convert('RGBA'))
    pad=int(W*0.078); iw,ih=W-2*pad,H-2*pad
    fw,fh=fig.size; sc=min(iw/fw,ih/fh); nw,nh=int(fw*sc),int(fh*sc)
    fig=fig.resize((nw,nh),Image.LANCZOS); im.paste(fig,((W-nw)//2,(H-nh)//2),fig)
    gold_frame(d); return im

# ---------- gaudy crimson filigree back ----------
def _rosette(d,cx,cy,rad,petals,amp,cl,wd):
    pts=[(cx+(rad+amp*math.sin(petals*2*math.pi*i/720))*math.cos(2*math.pi*i/720),
          cy+(rad+amp*math.sin(petals*2*math.pi*i/720))*math.sin(2*math.pi*i/720)) for i in range(721)]
    d.line(pts,fill=cl,width=wd,joint='curve')
def _fleuron(d,cx,cy,r,ang,cl,wd):
    for sgn in (-1,1):
        pts=[]
        for i in range(60):
            t=i/59.0; a=ang+sgn*(t*2.6); rr=r*(0.15+0.85*t); pts.append((cx+rr*math.cos(a),cy+rr*math.sin(a)))
        d.line(pts,fill=cl,width=wd,joint='curve')
def back():
    S=3; w,h=W*S,H*S; im=Image.new('RGBA',(w,h),CRIM); d=ImageDraw.Draw(im); cx,cy=w//2,h//2
    for y in range(h):
        t=abs(y-cy)/cy; col=tuple(int(CRIM[k]+(CRIM2[k]-CRIM[k])*t) for k in range(3)); d.line([(0,y),(w,y)],fill=col)
    d.rounded_rectangle([int(w*0.035),int(h*0.024),int(w*0.965),int(h*0.976)],radius=int(W*0.075*S),outline=GOLD,width=int(S*2.4))
    d.rounded_rectangle([int(w*0.06),int(h*0.04),int(w*0.94),int(h*0.96)],radius=int(W*0.058*S),outline=GOLD2,width=int(S))
    d.rounded_rectangle([int(w*0.078),int(h*0.052),int(w*0.922),int(h*0.948)],radius=int(W*0.046*S),outline=GOLD,width=max(1,int(S*0.8)))
    for gy in range(6):
        for gx in range(4):
            px=int(w*(0.155+0.23*gx)); py=int(h*(0.13+0.148*gy))
            if abs(gx-1.5)<0.6 and abs(gy-2.5)<1.1: continue   # clear center for medallion
            _rosette(d,px,py,0.046*W*S,8,0.011*W*S,GOLD if (gx+gy)%2==0 else GOLDH,max(1,int(S*0.6)))
            _rosette(d,px,py,0.026*W*S,6,0.007*W*S,GOLD2,max(1,int(S*0.5)))
            d.ellipse([px-int(S*1.4),py-int(S*1.4),px+int(S*1.4),py+int(S*1.4)],fill=GOLDH)
    for fx,fy,a in [(0.16,0.10,0.9),(0.84,0.10,2.24),(0.16,0.90,-0.9),(0.84,0.90,-2.24)]:
        _fleuron(d,int(w*fx),int(h*fy),int(W*0.07*S),a,GOLD,max(1,int(S*0.7)))
    _rosette(d,cx,cy,0.165*W*S,16,0.018*W*S,GOLD,max(1,int(S*0.8)))
    _rosette(d,cx,cy,0.135*W*S,12,0.013*W*S,GOLDH,max(1,int(S*0.7)))
    d.ellipse([cx-int(W*0.108*S),cy-int(W*0.108*S),cx+int(W*0.108*S),cy+int(W*0.108*S)],fill=CRIM2,outline=GOLD,width=int(S*1.8))
    d.ellipse([cx-int(W*0.086*S),cy-int(W*0.086*S),cx+int(W*0.086*S),cy+int(W*0.086*S)],outline=GOLDH,width=max(1,int(S*0.8)))
    f=ImageFont.truetype(FN,int(W*0.15*S)); d.text((cx,cy-int(S*2)),'A',font=f,fill=GOLDH,anchor='mm',stroke_width=int(S*1.2),stroke_fill=GOLD2)
    return im.resize((W,H),Image.LANCZOS)

if __name__=='__main__':
    OUT='/home/user/ArlineArcade/assets/cards/royal'; os.makedirs(OUT,exist_ok=True); allc=[]
    for name,sl,c,fn in SUITS:
        for rank in range(1,14):
            im = court_card(rank,sl) if rank>=11 else number_card(rank,c,fn)
            im.convert('RGBA').save(f'{OUT}/{name}_{rank}.png'); allc.append(im)
    back().convert('RGBA').save(f'{OUT}/back.png')
    cw=88; ch=int(cw*1.5); sheet=Image.new('RGB',(cw*13+20,ch*4+20),(11,92,61))
    for i,im in enumerate(allc): sheet.paste(im.convert('RGB').resize((cw,ch)),(10+(i%13)*cw,10+(i//13)*ch))
    sheet.save(sys.argv[1] if len(sys.argv)>1 else '/tmp/deck.png'); print("deck regenerated ->",OUT)
