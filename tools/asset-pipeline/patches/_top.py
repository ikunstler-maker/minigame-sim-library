import sys
from PIL import Image, ImageDraw
out=sys.argv[1]; y0=int(sys.argv[2]); y1=int(sys.argv[3]); sc=float(sys.argv[4]); cols=int(sys.argv[5]); ts=[float(a) for a in sys.argv[6:]]
w=int(1080*sc); h=int((y1-y0)*sc); rows=(len(ts)+cols-1)//cols
S=Image.new("RGB",(w*cols,h*rows))
for i,t in enumerate(ts):
    im=Image.open(f"_frames/f{int(round(t*30))+1:04d}.png").crop((0,y0,1080,y1)).resize((w,h))
    ImageDraw.Draw(im).text((4,4),f"{t}",fill=(255,255,255))
    S.paste(im,((i%cols)*w,(i//cols)*h))
S.save(out)
