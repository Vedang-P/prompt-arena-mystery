"""Render the finite authored campaign locally; no TTS service or model on clients."""
import sys, json, hashlib, subprocess, wave, os
from pathlib import Path
ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / '.asset-cache/kokoro-python'))
import numpy as np
import onnxruntime as ort
from kokoro_onnx import Kokoro

VOICES = {'narrator':'bm_george','sameer':'am_puck','parth':'am_fenrir',
          'mother':'bf_emma','officer':'am_onyx','voice':'am_echo',
          'veer':'am_liam','tanush':'bm_lewis','leader':'am_michael','enakshi':'af_bella',
          'ramu':'am_adam'}
options = ort.SessionOptions()
options.intra_op_num_threads = 4
options.inter_op_num_threads = 1
session = ort.InferenceSession(str(ROOT / '.asset-cache/kokoro/kokoro-v1.0.onnx'), options, providers=['CPUExecutionProvider'])
kokoro = Kokoro.from_session(session, str(ROOT / '.asset-cache/kokoro/voices-v1.0.bin'))
tasks = json.loads((ROOT / '.asset-cache/speech-tasks.json').read_text())
out = ROOT / 'client/public/assets/audio/voices'
out.mkdir(parents=True, exist_ok=True)
cache = ROOT / '.asset-cache/kokoro-recordings.json'
manifest = json.loads(cache.read_text()) if cache.exists() else {}
limit = int(os.environ.get('SPEECH_LIMIT', '0'))
for index, task in enumerate(tasks['tasks']):
    if limit and index >= limit: break
    key, speaker = task['key'], task['speaker']
    spoken = task.get('spokenText', task['text'])
    # Invalidate recordings when pronunciation preprocessing changes, not just the subtitle.
    speech_digest = hashlib.sha256(spoken.encode()).hexdigest()
    if key in manifest and (ROOT / 'client/public' / manifest[key]['url'].lstrip('/')).exists():
        prior = manifest[key].get('speechHash')
        if prior == speech_digest or (prior is None and spoken == task['text']):
            manifest[key]['speechHash'] = speech_digest
            continue
    voice = VOICES.get(speaker, 'am_michael')
    audio, rate = kokoro.create(spoken, voice=voice, speed=.98 if speaker == 'narrator' else 1, lang='en-gb' if voice.startswith('b') else 'en-us')
    wav = ROOT / '.asset-cache/speech.wav'
    with wave.open(str(wav), 'wb') as f:
        f.setnchannels(1); f.setsampwidth(2); f.setframerate(rate)
        f.writeframes((np.clip(audio, -1, 1) * 32767).astype('<i2').tobytes())
    mp3 = out / f'{key}.tmp.mp3'
    subprocess.run(['ffmpeg','-hide_banner','-loglevel','error','-y','-i',str(wav),'-af','loudnorm=I=-18:TP=-2:LRA=8','-ar','24000','-ac','1','-b:a','80k',str(mp3)], check=True)
    digest = hashlib.sha256(mp3.read_bytes()).hexdigest()[:10]
    final = out / f'{key}-{digest}.mp3'; mp3.replace(final)
    decoded = subprocess.check_output(['ffmpeg','-hide_banner','-loglevel','error','-i',str(final),'-f','f32le','-ac','1','-ar','24000','-'])
    pcm = np.frombuffer(decoded, dtype='<f4')
    peaks = [float(np.sqrt(np.mean(pcm[i:i+1200] ** 2))) for i in range(0, len(pcm), 1200)]
    scale = max(np.percentile(peaks, 90), .01)
    manifest[key] = {'url':f'/assets/audio/voices/{final.name}', 'duration':round(len(pcm)/24000,3), 'speaker':speaker, 'speechHash':speech_digest,
                     'envelope':[round(min(1,p/scale),3) for p in peaks]}
    cache.write_text(json.dumps(manifest))
    print(f'{index+1}/{len(tasks["tasks"])} {speaker}: {manifest[key]["duration"]}s', flush=True)
if not limit:
    current_keys = {task['key'] for task in tasks['tasks']}
    manifest = {key: value for key, value in manifest.items() if key in current_keys}
    (out / 'manifest.json').write_text(json.dumps(manifest,separators=(',',':')))
    prologue = {cue:{**manifest[key], 'text':next(t['text'] for t in tasks['tasks'] if t['key']==key)} for cue,key in tasks['prologue'].items()}
    (ROOT / 'client/public/assets/audio/prologue/manifest.json').write_text(json.dumps(prologue,separators=(',',':')))
    # Remove obsolete generated takes only from the resolved voice output directory.
    retained = {Path(value['url']).name for value in manifest.values()}
    expected = (ROOT / 'client/public/assets/audio/voices').resolve()
    assert out.resolve() == expected
    for recording in out.glob('*.mp3'):
        if recording.name not in retained:
            assert recording.resolve().parent == expected
            recording.unlink()
    cache.write_text(json.dumps(manifest))
    print(f'Published {len(manifest)} recordings and {len(prologue)} opening cues.',flush=True)
