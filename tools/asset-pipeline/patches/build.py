"""Builds public/private/coin-volcano/plate/patches/*.png and patches.json from the reference video frames
(_frames/fNNNN.png, 30 fps, raw 1080x2346; stage = raw minus 3 px at the top).  Run coins_scan.py first."""
import numpy as np, cv2, json, os, sys
from patchlib import *
ROOT=os.path.abspath(os.path.join(HERE,"..","..",".."))
PLATE=os.path.join(ROOT,"public","private","coin-volcano","plate")
OUT=os.path.join(PLATE,"patches"); os.makedirs(OUT,exist_ok=True)
CROP=3
items=[]; conflicts=[]
WS=os.path.join(HERE,"_whirl_steps.json")
WHIRL_STEPS=json.load(open(WS)) if os.path.exists(WS) else []
def R(v): return round(float(v),2)
def write_patch(pid,rgb,alpha): save_rgba(os.path.join(OUT,pid+".png"),rgb,alpha)
def add(pid,t0,t1,rect,text,fadeIn=0.0,fadeOut=0.0,track=None):
    x0,y0,x1,y1=rect
    items.append(dict(id=pid,t0=R(t0),t1=R(t1),x=int(x0),y=int(y0-CROP),w=int(x1-x0),h=int(y1-y0),patch=f"patches/{pid}.png",
        fadeIn=R(fadeIn),fadeOut=R(fadeOut),track=track or [],text=text))
def txt(kind,key,ref,m,**kw):
    d=dict(kind=kind,key=key,ref=ref,cx=R(m["cx"]),cy=R(m["cy"]-CROP),height=int(m["h"])); d.update(kw); return d
def make_fill_patch(pid,a,rect,feather=4,**kw):
    fill,mask=fill_text(a,rect,**kw)
    x0,y0,x1,y1=rect
    write_patch(pid,fill,feather_alpha(x1-x0,y1-y0,feather))
    return mask,text_metrics(mask,rect)
# ================= 1. jackpot plates =================
PL={"grand":(46,316,366,379,"25,000.00"),"major":(732,318,1030,379,"2,500.00"),"minor":(50,476,312,529,"1,000.00"),"mini":(780,476,1030,529,"500.00")}
for pose,fi,dy in (("base",46,0),("bonus",391,168)):
    a=load_rgb(fi)
    for k,(x0,y0,x1,y1,ref) in PL.items():
        rect=(x0,y0+dy,x1,y1+dy)
        _,mask=fill_text(a,rect,fitpad=(0,0),deg=1,thr=50,dil=3,margin=10,vsmooth=2.0)
        m=text_metrics(mask,rect)
        write_patch(f"jp-{k}-{pose}",inpaint_fill(a,rect,mask,radius=6),feather_alpha(rect[2]-rect[0],rect[3]-rect[1],4))
        tx=txt("jackpot",k,ref,m)
        if pose=="base": add(f"jp-{k}-base",0.0,7.8,rect,tx,fadeOut=0.4)
        else: add(f"jp-{k}-bonus",10.4,30.65,rect,tx,fadeIn=0.4,fadeOut=0.05)
def grand_track():
    ref=cv2.cvtColor(cv2.imread(frame_path(391)),cv2.COLOR_BGR2GRAY)
    tpl=ref[408:563,30:378]
    gx0,gy0=PL["grand"][0],PL["grand"][1]+168
    pts=[]
    for i in range(fidx(20.6),fidx(23.9)):
        g=cv2.cvtColor(cv2.imread(frame_path(i)),cv2.COLOR_BGR2GRAY); best=(-1,)
        for s in np.arange(0.96,1.22,0.01):
            t=cv2.resize(tpl,None,fx=s,fy=s,interpolation=cv2.INTER_LINEAR)
            sx0=max(0,30-40-int(174*(s-1)));sy0=max(0,408-40-int(77*(s-1)))
            area=g[sy0:sy0+t.shape[0]+90+int(160*(s-1)),sx0:sx0+t.shape[1]+90+int(350*(s-1))]
            r=cv2.matchTemplate(area,t,cv2.TM_CCOEFF_NORMED); _,mx,_,loc=cv2.minMaxLoc(r)
            if mx>best[0]: best=(mx,s,sx0+loc[0],sy0+loc[1])
        pts.append([(i-1)/30,best[0],best[1],best[2],best[3]])
    sc=np.array([p[2] for p in pts]); sm=np.array([np.median(sc[max(0,j-1):j+2]) for j in range(len(sc))])
    tr=[]
    for p,s in zip(pts,sm):
        px=p[3]+(gx0-30)*s; py=p[4]+(gy0-408)*s
        tr.append(dict(t=R(p[0]),x=R(px),y=R(py-CROP),scale=R(s),alpha=1))
    hold=dict(x=PL["grand"][0],y=PL["grand"][1]+168-CROP,scale=1,alpha=1)
    tr.insert(0,dict(t=R(tr[0]["t"]-0.05),**hold)); tr.append(dict(t=R(tr[-1]["t"]+0.05),**hold))
    return tr
gt=grand_track()
for it in items:
    if it["id"]=="jp-grand-bonus": it["track"]=gt
# ================= 2. bottom UI =================
def bright_bbox(a,win,thr):
    x0,y0,x1,y1=win; w=a[y0:y1,x0:x1]; m=w.min(2)>thr
    ys,xs=np.nonzero(m)
    return (x0+xs.min(),y0+ys.min(),x0+xs.max()+1,y0+ys.max()+1)
for pose,fi,win,t0,t1,fi_,fo_ in (("base",100,(950,1540,1080,1606),0.0,7.6,0,0.3),("bonus",391,(950,1618,1080,1690),10.4,30.65,0.4,0.05)):
    a=load_rgb(fi); bb=bright_bbox(a,win,190)
    rect=(int(bb[0]-12),int(bb[1]-9),int(min(1080,bb[2]+10)),int(bb[3]+9))
    print("bet",pose,bb,rect)
    mask,m=make_fill_patch(f"bet-{pose}",a,rect,feather=3,fitpad=(70,0),deg=1,thr=55,dil=2)
    add(f"bet-{pose}",t0,t1,rect,txt("bet","bet","0.20",m),fadeIn=fi_,fadeOut=fo_)
def bal_width(i):
    a=load_rgb(i); w=a[1983:2032,420:660]; m=w.min(2)>110; xs=np.nonzero(m.any(0))[0]
    return (xs.max()-xs.min()) if len(xs) else 0
w1=bal_width(1); tc=next((i-1)/30 for i in range(1,120) if bal_width(i)<0.85*w1)
w880=bal_width(880); tf=next(((i-1)/30 for i in range(880,960) if bal_width(i)>1.3*w880),30.6)
print("balance changes",tc,tf)
BR=(420,1976,660,2033)
mref=text_metrics(fill_text(load_rgb(fidx(38.0)),BR,fitpad=(60,60),deg=2,thr=40,dil=3)[1],BR)
for pid,fi,t0,t1,ref in (("bal-base-10",20,0.0,tc,"10.00"),("bal-base-0",100,tc,7.6,"0.00"),("bal-bonus-0",391,7.6,tf,"0.00"),("bal-final",1100,tf,40.7,"7,800.00")):
    a=load_rgb(fi); make_fill_patch(pid,a,BR,feather=4,fitpad=(60,60),deg=2,thr=40,dil=3)
    add(pid,t0,t1,BR,txt("balance","balance",ref,mref),fadeIn=0.05 if t0>0 else 0,fadeOut=0.05)
# ================= 3. total bar =================
TB=(335,1419,760,1497)
a=load_rgb(fidx(25.6)); fill=a[TB[1]:TB[3],TB[0]:TB[2]].astype(np.float32)
write_patch("total-bar",fill,feather_alpha(TB[2]-TB[0],TB[3]-TB[1],6))
b=load_rgb(fidx(30.0)); w=b[TB[1]:TB[3],TB[0]:TB[2]]; mk=(w[...,0]>225)&(w[...,1]>160)&(w[...,2]>90)&(w[...,2]<235)
mt=text_metrics(mk,TB); print("total text",mt)
steps=[(25.9,"100.00"),(26.5,"300.00"),(27.1,"350.00"),(27.4,"500.00"),(28.0,"550.00"),(28.6,"950.00"),(28.9,"1,050.00"),(29.5,"1,950.00")]
add("total-bar",25.8,30.4,TB,txt("counter","total","1,950.00",mt,countUp={"from":"100.00","to":"1,950.00","t0":25.9,"t1":29.5},steps=[dict(t=t,v=v) for t,v in steps]),fadeIn=0.1,fadeOut=0.2)
# ================= 4. SIZZLING =================
b=load_rgb(fidx(38.0)); win=(120,1340,960,1560); w=b[win[1]:win[3],win[0]:win[2]]
mk=(w[...,0]>225)&(w[...,1]>170); ys,xs=np.nonzero(mk)
bx0,bx1=win[0]+xs.min(),win[0]+xs.max()+1; ms=text_metrics(mk,win); print("sizzle text",ms,bx0,bx1)
SZ=(int(max(0,bx0-40)),int(ms["cy"]-ms["h"]/2-45),int(min(1080,bx1+40)),int(ms["cy"]+ms["h"]/2+70))
fills=[]
for t in np.arange(36.6,39.8,0.25):
    f,_=fill_text(load_rgb(fidx(t)),SZ,fitpad=(0,0) if SZ[0]<150 else (150,150),deg=2,thr=70,dil=4); fills.append(f)
fill=np.median(np.stack(fills),0); fill=cv2.GaussianBlur(fill.astype(np.float32),(0,0),4)
write_patch("sizzling-label",fill,feather_alpha(SZ[2]-SZ[0],SZ[3]-SZ[1],12))
add("sizzling-label",30.9,39.95,SZ,txt("counter","sizzling","7,800.00",ms,countUp={"from":"338.00","to":"7,800.00","t0":31.0,"t1":35.78}),fadeIn=0.1,fadeOut=0.1)
# ================= 5. coins =================
def swirl_fill(a,rect):
    """animated swirl behind a number: mask glyphs (cream core + dark outline), Telea-inpaint, heavy blur -> soft label"""
    x0,y0,x1,y1=rect; reg=a[y0:y1,x0:x1].copy()
    cream=(reg[...,0]>215)&(reg[...,1]>185)&(reg[...,2]>120)
    dark=(reg[...,1]<75)&(reg[...,0]<200)
    mk=cv2.dilate((cream|dark).astype(np.uint8),np.ones((3,3),np.uint8),iterations=6)
    inp=cv2.inpaint(cv2.cvtColor(reg,cv2.COLOR_RGB2BGR),mk*255,9,cv2.INPAINT_TELEA)
    inp=cv2.cvtColor(inp,cv2.COLOR_BGR2RGB).astype(np.float32)
    return cv2.GaussianBlur(inp,(0,0),7)
C=json.load(open(os.path.join(HERE,"_coins.json")))
def runs(cell,lo,hi,maxgap=20,minlen=10):
    fr=[(int(k),v[cell]) for k,v in C.items() if lo<=int(k)<=hi and cell in v]; fr.sort()
    out=[];cur=[]
    for f,v in fr:
        if cur and f-cur[-1][0]>maxgap: out.append(cur);cur=[]
        cur.append((f,v))
    if cur: out.append(cur)
    return [r for r in out if len(r)>=minlen]
VAL={"base":{"r0c2":"200.00","r0c1":"200.00","r1c0":"150.00","r1c1":"50.00","r1c2":"400.00","r2c1":"100.00"},
     "bonus":{"r0c0":"100.00","r0c1":"200.00","r0c2":"50.00","r1c0":"150.00","r1c1":"50.00","r1c2":"400.00","r2c1":"100.00","r2c2":"900.00"}}
def medfilt(x,k):
    h=k//2; return np.array([np.median(x[max(0,i-h):i+h+1]) for i in range(len(x))])
def series(run):
    f=np.array([r[0] for r in run]); cx=np.array([(r[1][0]+r[1][2])/2 for r in run]); cy=np.array([(r[1][1]+r[1][3])/2 for r in run]); h=np.array([r[1][3]-r[1][1] for r in run],float)
    hm=medfilt(h,7); good=np.abs(h-hm)<0.2*hm
    ff=np.arange(f[0],f[-1]+1)
    return ff,np.interp(ff,f[good],medfilt(cx,5)[good]),np.interp(ff,f[good],medfilt(cy,5)[good]),np.interp(ff,f[good],medfilt(h,5)[good])
REFF=fidx(19.0); aref=load_rgb(REFF)
REFS={}
CW,CH=292,88
CWD={'coin-gold':300,'coin-red':300,'coin-gold5':248,'coin-whirl':300}   # coin patch size (px) - radial fill is robust, so one oversize rect serves every value
def coin_patch(pid,a,cx,cy,cw,hband=60,feather=5,thr=60):
    rect=(int(round(cx-cw/2)),int(round(cy-CH/2)),int(round(cx-cw/2))+cw,int(round(cy-CH/2))+CH)
    fill,mk,(bcx,bcy)=radial_fill(a,cx,cy,rect,hband,thr=thr,zone=(40,150))
    write_patch(pid,fill,feather_alpha(cw,CH,feather)); return rect
def ref_patch(pid,cell,aimg,fi):
    v=C[str(fi)][cell]; cx=(v[0]+v[2])/2; cy=(v[1]+v[3])/2; h=v[3]-v[1]
    rect=coin_patch(pid,aimg,cx,cy,CWD[pid])
    REFS[pid]=dict(w=CWD[pid],h=CH,th=h)
ref_patch("coin-gold","r1c0",aref,REFF); ref_patch("coin-red","r1c2",aref,REFF); ref_patch("coin-gold5","r1c1",aref,REFF)
print(REFS)
def mk_track(ff,cx,cy,h,rp,steady):
    cw=CWD[rp]; tr=[]
    for j in range(0,len(ff),2):
        tr.append(dict(t=R((ff[j]-1)/30),x=R(cx[j]-cw/2*steady),y=R(cy[j]-CH/2*steady-CROP),scale=R(steady),alpha=1))
    return tr,float(np.median(h))
wv=C[str(fidx(15.0))]["r2c2"]
wcx=(wv[0]+wv[2])/2; wcy=(wv[1]+wv[3])/2; ww=wv[2]-wv[0]; wh=wv[3]-wv[1]
WR=(int(round(wcx-CW/2)),int(round(wcy-CH/2)),int(round(wcx-CW/2))+CW,int(round(wcy-CH/2))+CH)
fill=swirl_fill(load_rgb(fidx(15.0)),WR)
write_patch("coin-whirl",fill,feather_alpha(WR[2]-WR[0],WR[3]-WR[1],6))
REFS["coin-whirl"]=dict(w=WR[2]-WR[0],h=WR[3]-WR[1],th=wh,tcx=wcx-WR[0],tcy=wcy-WR[1])
last_pos={}
NOM={"base":([200,500,800],[662,892,1117]),"bonus":([205,540,875],[854,1107,1362])}
centres={}
for pose,lo,hi,tend,cells in (("bonus",fidx(10.6),fidx(23.8),23.95,["r0c0","r0c1","r0c2","r1c0","r1c1","r1c2","r2c1","r2c2"]),):
    for cell in cells:
        for n,run in enumerate(runs(cell,lo,hi)):
            print(pose,cell,n,round((run[0][0]-1)/30,2),round((run[-1][0]-1)/30,2),len(run))
            if pose=="bonus" and cell=="r2c2" and run[-1][0]<fidx(12.0): continue
            if pose=="bonus" and cell!="r2c2" and run[-1][0]<fidx(23.0): continue
            val=VAL[pose][cell]
            if cell=="r2c2" and pose=="bonus": rp="coin-whirl"
            elif cell=="r1c2": rp="coin-red"
            elif len(val)==5: rp="coin-gold5"
            else: rp="coin-gold"
            steady=1.0 if pose=="bonus" else 0.95
            r_,c_=int(cell[1]),int(cell[3])
            ncx,ncy=NOM[pose][0][c_],NOM[pose][1][r_]
            # coin-centre grid (measured once with radial_fill(search=26) over all landed coins, then regularised)
            GX={"base":[218,540,864],"bonus":[210,545,875]}; GY={"base":[678,920,1164],"bonus":[857,1112,1366]}
            centres[(pose,cell)]=(GX[pose][c_],GY[pose][r_])
            bcx,bcy=centres[(pose,cell)]
            cw=CWD[rp]*steady; ch=CH*steady
            rect=(int(round(bcx-cw/2)),int(round(bcy-ch/2)),int(round(bcx-cw/2))+int(round(cw)),int(round(bcy-ch/2))+int(round(ch)))
            t0=max(0,(run[0][0]-1)/30-0.1); t1=min(tend,(run[-1][0]-1)/30+0.15)
            if pose=="base" and t1>7.0: t1=tend
            if pose=="bonus" and t1>23.0: t1=tend
            if pose=="bonus" and cell=="r2c2": t0=max(t0,12.3)
            elif pose=="bonus" and cell not in ("r0c0","r0c2"): t0=max(t0,11.8)
            pid=f"coin-{pose}-{cell}"+(f"-{n}" if (n and cell!="r2c2") else "")
            hh=float(np.median([r[1][3]-r[1][1] for r in run]))
            add(pid,t0,t1,rect,txt("coin",cell,val,dict(cx=bcx,cy=bcy,h=hh)),fadeIn=0.05,fadeOut=0.25 if t1>=tend-0.01 else 0.05)
            it=items[-1]; it["patch"]=f"patches/{rp}.png"
            if pose=="bonus": last_pos[cell]=(bcx,bcy,hh,rp,val)
BASE=[("r0c2","200.00",0.0,1.55),("r1c2","400.00",0.0,7.5),("r0c1","200.00",1.7,7.5),("r1c0","150.00",1.85,7.5),("r1c1","50.00",3.95,7.5),("r2c1","100.00",3.5,7.5)]
for cell,val,bt0,bt1 in BASE:
    rp="coin-red" if cell=="r1c2" else ("coin-gold5" if len(val)==5 else "coin-gold")
    r_,c_=int(cell[1]),int(cell[3]); bcx,bcy=[218,540,864][c_],[678,920,1164][r_]; st=0.95
    cw=CWD[rp]*st; ch=CH*st
    rect=(int(round(bcx-cw/2)),int(round(bcy-ch/2)),int(round(bcx-cw/2))+int(round(cw)),int(round(bcy-ch/2))+int(round(ch)))
    add(f"coin-base-{cell}",bt0,bt1,rect,txt("coin",cell,val,dict(cx=bcx,cy=bcy,h=REFS[rp]["th"]*st)),fadeIn=0.05,fadeOut=0.25 if bt1>7 else 0.05)
    items[-1]["patch"]=f"patches/{rp}.png"
for it in items:
    if it["id"].startswith("coin-bonus-r2c2"):
        it["text"]["kind"]="counter"
        if WHIRL_STEPS:
            it["text"]["steps"]=WHIRL_STEPS
            it["text"]["countUp"]={"from":WHIRL_STEPS[0]["v"],"to":WHIRL_STEPS[-1]["v"],"t0":WHIRL_STEPS[0]["t"],"t1":WHIRL_STEPS[-1]["t"]}
adim=load_rgb(fidx(24.0))
for cell,(cx,cy,h,rp,val) in last_pos.items():
    if cell=="r1c1": continue
    s=1.0; w_=CWD[rp]*s; h_=CH*s
    rect=(int(cx-w_/2),int(cy-h_/2),int(cx-w_/2)+int(w_),int(cy-h_/2)+int(h_))
    pid=f"coin-dim-{cell}"
    if cell=="r2c2":
        fill=swirl_fill(adim,rect)
        write_patch(pid,fill,feather_alpha(rect[2]-rect[0],rect[3]-rect[1],5))
    else:
        fl,mk,_=radial_fill(adim,cx,cy,rect,60,thr=45,zone=(40,150)); write_patch(pid,fl,feather_alpha(rect[2]-rect[0],rect[3]-rect[1],5))
    dip=[dict(t=T,x=rect[0],y=rect[1]-CROP,scale=1,alpha=A) for T,A in ((23.7,1),(24.2,1),(24.35,0),(25.1,0),(25.35,1),(30.65,1))]
    add(pid,23.7,30.65,rect,txt("coin",cell,val,dict(cx=cx,cy=cy,h=h),dim=True),fadeIn=0.3,fadeOut=0.05,track=dip)
# ================= conflicts =================
conflicts+=[
 dict(id="jp-flash-base-to-bonus",t0=7.2,t1=10.4,what="screen fades base->red splash BONUS GAME; plates ghost and are absent 7.9-10.4; patches fade with the video"),
 dict(id="jp-grand-pulse",t0=20.8,t1=23.7,what="GRAND plate scale pulse (~1.15x) once per second; track gives scale; fit score low at the peak (glow)"),
 dict(id="jp-sparkle-flash",t0=24.3,t1=27.5,what="white flash and sparks across all four plates (match score 0.3-0.6); digits briefly washed out"),
 dict(id="jp-minor-glints",t0=25.5,t1=27.4,what="glints over MINOR/MINI plate digits"),
 dict(id="coins-landing-pops",t0=0.0,t1=7.4,what="base coins pop/slide between cells (200 moves r0c2->r0c1 ~1.4-2.0 s), fire whirl over r1c1/r2c0 2.0-4.3 s; tracks interpolate through gaps"),
 dict(id="base-fire-trails",t0=5.9,t1=6.5,what="fire/shock ring over r0c2..r1c2 coins"),
 dict(id="bonus-intro-overlay",t0=10.4,t1=11.9,what="splash BONUS GAME text fades over the board; coin text not readable until about 11.9"),
 dict(id="bonus-fire-trail",t0=12.4,t1=14.2,what="fire trail crosses coin r1c0/r1c1/r2c2 text during Coin Collect whirl"),
 dict(id="bonus-whirl-r2c2",t0=11.3,t1=19.5,what="swirl animation behind bottom-right value (blurred label patch, not a clean plate)"),
 dict(id="bonus-fireball-r2c1",t0=14.0,t1=16.5,what="flying fire ball over r2c1/r2c2 coins and a 150.00 flyer"),
 dict(id="bonus-dim-flash",t0=24.3,t1=25.3,what="white-yellow flash over the whole board; dim-coin patches fade to alpha 0 so the faint dimmed digits stay visible underneath"),
 dict(id="bonus-coins-dim",t0=23.7,t1=24.3,what="all coins dim; X4 multiplier art appears in r1c1 (coin text hidden under X4; no dim patch there)"),
 dict(id="bonus-flame-column",t0=26.2,t1=30.0,what="vertical flame column over r0c1/r1c1/r2c1 text and the total bar centre"),
 dict(id="total-bar-glow",t0=25.1,t1=30.4,what="bar flashes yellow, glow changes behind digits; static patch is the empty bar at 25.6 s"),
 dict(id="bar-to-sizzling",t0=30.3,t1=30.9,what="total bar zooms and cross-fades into SIZZLING screen"),
 dict(id="sizzling-flying-coins",t0=31.0,t1=40.0,what="flying coins cross the counter region; patch is a static blurred dark-red label"),
]
json.dump(dict(video=dict(width=1080,height=2340,fps=30,cropTop=3),items=items,conflicts=conflicts),open(os.path.join(PLATE,"patches.json"),"w"),indent=1)
print(len(items),"items")
