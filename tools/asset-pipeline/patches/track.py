"""Track the four jackpot plates through the reference video.
Template-matches (scale + translation) a plate crop from a clean frame against every frame.
Output: _track.json  {plate: {pose: [[frame, score, x, y, scale], ...]}}  (x,y = top-left of template in raw 1080x2346 coords)"""
import cv2, numpy as np, json, os, sys
FR="_frames/f%04d.png"
BOX={"grand":(30,240,378,395),"major":(705,240,1050,395),"minor":(35,415,325,527),"mini":(755,415,1050,527)}
DY=168
REF={"base":45,"bonus":13*30+1}   # frame index 1-based file numbers
def gray(i): return cv2.cvtColor(cv2.imread(FR%i),cv2.COLOR_BGR2GRAY)
SCALES=[round(s,3) for s in np.arange(0.90,1.16,0.01)]
def run(frames):
    refs={p:gray(REF[p]) for p in REF}
    out={k:{p:[] for p in REF} for k in BOX}
    for i in frames:
        g=gray(i)
        for k,(x0,y0,x1,y1) in BOX.items():
            for p,dy in (("base",0),("bonus",DY)):
                tpl=refs[p][y0+dy:y1+dy,x0:x1]
                best=(-1,0,0,1)
                cx0=max(0,x0-50); cy0=max(0,y0+dy-50); cx1=min(1080,x1+50); cy1=min(2346,y1+dy+50)
                # coarse: scales, coarse fine
                for s in SCALES:
                    t=cv2.resize(tpl,None,fx=s,fy=s,interpolation=cv2.INTER_AREA if s<1 else cv2.INTER_LINEAR)
                    # search area enlarged enough to hold scaled template
                    sx0=max(0,x0-50-int(tpl.shape[1]*(s-1)/2)-5); sx1=min(1080,x1+50+int(tpl.shape[1]*(s-1)/2)+5)
                    sy0=max(0,y0+dy-50-int(tpl.shape[0]*(s-1)/2)-5); sy1=min(2346,y1+dy+50+int(tpl.shape[0]*(s-1)/2)+5)
                    area=g[sy0:sy1,sx0:sx1]
                    if area.shape[0]<t.shape[0] or area.shape[1]<t.shape[1]: continue
                    r=cv2.matchTemplate(area,t,cv2.TM_CCOEFF_NORMED)
                    _,mx,_,loc=cv2.minMaxLoc(r)
                    if mx>best[0]: best=(mx,sx0+loc[0],sy0+loc[1],s)
                out[k][p].append([i,round(float(best[0]),4),best[1],best[2],best[3]])
        if i%100==0: print(i,flush=True)
    return out
if __name__=="__main__":
    a=int(sys.argv[1]); b=int(sys.argv[2]); step=int(sys.argv[3])
    json.dump(run(range(a,b,step)),open(sys.argv[4] if len(sys.argv)>4 else "_track.json","w"))
