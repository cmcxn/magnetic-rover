from PIL import Image,ImageDraw,ImageFont
from pathlib import Path
P=Path(__file__).resolve().parent
raw=Image.open(P/'station-hero.png').convert('RGBA')
im=Image.new('RGB',(1024,1210),'#edf1f4');im.paste(raw,(0,110),raw);d=ImageDraw.Draw(im)
F='/usr/share/fonts/opentype/noto/NotoSansCJK-Regular.ttc';B='/usr/share/fonts/opentype/noto/NotoSansCJK-Bold.ttc'
d.text((36,20),'回收站 · 三维素材',font=ImageFont.truetype(B,46),fill='#183950')
d.text((38,83),'说明图风格：短环形结构、收集入口、绿色灯条',font=ImageFont.truetype(F,24),fill='#536c7c')
d.text((36,1163),'视觉素材升级 · 回收位置与判定范围保持不变',font=ImageFont.truetype(F,26),fill='#536c7c')
im.save(P/'station-preview.png')
