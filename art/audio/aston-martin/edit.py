"""Reproducible CC0 recording edit; Python stdlib only."""
import wave, struct, math
from pathlib import Path
base=Path(__file__).resolve().parent
with wave.open(str(base/'source.wav'),'rb') as w:
 rate=w.getframerate();src=struct.unpack('<'+'h'*w.getnframes(),w.readframes(w.getnframes()))
# Strong engine body before the distant drive-away; no pitch synthesis.
rate_out=44100
frames=round(.48*rate_out);period=round(.4*rate_out)
def sample(t):
 p=t*rate;i=int(p);f=p-i
 return src[i]*(1-f)+src[i+1]*f
loop=[sample(2.02+i/rate_out) for i in range(period)]
# Crossfade the recording boundary, then repeat the continuous sustain.
fade=round(.04*rate_out)
for i in range(fade):
 t=i/(fade-1);loop[period-fade+i]=loop[period-fade+i]*(1-t)+sample(2.02+(i-fade)/rate_out)*t
peak=max(abs(x) for x in loop);gain=0.78*32767/peak
out=[]
for i in range(frames):
 v=0.88*32767*math.tanh(loop[i%period]*gain/32767*2.3)*min(1,i/(rate_out*.004));out.append(round(v))
root=base.parents[2]
with wave.open(str(root/'client/public/assets/audio/boost-engine.wav'),'wb') as w:
 w.setparams((1,2,rate_out,0,'NONE','not compressed'));w.writeframes(struct.pack('<'+'h'*len(out),*out))
