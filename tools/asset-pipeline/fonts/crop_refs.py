"""Crop reference number samples from extracted video frames into public/private/.../font-ref."""
from PIL import Image
F='tools/asset-pipeline/fonts/_frames/'
O='public/private/coin-volcano/plate/font-ref/'
spec={'plate':('t14',(58,490,352,552)),'coin':('t14',(70,1070,340,1142)),'whirl':('t14',(700,1322,1042,1400)),'counter':('t28',(390,1420,700,1485)),'bigwin':('t34',(245,1368,832,1505)),'ui':('t34',(448,1975,630,2025)),'title':('t34',(222,1181,850,1316))}
ims=[]
for k,(f,b) in spec.items():
    im=Image.open(F+f+'.png').convert('RGB').crop(b); im.save(O+k+'.png'); ims.append(im)
W=max(i.width for i in ims);H=sum(i.height+6 for i in ims)
m=Image.new('RGB',(W,H),(60,60,60));y=0
for i in ims: m.paste(i,(0,y)); y+=i.height+6
m.save(F+'montage.png')
