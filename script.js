// ここに必要なJavaScriptを記述します。 
for(let i=4; i<=12; i++){
  const btn = document.getElementById(`btn${i}`);
  btn.addEventListener('click', function(){
    if(btn.classList.contains('toggle-gray')){
      btn.classList.remove('toggle-gray');
      btn.classList.add('toggle-blue');
    }else{
      btn.classList.remove('toggle-blue');
      btn.classList.add('toggle-gray');
    }
  });
}

function getPattern() {
  // 1~12のボタンのON/OFFパターンを配列で返す（ON:1, OFF:0）
  const pattern = [];
  for(let i=1; i<=12; i++){
    const btn = document.getElementById(`btn${i}`);
    pattern.push(btn.classList.contains('toggle-blue') ? 1 : 0);
  }
  return pattern;
}

function createWaveBuffer(pattern, freq, durationPerStep) {
  // pattern: [1,0,1,...] 12個, freq:Hz, durationPerStep:秒
  const sampleRate = 44100;
  const totalSteps = pattern.length;
  const totalDuration = durationPerStep * totalSteps;
  const length = Math.floor(sampleRate * totalDuration);
  const buffer = new (window.AudioContext || window.webkitAudioContext)().createBuffer(1, length, sampleRate);
  const data = buffer.getChannelData(0);
  for(let step=0; step<totalSteps; step++){
    const start = Math.floor(step * durationPerStep * sampleRate);
    const end = Math.floor((step+1) * durationPerStep * sampleRate);
    if(pattern[step]){
      for(let i=start; i<end; i++){
        data[i] = Math.sin(2 * Math.PI * freq * (i/sampleRate)) * 0.5;
      }
    }else{
      for(let i=start; i<end; i++){
        data[i] = 0;
      }
    }
  }
  return buffer;
}

function bufferToWav(buffer) {
  // AudioBuffer -> WAV(ArrayBuffer)
  function floatTo16BitPCM(output, offset, input){
    for(let i=0; i<input.length; i++, offset+=2){
      let s = Math.max(-1, Math.min(1, input[i]));
      s = s < 0 ? s * 0x8000 : s * 0x7FFF;
      output.setInt16(offset, s, true);
    }
  }
  const numOfChan = buffer.numberOfChannels;
  const sampleRate = buffer.sampleRate;
  const length = buffer.length * numOfChan * 2 + 44;
  const wav = new ArrayBuffer(length);
  const view = new DataView(wav);
  // RIFF identifier 'RIFF'
  [82,73,70,70].forEach((v,i)=>view.setUint8(i,v));
  view.setUint32(4, 36 + buffer.length * numOfChan * 2, true);
  [87,65,86,69].forEach((v,i)=>view.setUint8(8+i,v)); // 'WAVE'
  [102,109,116,32].forEach((v,i)=>view.setUint8(12+i,v)); // 'fmt '
  view.setUint32(16, 16, true); // PCM chunk size
  view.setUint16(20, 1, true); // format: PCM
  view.setUint16(22, numOfChan, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * numOfChan * 2, true);
  view.setUint16(32, numOfChan * 2, true);
  view.setUint16(34, 16, true); // bits per sample
  [100,97,116,97].forEach((v,i)=>view.setUint8(36+i,v)); // 'data'
  view.setUint32(40, buffer.length * numOfChan * 2, true);
  let offset = 44;
  for(let ch=0; ch<numOfChan; ch++){
    floatTo16BitPCM(view, offset, buffer.getChannelData(ch));
    offset += 2 * buffer.length;
  }
  return wav;
}

// 音量比率スライダの値をリアルタイム表示
const mixSlider = document.getElementById('mix-ratio');
const mixValue = document.getElementById('mix-ratio-value');
mixSlider.addEventListener('input', function() {
  mixValue.textContent = mixSlider.value;
});

// 合成ボタン処理
function readMp3AsArrayBuffer(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsArrayBuffer(file);
  });
}

document.getElementById('mix-btn').addEventListener('click', async function() {
  const fileInput = document.getElementById('mp3file');
  const file = fileInput.files[0];
  const freq = parseFloat(document.getElementById('frequency').value);
  if(isNaN(freq) || freq < 1 || freq > 20000){
    alert('周波数を正しく入力してください');
    return;
  }
  const pattern = getPattern();
  if(pattern.slice(3).every(v=>v===0)){
    alert('4~12のいずれかのボタンをONにしてください');
    return;
  }
  const mixRatio = parseInt(mixSlider.value, 10) / 100; // 基本波形の比率
  const durationPerStep = 0.5;
  const audio = document.getElementById('audio-player');

  if (!file) {
    // mp3未選択時：基本波形のみ1回分生成
    const baseBuffer = createWaveBuffer(pattern, freq, durationPerStep);
    const wav = bufferToWav(baseBuffer);
    const blob = new Blob([wav], {type:'audio/wav'});
    const url = URL.createObjectURL(blob);
    audio.src = url;
    audio.loop = false;
    audio.load();
    audio.play();
    return;
  }
  // mp3デコード
  const arrayBuffer = await readMp3AsArrayBuffer(file);
  const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  let mp3Buffer;
  try {
    mp3Buffer = await audioCtx.decodeAudioData(arrayBuffer);
  } catch (e) {
    alert('mp3のデコードに失敗しました');
    return;
  }
  // 基本波形生成（mp3長さ分ループ）
  const totalSteps = pattern.length;
  const baseStepBuffer = createWaveBuffer(pattern, freq, durationPerStep);
  const baseData = baseStepBuffer.getChannelData(0);
  const baseLen = baseStepBuffer.length;
  const sampleRate = mp3Buffer.sampleRate;
  const totalLen = mp3Buffer.length;
  // 基本波形をmp3長さ分ループ
  const baseBuffer = audioCtx.createBuffer(1, totalLen, sampleRate);
  const baseCh = baseBuffer.getChannelData(0);
  for(let i=0; i<totalLen; i++){
    baseCh[i] = baseData[i % baseLen];
  }
  // 合成
  const outBuffer = audioCtx.createBuffer(1, totalLen, sampleRate);
  const outCh = outBuffer.getChannelData(0);
  const mp3Ch = mp3Buffer.numberOfChannels > 0 ? mp3Buffer.getChannelData(0) : new Float32Array(totalLen);
  for(let i=0; i<totalLen; i++){
    outCh[i] = baseCh[i] * mixRatio + mp3Ch[i] * (1 - mixRatio);
  }
  // WAV化
  const wav = bufferToWav(outBuffer);
  const blob = new Blob([wav], {type:'audio/wav'});
  const url = URL.createObjectURL(blob);
  audio.src = url;
  audio.loop = true;
  audio.load();
  audio.play();
}); 