# Calibra el sonido de la app a partir de una grabación de acordeón.
# Mide, en las notas sostenidas: perfil de armónicos por registro, ruido de aire y trémolo (cents).
# Solo produce números; la grabación no se guarda ni se distribuye.
import numpy as np, wave, json
import sys
# Uso: ffmpeg -i grabacion.webm -ac 1 -ar 44100 g44.wav && python3 tools/calibrar-sonido.py g44.wav notas.json
w=wave.open(sys.argv[1]); sr=w.getframerate(); x=np.frombuffer(w.readframes(w.getnframes()),dtype=np.int16)/32768
notes=json.load(open(sys.argv[2]))
def f_of(m): return 440*2**((m-69)/12)
prof={'grave':[], 'medio':[], 'agudo':[]}; beats=[]; noise=[]
for n in notes:
    d=n['end']-n['start']
    if d<0.2: continue
    a=int((n['start']+0.06)*sr); b=int((n['end']-0.03)*sr); seg=x[a:b]
    if len(seg)<int(0.12*sr): continue
    L=1<<int(np.ceil(np.log2(len(seg)*4)))
    S=np.abs(np.fft.rfft(seg*np.hanning(len(seg)),L)); f=np.fft.rfftfreq(L,1/sr)
    f0=f_of(n['midi'])
    # afinar f0 con el pico del primer armónico
    m=(f>f0*0.97)&(f<f0*1.03)
    if not m.any(): continue
    f0=f[m][S[m].argmax()]
    H=[]
    for k in range(1,25):
        if f0*k>sr/2-500: H.append(np.nan); continue
        mm=(f>f0*k*0.985)&(f<f0*k*1.015); H.append(S[mm].max() if mm.any() else np.nan)
    H=np.array(H); 
    if not np.isfinite(H[0]) or H[0]<=0: continue
    Hdb=20*np.log10(H/np.nanmax(H)+1e-9)
    reg='grave' if f0<300 else 'medio' if f0<700 else 'agudo'
    prof[reg].append(Hdb)
    # ruido entre armónicos (aire): mediana del espectro entre armónicos 1-8 vs pico
    between=[]
    for k in range(1,8):
        mm=(f>f0*(k+0.35))&(f<f0*(k+0.65)); 
        if mm.any(): between.append(np.median(S[mm]))
    noise.append(20*np.log10(np.median(between)/np.nanmax(H)))
    # trémolo: modulación de la envolvente de armónicos 2..6
    if d>=0.3:
        for k in range(2,7):
            fc=f0*k
            if fc>6000: break
            # filtro paso-banda por FFT
            X=np.fft.rfft(seg); ff=np.fft.rfftfreq(len(seg),1/sr)
            X[(ff<fc-0.35*f0)|(ff>fc+0.35*f0)]=0
            y=np.fft.irfft(X,len(seg))
            # envolvente por Hilbert simple
            Y=np.fft.fft(y); hh=np.zeros(len(y)); hh[0]=1; hh[1:(len(y)+1)//2]=2
            if len(y)%2==0: hh[len(y)//2]=1
            env=np.abs(np.fft.ifft(Y*hh))
            env=env-env.mean(); Le=1<<int(np.ceil(np.log2(len(env)*8)))
            E=np.abs(np.fft.rfft(env*np.hanning(len(env)),Le)); fe=np.fft.rfftfreq(Le,1/sr)
            band=(fe>1.0)&(fe<min(40,0.3*f0))
            if not band.any(): continue
            fb=fe[band][E[band].argmax()]; strength=E[band].max()/(np.abs(env).mean()*len(env)/2+1e-9)
            cents=1200*np.log2(1+fb/(k*f0)) if False else 1200*np.log2((k*f0+fb)/(k*f0))
            beats.append((n['midi'],k,fb,cents,strength,d))
for r,v in prof.items():
    if not v: continue
    A=np.nanmedian(np.array(v),axis=0)
    print(f"{r:6s} n={len(v):3d} armónicos dB: "+' '.join('—' if np.isnan(a) else f'{a:.0f}' for a in A[:16]))
print('ruido entre armónicos (dB rel. pico): mediana %.1f'%np.median(noise))
bt=np.array([b for b in beats if b[4]>0.15])
if len(bt):
    c=bt[:,3]; print('trémolo: %d medidas, cents mediana %.1f (p25 %.1f, p75 %.1f); batido típico %.1f Hz'%(len(c),np.median(c),np.percentile(c,25),np.percentile(c,75),np.median(bt[:,2])))
    hist,edges=np.histogram(c,bins=[0,4,8,12,16,20,25,30,40,60]); print('histograma cents:',dict(zip([f'{edges[i]:.0f}-{edges[i+1]:.0f}' for i in range(len(hist))],hist.tolist())))
out={}
for r,v in prof.items():
    A=np.nanmedian(np.array(v),axis=0)
    # rellenar NaN finales con caída lineal en dB
    last=np.where(np.isfinite(A))[0].max()
    slope=(A[last]-A[max(0,last-4)])/4 if last>=4 else -4
    for i in range(last+1,len(A)): A[i]=A[i-1]+min(slope,-2)
    out[r]=[round(float(a),1) for a in A]
print('Perfil para js/reed.js (PROFILE):'); print(json.dumps(out))
