"""Render candidate fonts for visual shape comparison against the reference crops."""
from PIL import Image, ImageDraw, ImageFont
D='public/fonts/'
rows=[('Lilita','LilitaOne-Regular.ttf',None),('Titan','TitanOne-Regular.ttf',None),('Mont800','Montserrat-Variable.ttf',800),('Mont900','Montserrat-Variable.ttf',900),('Mont500','Montserrat-Variable.ttf',500)]
im=Image.new('RGB',(900,60*len(rows)+10),(120,30,20));d=ImageDraw.Draw(im)
for i,(n,f,w) in enumerate(rows):
    ft=ImageFont.truetype(D+f,48)
    if w: ft.set_variation_by_axes([w])
    d.text((10,i*60+5),'25,000.00 150.00 5,018.00',font=ft,fill=(255,240,200),stroke_width=3 if w!=500 else 0,stroke_fill=(150,20,10))
im.save('tools/asset-pipeline/fonts/_frames/cand.png')
