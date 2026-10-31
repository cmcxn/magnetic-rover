from PIL import Image,ImageDraw,ImageFont
from pathlib import Path
P=Path(__file__).resolve().parent
raw=Image.open(P/'battery-hero.png').convert('RGBA')
im=Image.new('RGB',(1024,1210),'#edf1f4');im.paste(raw,(0,110),raw);d=ImageDraw.Draw(im)
F='/usr/share/fonts/opentype/noto/NotoSansCJK-Regular.ttc';B='/usr/share/fonts/opentype/noto/NotoSansCJK-Bold.ttc'
d.text((36,20),'电池 · 三维源模型',font=ImageFont.truetype(B,46),fill='#183950')
d.text((38,83),'独立可复用：黄壳、白色闪电、银色正极',font=ImageFont.truetype(F,24),fill='#536c7c')
d.text((36,1163),'本阶段只新增源素材 · 未替换现有拾取与货载',font=ImageFont.truetype(F,26),fill='#536c7c')
im.save(P/'battery-preview.png')
