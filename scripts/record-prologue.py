"""Pre-render licensed Piper/VCTK neural voices. No runtime TTS server required.
Requires piper-tts, downloaded VCTK model/config and ffmpeg; sources in ASSETS.md.
"""
import sys, json, wave, subprocess, re, array, math
from pathlib import Path
root = Path.cwd()
sys.path.insert(0,str(root / '.asset-cache/python'))
from piper import PiperVoice, SynthesisConfig
voice = PiperVoice.load(str(root / '.asset-cache/voices/en_GB-vctk-medium.onnx'))
case = json.loads((root / '.asset-cache/public-case.json').read_text(encoding='utf-8'))
act = next(a for a in case['acts'] if a['id']=='act0')
out = root / 'client/public/assets/audio/prologue'
out.mkdir(parents=True,exist_ok=True)
# Distinct licensed VCTK speakers; no imitation of named individuals.
speakers = {'narrator':'p227', 'sameer':'p226', 'parth':'p232', 'mother':'p231', 'officer':'p241', 'voice':'p243'}
manifest = {}
for beat in act['beats']:
    for index, line in enumerate(beat['lines']):
        key = beat['id']+'-'+str(index)
        wav_path = root / '.asset-cache' / (key+'.wav')
        text = line['text'].replace('Sameer','Sah-meer').replace('Parth','Paarth').replace('Boogle','Boo-gle')
        config=SynthesisConfig(speaker_id=voice.config.speaker_id_map[speakers[line['speaker']]],
            length_scale=1.45, noise_scale=.35, noise_w_scale=.4)
        with wave.open(str(wav_path),'wb') as wav: voice.synthesize_wav(text,wav,syn_config=config)
        with wave.open(str(wav_path),'rb') as wav:
            duration=wav.getnframes()/wav.getframerate()
            samples=array.array('h',wav.readframes(wav.getnframes()))
            window=wav.getframerate()//20
            envelope=[math.sqrt(sum(v*v for v in samples[i:i+window])/max(1,len(samples[i:i+window])))/32768 for i in range(0,len(samples),window)]
            peak=max(envelope) or 1
            envelope=[round(min(1,v/peak*1.4),3) for v in envelope]
        filters='highpass=f=75,lowpass=f=10000,loudnorm=I=-18:TP=-2:LRA=7'
        if line['speaker']=='voice': filters='asetrate=19845,aresample=22050,highpass=f=150,lowpass=f=2800,aecho=0.6:0.5:90:0.18,loudnorm=I=-18:TP=-2:LRA=7'
        subprocess.run(['ffmpeg','-hide_banner','-loglevel','error','-y','-i',str(wav_path),'-af',filters,'-c:a','libmp3lame','-b:a','96k',str(out / (key+'.mp3'))],check=True)
        if line['speaker']=='voice': duration=duration/0.9+.1
        manifest[key]={'url':'/assets/audio/prologue/'+key+'.mp3','duration':round(duration,3),'speaker':line['speaker'],'text':line['text'],'envelope':envelope}
        print(key,round(duration,2),flush=True)
(out / 'manifest.json').write_text(json.dumps(manifest,indent=2),encoding='utf-8')
