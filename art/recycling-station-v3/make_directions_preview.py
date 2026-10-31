"""Annotation only: paste actual rendered PNGs without any2Drotation."""
from PIL import Image,ImageDraw,ImageFont
from pathlib import Path
import json,math
P=Path(__file__).resolve().parent;R=P.parents[1]/'client/public/assets/cartoon';m=json.loads((R/'station-v3-directions.json').read_text())
F='/usr/share/fonts/opentype/noto/NotoSansCJK-Regular.ttc';B='/usr/share/fonts/opentype/noto/NotoSansCJK-Bold.ttc'
def font(n,b=False):return ImageFont.truetype(B if b else F,n)
im=Image.new('RGB',(1200,1070),'#edf2f4');d=ImageDraw.Draw(im)
d.text((40,24),'三个回收站 · 门口朝向场地中心',font=font(42,True),fill='#173b50')
d.text((42,90),'固定相机与灯光，旋转真实模型；绿色箭头为地面朝向标注。',font=font(25),fill='#58727d')
center=(600,498);roots=[(303,300),(897,300),(600,840)];labels=['左上站 → 右下 33.69°','右上站 → 左下 146.31°','下方站 → 向上 −90°'];scale=1.25
for i,(frame,root) in enumerate(zip(m['frames'],roots)):
 a=Image.open(R/frame['image']).convert('RGBA');a=a.resize((320,320),Image.Resampling.LANCZOS)
 ox=root[0]-frame['rootAnchorPx'][0]*scale;oy=root[1]-frame['rootAnchorPx'][1]*scale;im.paste(a,(round(ox),round(oy)),a)
 x=ox+frame['entranceAnchorPx'][0]*scale;y=oy+frame['entranceAnchorPx'][1]*scale
 dx,dy=center[0]-x,center[1]-y;length=math.hypot(dx,dy);ux,uy=dx/length,dy/length;end=(center[0]-ux*58,center[1]-uy*58)
 d.line((x,y,*end),fill='#21a67a',width=5);d.polygon([end,(end[0]-ux*19-uy*8,end[1]-uy*19+ux*8),(end[0]-ux*19+uy*8,end[1]-uy*19-ux*8)],fill='#21a67a')
 tx=root[0]-160;ty=140 if i<2 else 957;d.text((tx,ty),labels[i],font=font(24,True),fill='#244c61')
d.ellipse((550,448,650,548),fill='#d8f1e5',outline='#21a67a',width=3);d.text((552,480),'场地中心',font=font(23,True),fill='#17604c')
d.text((38,1020),'下方站入口在背面自然遮挡；未改变回收判定范围，也未旋转平面图片。',font=font(24),fill='#58727d')
im.save(P/'station-directions-preview.png')
