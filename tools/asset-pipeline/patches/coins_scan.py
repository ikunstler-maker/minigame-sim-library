"""Scan every frame for coin value text (cream glyphs) in each 3x3 cell; writes _coins.json"""
import numpy as np, json
from PIL import Image
POSES={"base":([200,500,800],[662,892,1117],160,45),"bonus":([205,540,875],[854,1107,1362],150,50)}
out={}
def scan(i,pose):
    cx,cy,hw,hh=POSES[pose]
    a=np.asarray(Image.open(f"_frames/f{i:04d}.png").convert("RGB")).astype(np.int16)
    res={}
    for r in range(3):
        for c in range(3):
            x0=cx[c]-hw;y0=cy[r]-hh
            w=a[y0:y0+2*hh,x0:x0+2*hw]
            m=(w[...,0]>190)&(w[...,1]>170)&(w[...,2]>140)
            ys,xs=np.nonzero(m)
            if len(xs)<250: continue
            res[f"r{r}c{c}"]=[int(x0+np.percentile(xs,2)),int(y0+np.percentile(ys,2)),int(x0+np.percentile(xs,98)),int(y0+np.percentile(ys,98)),len(xs)]
    return res
for i in list(range(1,230))+list(range(310,930)):
    pose="base" if i<260 else "bonus"
    out[i]=scan(i,pose)
json.dump(out,open("_coins.json","w"))
