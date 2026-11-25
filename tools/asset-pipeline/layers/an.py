import cv2,numpy as np,sys
BX=[217,539,862];BY=[679,929,1174];OX=[208,541,873];OY=[855,1112,1369]
def fr(k): return cv2.imread(f'_frames/f{k:04d}.png')
def crop(im,cx,cy,r=130): return im[cy-r:cy+r,cx-r:cx+r].astype(np.float32)
mode=sys.argv[1]
if mode=='base':
    X,Y=BX,BY;ks=range(0,38);ref=0
else:
    X,Y=OX,OY;ks=range(52,152);ref=None
if mode=='base':
    R=fr(0)
    refs={(r,c):crop(R,X[c],Y[r]) for r in range(3) for c in range(3)}
    print('t   '+' '.join(f'r{r}c{c}' for r in range(3) for c in range(3)))
    for k in ks:
        im=fr(k);print(f'{k*0.2:4.1f}',' '.join(f'{np.abs(crop(im,X[c],Y[r])-refs[(r,c)]).mean():4.0f}' for r in range(3) for c in range(3)))
else:
    # compare each cell to r2c0 median (empty all along): diff vs r2c0 crop at each frame (different pos but same art)
    print('t   '+' '.join(f'r{r}c{c}' for r in range(3) for c in range(3)))
    t=fr(52)
    refs={(r,c):crop(t,X[c],Y[r]) for r in range(3) for c in range(3)}
    for k in ks:
        im=fr(k);print(f'{k*0.2:4.1f}',' '.join(f'{np.abs(crop(im,X[c],Y[r])-refs[(r,c)]).mean():4.0f}' for r in range(3) for c in range(3)))
