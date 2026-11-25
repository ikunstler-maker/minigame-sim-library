"""Contact sheets: original frame | frame with all active patches composited (no text).
usage: python preview.py            -> _preview/sheet_*.png (full frames) and zoom_*.png (detail strips)"""
import json, os, sys, cv2, numpy as np
from patchlib import *
ROOT=os.path.abspath(os.path.join(HERE,"..","..",".."))
PLATE=os.path.join(ROOT,"public","private","coin-volcano","plate")
D=json.load(open(os.path.join(PLATE,"patches.json")))
items=D["items"]
PREV=os.path.join(HERE,"_preview"); os.makedirs(PREV,exist_ok=True)
def pair(t):
    raw=load_rgb(fidx(t))[3:3+2340]
    return raw,composite(raw,items,t,PLATE)
def label(img,s):
    cv2.putText(img,s,(6,30),cv2.FONT_HERSHEY_SIMPLEX,1.0,(255,255,255),2); return img
def sheet(name,times,scale=0.3):
    cols=[]
    for t in times:
        a,b=pair(t)
        a=cv2.resize(a,None,fx=scale,fy=scale,interpolation=cv2.INTER_AREA); b=cv2.resize(b,None,fx=scale,fy=scale,interpolation=cv2.INTER_AREA)
        col=np.concatenate([a,b],1); cv2.putText(col,f"{t}s",(4,16),cv2.FONT_HERSHEY_SIMPLEX,0.5,(255,255,255),1); cols.append(col)
    out=np.concatenate(cols,1)
    cv2.imwrite(os.path.join(PREV,name),cv2.cvtColor(out,cv2.COLOR_RGB2BGR))
def zoom(name,times,rect,scale=1.0):
    x0,y0,x1,y1=rect; rows=[]
    for t in times:
        a,b=pair(t)
        r=np.concatenate([a[y0:y1,x0:x1],b[y0:y1,x0:x1]],1)
        r=cv2.resize(r,None,fx=scale,fy=scale,interpolation=cv2.INTER_AREA); cv2.putText(r,f"{t}s",(4,16),cv2.FONT_HERSHEY_SIMPLEX,0.5,(255,255,255),1); rows.append(r)
    cv2.imwrite(os.path.join(PREV,name),cv2.cvtColor(np.concatenate(rows,0),cv2.COLOR_RGB2BGR))
if __name__=="__main__":
    T=[0.5,3.0,5.5,7.0,11.5,13.0,17.0,21.2,24.5,27.5,29.5,31.0,34.0,38.0]
    sheet("sheet_1.png",T[:4]); sheet("sheet_2.png",T[4:8]); sheet("sheet_3.png",T[8:11]+[T[11]]); sheet("sheet_4.png",T[12:])
    zoom("zoom_plates_base.png",[0.5,5.5],(0,230,1080,540),0.9)
    zoom("zoom_plates_bonus.png",[13.0,21.2,27.5],(0,400,1080,710),0.9)
    zoom("zoom_bottom.png",[0.5,5.5,13.0,29.0,38.0],(0,1530,1080,2060),0.5)
    zoom("zoom_grid_bonus.png",[13.0,17.0,22.0,24.5],(0,740,1080,1520),0.55)
    zoom("zoom_grid_base.png",[0.5,3.0,5.5],(0,560,1080,1240),0.55)
    zoom("zoom_bar.png",[26.0,27.5,29.5],(250,1400,830,1520),1.0)
    zoom("zoom_sizzle.png",[31.5,34.0,38.0],(0,1330,1080,1560),0.9)
