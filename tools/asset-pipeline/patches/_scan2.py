import numpy as np, json
from PIL import Image, ImageDraw
def fr(t): return Image.open(f"_frames/f{int(round(t*30))+1:04d}.png").convert("RGB")
# sheet: total bar window and sizzling window
ts=[25.6+0.3*i for i in range(17)]
W=Image.new("RGB",(520*4,110*5))
for i,t in enumerate(ts):
    im=fr(t).crop((280,1405,800,1515)); ImageDraw.Draw(im).text((3,3),f"{t:.1f}",fill=(255,255,255))
    W.paste(im,((i%4)*520,(i//4)*110))
W.save("_preview/bar_sheet.png")
ts=[30.5+0.5*i for i in range(20)]
W=Image.new("RGB",(540*4,200*5))
for i,t in enumerate(ts):
    im=fr(t).crop((270,1330,810,1530)); ImageDraw.Draw(im).text((3,3),f"{t:.1f}",fill=(255,255,255))
    W.paste(im,((i%4)*540,(i//4)*200))
W.save("_preview/siz_sheet.png")
