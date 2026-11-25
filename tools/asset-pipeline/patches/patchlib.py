"""Shared helpers for the number-patch pipeline (build.py / preview.py).
All coordinates here are RAW video coordinates (1080x2346) unless a function says otherwise."""
import numpy as np, cv2, json, os
HERE=os.path.dirname(os.path.abspath(__file__))
FRAMES=os.path.join(HERE,"_frames")
def frame_path(i): return os.path.join(FRAMES,"f%04d.png"%i)
def load_rgb(i):
    return cv2.cvtColor(cv2.imread(frame_path(i)),cv2.COLOR_BGR2RGB)
def fidx(t): return int(round(t*30))+1
def fill_text(a, rect, fitpad=(40,40), deg=2, thr=48, dil=2, iters=4, vsmooth=1.2, margin=0):
    """Remove glyphs inside rect by fitting each row (polynomial in x, sigma-clipped) to the
    non-glyph pixels in rect+fitpad. Returns (fill[h,w,3] float, mask[h,w] bool)."""
    x0,y0,x1,y1=rect
    fx0=max(0,x0-fitpad[0]); fx1=min(a.shape[1],x1+fitpad[1])
    reg=a[y0:y1,fx0:fx1].astype(np.float32)
    h,w,_=reg.shape
    xs=np.linspace(-1,1,w)
    med=np.median(reg,axis=1,keepdims=True)
    mask=(np.abs(reg-med).sum(2)>thr)
    k=np.ones((3,3),np.uint8)
    bg=np.zeros_like(reg)
    for it in range(iters):
        mk=cv2.dilate(mask.astype(np.uint8),k,iterations=dil).astype(bool)
        for r in range(h):
            v=~mk[r]
            if margin: v=v&((np.arange(w)<margin)|(np.arange(w)>=w-margin))
            if v.sum()<max(10 if not margin else 4,deg+4 if not margin else 4): v=np.ones(w,bool)
            for c in range(3):
                co=np.polyfit(xs[v],reg[r,v,c],min(deg,max(0,v.sum()//6)))
                bg[r,:,c]=np.polyval(co,xs)
        if vsmooth: bg=cv2.GaussianBlur(bg,(1,0),sigmaX=0.1,sigmaY=vsmooth) if False else cv2.GaussianBlur(bg,(0,0),sigmaX=0.01,sigmaY=vsmooth)
        mask=(np.abs(reg-bg).sum(2)>thr)
    mk=cv2.dilate(mask.astype(np.uint8),k,iterations=dil).astype(bool)
    ox=x0-fx0
    return np.clip(bg[:,ox:ox+(x1-x0)],0,255), mk[:,ox:ox+(x1-x0)]
def text_metrics(mask, rect, rowfrac=0.3):
    """text centre and cap height (stage px, still RAW y) from a glyph mask"""
    x0,y0,x1,y1=rect
    ys,xs=np.nonzero(mask)
    if len(xs)==0: return None
    cols=np.nonzero(mask.any(0))[0]
    prof=mask.sum(1).astype(float)
    rows=np.nonzero(prof>=rowfrac*prof.max())[0]
    return dict(cx=x0+(cols[0]+cols[-1]+1)/2, cy=y0+(rows[0]+rows[-1]+1)/2, h=int(rows[-1]-rows[0]+1),
                x0=x0+int(cols[0]), x1=x0+int(cols[-1])+1)
def feather_alpha(w,h,f,edges=(1,1,1,1)):
    """alpha ramp of f px at the rect edges (l,t,r,b flags)"""
    yy,xx=np.mgrid[0:h,0:w].astype(np.float32)
    d=np.full((h,w),1e9,np.float32)
    if edges[0]: d=np.minimum(d,xx+0.5)
    if edges[2]: d=np.minimum(d,w-xx-0.5)
    if edges[1]: d=np.minimum(d,yy+0.5)
    if edges[3]: d=np.minimum(d,h-yy-0.5)
    return np.clip(d/f,0,1)
def save_rgba(path,rgb,alpha):
    from PIL import Image
    arr=np.dstack([np.clip(rgb,0,255).astype(np.uint8),(np.clip(alpha,0,1)*255).astype(np.uint8)])
    Image.fromarray(arr,"RGBA").save(path)
# ---------- compositing (used by preview.py) ----------
def item_state(it,t):
    if t<it["t0"] or t>it["t1"]: return None
    a=1.0
    if it.get("fadeIn",0)>0: a=min(a,(t-it["t0"])/it["fadeIn"])
    if it.get("fadeOut",0)>0: a=min(a,(it["t1"]-t)/it["fadeOut"])
    x,y,s,al=it["x"],it["y"],1.0,1.0
    tr=it.get("track") or []
    if tr:
        ts=[p["t"] for p in tr]
        x=float(np.interp(t,ts,[p["x"] for p in tr])); y=float(np.interp(t,ts,[p["y"] for p in tr]))
        s=float(np.interp(t,ts,[p["scale"] for p in tr])); al=float(np.interp(t,ts,[p.get("alpha",1) for p in tr]))
    return x,y,s,max(0,min(1,a*al))
def composite(img, items, t, plate_dir, cache={}):
    """img: RGB uint8 array 1080x2340 (cropped video frame). Returns patched copy (no text)."""
    out=img.astype(np.float32).copy()
    for it in items:
        st=item_state(it,t)
        if st is None: continue
        x,y,s,a=st
        key=it["patch"]
        if key not in cache: cache[key]=cv2.cvtColor(cv2.imread(os.path.join(plate_dir,key),cv2.IMREAD_UNCHANGED),cv2.COLOR_BGRA2RGBA)
        p=cache[key]
        w=max(1,int(round(p.shape[1]*s))); h=max(1,int(round(p.shape[0]*s)))
        if (w,h)!=(p.shape[1],p.shape[0]): p=cv2.resize(p,(w,h),interpolation=cv2.INTER_LINEAR)
        xi=int(round(x)); yi=int(round(y))
        X0=max(0,xi);Y0=max(0,yi);X1=min(out.shape[1],xi+w);Y1=min(out.shape[0],yi+h)
        if X1<=X0 or Y1<=Y0: continue
        q=p[Y0-yi:Y1-yi,X0-xi:X1-xi].astype(np.float32)
        al=(q[...,3:4]/255.0)*a
        out[Y0:Y1,X0:X1]=out[Y0:Y1,X0:X1]*(1-al)+q[...,:3]*al
    return np.clip(out,0,255).astype(np.uint8)

def radial_fill(a, cx, cy, rect, band_h, thr=60, dil=3, search=8, zone=(40,125)):
    """Clean a coin-face text band: model the face as colour(r) (median per 1px radius ring, sampled outside the
    text band), search the coin centre within +-search px for the most radially-symmetric fit, then add a per-row
    linear-in-x residual taken from the non-glyph pixels. Returns (fill, mask, (cx,cy))."""
    H,W,_=a.shape
    pad=search+6
    y0=int(cy-zone[1]-pad); y1=int(cy+zone[1]+pad); x0=int(cx-zone[1]-pad); x1=int(cx+zone[1]+pad)
    sub=a[y0:y1,x0:x1].astype(np.float32)
    yy,xx=np.mgrid[y0:y1,x0:x1].astype(np.float32)
    def model(ccx,ccy):
        r=np.hypot(xx-ccx,yy-ccy); dy=np.abs(yy-ccy)
        sel=(r>=zone[0])&(r<=zone[1])&(dy>band_h/2+10)
        ri=np.round(r[sel]).astype(int); col=sub[sel]
        bins=np.arange(zone[0],zone[1]+1); prof=np.zeros((len(bins),3),np.float32); var=0.0; ok=np.zeros(len(bins),bool)
        order=np.argsort(ri); ri_s=ri[order]; col_s=col[order]
        idx=np.searchsorted(ri_s,bins); idx2=np.searchsorted(ri_s,bins,side="right")
        for k in range(len(bins)):
            seg=col_s[idx[k]:idx2[k]]
            if len(seg)>=6:
                prof[k]=np.median(seg,0); var+=float(np.abs(seg-prof[k]).sum()); ok[k]=True
        return bins,prof,ok,var
    best=None
    stp=2 if search<=10 else 4
    for ox in range(-search,search+1,stp):
        for oy in range(-search,search+1,stp):
            res=model(cx+ox,cy+oy)
            if best is None or res[3]<best[0]: best=(res[3],cx+ox,cy+oy,res)
    if search>10:
        c0x,c0y=best[1],best[2]
        for ox in range(-3,4):
            for oy in range(-3,4):
                res=model(c0x+ox,c0y+oy)
                if res[3]<best[0]: best=(res[3],c0x+ox,c0y+oy,res)
    _,bcx,bcy,(bins,prof,ok,_)=best
    rx0,ry0,rx1,ry1=rect
    ry,rx=np.mgrid[ry0:ry1,rx0:rx1].astype(np.float32)
    r=np.hypot(rx-bcx,ry-bcy)
    pred=np.stack([np.interp(r,bins[ok],prof[ok,c]) for c in range(3)],-1)
    act=a[ry0:ry1,rx0:rx1].astype(np.float32)
    mask=np.abs(act-pred).sum(2)>thr
    k=np.ones((3,3),np.uint8); mk=cv2.dilate(mask.astype(np.uint8),k,iterations=dil).astype(bool)
    h,w=mask.shape; xs=np.linspace(-1,1,w); off=np.zeros((h,2,3),np.float32)
    for row in range(h):
        v=~mk[row]
        if v.sum()<10: off[row]=off[row-1] if row else 0; continue
        for c in range(3):
            d=(act[row,:,c]-pred[row,:,c])[v]
            co=np.polyfit(xs[v],d,1 if v.sum()>=w*0.25 else 0)
            off[row,:,c]=co if len(co)==2 else (0,co[0])
    off=cv2.GaussianBlur(off.reshape(h,6),(0,0),sigmaX=0.01,sigmaY=2.5).reshape(h,2,3)
    fill=pred+off[:,0:1,:]*xs[None,:,None]+off[:,1:2,:]
    return np.clip(fill,0,255),mk,(bcx,bcy)

def inpaint_fill(a, rect, mask, radius=5, blur=1.2):
    """Telea inpaint of the glyph mask inside rect (uses surrounding plate pixels in all directions)."""
    x0,y0,x1,y1=rect
    reg=cv2.cvtColor(a[y0:y1,x0:x1].copy(),cv2.COLOR_RGB2BGR)
    inp=cv2.inpaint(reg,(mask.astype(np.uint8))*255,radius,cv2.INPAINT_TELEA)
    inp=cv2.cvtColor(inp,cv2.COLOR_BGR2RGB).astype(np.float32)
    bl=cv2.GaussianBlur(inp,(0,0),blur)
    m=cv2.GaussianBlur(mask.astype(np.float32),(0,0),2.0)[...,None]
    return inp*(1-m)+bl*m
