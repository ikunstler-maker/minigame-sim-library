import numpy as np, sys
from PIL import Image
def load(i): return np.asarray(Image.open(f"_frames/f{i+1:04d}.png").convert("RGB")).astype(np.int16)
def textbox(a,x0,y0,x1,y1,thr=60):
    w=a[y0:y1,x0:x1]
    med=np.median(w,axis=1,keepdims=True)
    m=(np.abs(w-med).sum(2)>thr)
    ys,xs=np.nonzero(m)
    if len(xs)<30: return None
    # robust bbox via percentiles
    return (x0+int(np.percentile(xs,1)),y0+int(np.percentile(ys,1)),x0+int(np.percentile(xs,99)),y0+int(np.percentile(ys,99)),len(xs))
if __name__=="__main__":
    W={"grand":(55,315,355,395),"major":(750,320,1005,395),"minor":(55,470,310,525),"mini":(800,470,1005,525)}
    for t in [0,1.5,3,4.5,6,7]:
        a=load(int(round(t*30)))
        print(t,{k:textbox(a,*v) for k,v in W.items()})
