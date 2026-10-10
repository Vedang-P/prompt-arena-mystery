"""Arrange actual review screenshots into inspection sheets."""
from pathlib import Path
import json,sys
from PIL import Image, ImageDraw
root=Path('shots/all-scenes')
shots=json.loads((root/'catalog.json').read_text())
for start in range(0,len(shots),16):
    sheet=Image.new('RGB',(1280,936),'#10212a');draw=ImageDraw.Draw(sheet)
    for j,item in enumerate(shots[start:start+16]):
        image=Image.open(item['path']);image.thumbnail((320,200))
        x,y=(j%4)*320,(j//4)*234
        sheet.paste(image,(x,y));draw.text((x+4,y+204),f'{start+j}: {item["label"]}',fill='#eeeecc')
    sheet.save(root/f'sheet-{start//16}.jpg',quality=90)
