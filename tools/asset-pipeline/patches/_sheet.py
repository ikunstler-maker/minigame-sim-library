import sys
from PIL import Image
ts=[float(a) for a in sys.argv[2:]]
n=len(ts); sc=0.33
ims=[Image.open(f"_frames/f{int(round(t*30))+1:04d}.png") for t in ts]
w,h=int(1080*sc),int(2346*sc)
S=Image.new("RGB",(w*n,h))
for i,im in enumerate(ims): S.paste(im.resize((w,h)),(i*w,0))
S.save(sys.argv[1])
