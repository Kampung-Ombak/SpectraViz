const canvas = document.getElementById('vizCanvas');
const ctx = canvas.getContext('2d');
const audio = document.getElementById('audio');

let audioCtx, analyser, sourceNode;
let speakerGainNode;
let playlist = [];
let currentTrackIndex = -1;
let bgImage = null;
let bgFileObj = null;
let logoImage = null;
let particles = [];
let smokeParticles = [];
let logoAngle = 0;

// Dynamic Positioning
let spectrumPos = { x: canvas.width / 2, y: canvas.height - 100 };
let logoPos = { x: canvas.width / 2, y: canvas.height / 2 };

let isDraggingLogo = false;
let isDraggingSpectrum = false;
let dragOffsetX = 0;
let dragOffsetY = 0;

// Set Multi-Select
let activeBgEffects = new Set(['NORMAL']);
let activeParticles = new Set(['NORMAL']);
let currentLogoEffect = 'NORMAL';

// Status Perekaman / Batch Render
let mediaRecorder = null;
let recordedChunks = [];
let isRecording = false;

// Helper Slider
function updateSliderTrack(slider) {
  const min = slider.min ? parseFloat(slider.min) : 0;
  const max = slider.max ? parseFloat(slider.max) : 100;
  const val = parseFloat(slider.value);
  const percentage = ((val - min) / (max - min)) * 100;
  slider.style.background = `linear-gradient(to right, #8c7ae6 0%, #8c7ae6 ${percentage}%, #ffffff ${percentage}%, #ffffff 100%)`;

  const valText = document.getElementById('val_' + slider.id);
  if (valText) valText.textContent = val;
}

document.querySelectorAll('input[type="range"]').forEach(slider => {
  updateSliderTrack(slider);
  slider.addEventListener('input', () => updateSliderTrack(slider));
});

function initAudioContext() {
  if (!audioCtx) {
    audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    analyser = audioCtx.createAnalyser();
    analyser.fftSize = 512;
    sourceNode = audioCtx.createMediaElementSource(audio);

    speakerGainNode = audioCtx.createGain();
    sourceNode.connect(analyser);
    analyser.connect(speakerGainNode);
    speakerGainNode.connect(audioCtx.destination);
  }
}

// -------------------------------------------------------------
// PURE DIRECT DRAG & DROP LOGIC FOR CANVAS
// -------------------------------------------------------------
function getCanvasMousePos(e) {
  const rect = canvas.getBoundingClientRect();
  const scaleX = canvas.width / rect.width;
  const scaleY = canvas.height / rect.height;
  return {
    x: (e.clientX - rect.left) * scaleX,
    y: (e.clientY - rect.top) * scaleY
  };
}

canvas.addEventListener('mousedown', (e) => {
  const mouse = getCanvasMousePos(e);

  if (logoImage) {
    const logoSizeVal = parseInt(document.getElementById('logoSize').value);
    const logoScale = logoSizeVal / 50;
    const baseWidth = 150 * logoScale;
    const baseHeight = (logoImage.height / logoImage.width) * baseWidth;

    if (
      mouse.x >= logoPos.x - baseWidth / 2 &&
      mouse.x <= logoPos.x + baseWidth / 2 &&
      mouse.y >= logoPos.y - baseHeight / 2 &&
      mouse.y <= logoPos.y + baseHeight / 2
    ) {
      isDraggingLogo = true;
      dragOffsetX = mouse.x - logoPos.x;
      dragOffsetY = mouse.y - logoPos.y;
      return;
    }
  }

  isDraggingSpectrum = true;
  dragOffsetX = mouse.x - spectrumPos.x;
  dragOffsetY = mouse.y - spectrumPos.y;
});

window.addEventListener('mousemove', (e) => {
  if (!isDraggingLogo && !isDraggingSpectrum) return;
  const mouse = getCanvasMousePos(e);

  if (isDraggingLogo) {
    logoPos.x = mouse.x - dragOffsetX;
    logoPos.y = mouse.y - dragOffsetY;
  } else if (isDraggingSpectrum) {
    spectrumPos.x = mouse.x - dragOffsetX;
    spectrumPos.y = mouse.y - dragOffsetY;
  }
});

window.addEventListener('mouseup', () => {
  isDraggingLogo = false;
  isDraggingSpectrum = false;
});

document.getElementById('specType').addEventListener('change', (e) => {
  const specType = e.target.value;
  if (specType === 'CIRCLE' || specType === 'CIRCLE1' || specType === 'WAVE') {
    spectrumPos = { x: canvas.width / 2, y: canvas.height / 2 };
  } else {
    spectrumPos = { x: canvas.width / 2, y: canvas.height - 100 };
  }
});

// -------------------------------------------------------------
// 1. PLAYLIST AUDIO LOGIC, REORDERING & CONTINUOUS AUTO RENDER
// -------------------------------------------------------------
const dropZone = document.getElementById('dropZone');
const audioInput = document.getElementById('audioInput');
const playlistBox = document.getElementById('playlistBox');
const placeholder = document.getElementById('playlistPlaceholder');

let draggedIndex = null;

dropZone.addEventListener('click', () => {
  if (playlist.length === 0) audioInput.click();
});

audioInput.addEventListener('change', (e) => handleFiles(e.target.files));
dropZone.addEventListener('dragover', (e) => e.preventDefault());
dropZone.addEventListener('drop', (e) => {
  e.preventDefault();
  if (playlist.length === 0) handleFiles(e.dataTransfer.files);
});

function handleFiles(files) {
  for (let file of files) {
    if (file.type.startsWith('audio/') || file.name.match(/\.(mp3|wav|flac|ogg|m4a|aac)$/i)) {
      playlist.push({ name: file.name, fileObj: file, url: URL.createObjectURL(file) });
    }
  }
  updatePlaylistUI();
  if (currentTrackIndex === -1 && playlist.length > 0) loadTrack(0);
}

function updatePlaylistUI() {
  playlistBox.innerHTML = '';
  if (playlist.length > 0) {
    dropZone.style.pointerEvents = 'none';
    placeholder.style.display = 'none';

    playlist.forEach((track, idx) => {
      const item = document.createElement('div');
      item.className = `playlist-item ${idx === currentTrackIndex ? 'playing' : ''}`;
      item.textContent = `${idx + 1}. ${track.name}`;
      item.style.pointerEvents = 'auto';
      
      item.draggable = true;
      item.dataset.index = idx;

      item.ondragstart = (e) => {
        draggedIndex = idx;
        e.dataTransfer.effectAllowed = 'move';
        item.style.opacity = '0.5';
      };

      item.ondragend = () => {
        item.style.opacity = '1';
        draggedIndex = null;
      };

      item.ondragover = (e) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
      };

      item.ondrop = (e) => {
        e.preventDefault();
        e.stopPropagation();

        const targetIndex = parseInt(item.dataset.index);
        if (draggedIndex !== null && draggedIndex !== targetIndex) {
          const movedTrack = playlist.splice(draggedIndex, 1)[0];
          playlist.splice(targetIndex, 0, movedTrack);

          if (currentTrackIndex === draggedIndex) {
            currentTrackIndex = targetIndex;
          } else if (draggedIndex < currentTrackIndex && targetIndex >= currentTrackIndex) {
            currentTrackIndex--;
          } else if (draggedIndex > currentTrackIndex && targetIndex <= currentTrackIndex) {
            currentTrackIndex++;
          }

          updatePlaylistUI();
        }
      };

      item.onclick = (e) => {
        e.stopPropagation();
        loadTrack(idx);
        playAudio();
      };

      playlistBox.appendChild(item);
    });
  } else {
    dropZone.style.pointerEvents = 'auto';
    placeholder.style.display = 'flex';
  }
}

document.getElementById('clearList').onclick = () => {
  playlist = [];
  currentTrackIndex = -1;
  audio.pause();
  audio.src = '';
  updatePlaylistUI();
};

function loadTrack(index) {
  if (index >= 0 && index < playlist.length) {
    currentTrackIndex = index;
    audio.src = playlist[index].url;
    updatePlaylistUI();
  }
}

function playAudio() {
  initAudioContext();
  if (audioCtx.state === 'suspended') audioCtx.resume();
  audio.play();
  document.getElementById('playBtn').textContent = 'PAUSE';
}

document.getElementById('playBtn').onclick = () => {
  if (!audio.src) return;
  if (audio.paused) playAudio();
  else {
    audio.pause();
    document.getElementById('playBtn').textContent = 'PLAY';
  }
};

document.getElementById('prevBtn').onclick = () => {
  if (playlist.length > 0) {
    let prev = currentTrackIndex - 1 < 0 ? playlist.length - 1 : currentTrackIndex - 1;
    loadTrack(prev);
    playAudio();
  }
};

document.getElementById('nextBtn').onclick = () => {
  if (playlist.length > 0) {
    let next = (currentTrackIndex + 1) % playlist.length;
    loadTrack(next);
    playAudio();
  }
};

audio.ontimeupdate = () => {
  const slider = document.getElementById('timeSlider');
  if (audio.duration) {
    slider.value = (audio.currentTime / audio.duration) * 100;
    updateSliderTrack(slider);
    document.getElementById('timeText').textContent = `${formatTime(audio.currentTime)} / ${formatTime(audio.duration)}`;
  }
};

audio.onended = () => {
  if (isRecording) {
    if (currentTrackIndex + 1 < playlist.length) {
      loadTrack(currentTrackIndex + 1);
      audio.currentTime = 0;
      audio.play();
    } else {
      stopAndDownloadRecording();
    }
  } else {
    if (playlist.length > 0 && currentTrackIndex + 1 < playlist.length) {
      loadTrack(currentTrackIndex + 1);
      playAudio();
    }
  }
};

document.getElementById('timeSlider').oninput = (e) => {
  if (audio.duration) audio.currentTime = (e.target.value / 100) * audio.duration;
};

document.getElementById('volSlider').oninput = (e) => { audio.volume = e.target.value / 100; };

function formatTime(sec) {
  let m = Math.floor(sec / 60);
  let s = Math.floor(sec % 60);
  return `${m < 10 ? '0' + m : m}:${s < 10 ? '0' + s : s}`;
}

// -------------------------------------------------------------
// 2. IMPORTS & MULTI-SELECT BUTTONS
// -------------------------------------------------------------
function loadBgFromFile(file) {
  if (file && file.type.startsWith('image/')) {
    bgFileObj = file;
    document.getElementById('bgName').textContent = file.name;
    const reader = new FileReader();
    reader.onload = (event) => {
      bgImage = new Image();
      bgImage.src = event.target.result;
    };
    reader.readAsDataURL(file);
  }
}

canvas.addEventListener('dragover', (e) => {
  e.preventDefault();
  if (!bgImage) e.dataTransfer.dropEffect = 'copy';
  else e.dataTransfer.dropEffect = 'none';
});

canvas.addEventListener('drop', (e) => {
  e.preventDefault();
  if (bgImage) return;

  const files = e.dataTransfer.files;
  if (files && files.length > 0) loadBgFromFile(files[0]);
});

document.getElementById('bgInput').onchange = (e) => {
  const file = e.target.files[0];
  loadBgFromFile(file);
};
document.getElementById('clearBg').onclick = () => {
  bgImage = null;
  bgFileObj = null;
  document.getElementById('bgName').textContent = 'NO FILE';
  document.getElementById('bgInput').value = '';
};

document.getElementById('logoInput').onchange = (e) => {
  const file = e.target.files[0];
  if (file) {
    document.getElementById('logoName').textContent = file.name;
    const reader = new FileReader();
    reader.onload = (event) => {
      logoImage = new Image();
      logoImage.src = event.target.result;
    };
    reader.readAsDataURL(file);
  }
};
document.getElementById('clearLogo').onclick = () => {
  logoImage = null;
  document.getElementById('logoName').textContent = 'NO FILE';
  document.getElementById('logoInput').value = '';
};

function setupMultiSelectGroup(containerId, activeAttr, activeSet) {
  const container = document.getElementById(containerId);
  const btns = container.querySelectorAll('.btn-option');

  btns.forEach(btn => {
    btn.onclick = () => {
      const val = btn.getAttribute(activeAttr) || btn.textContent.trim();

      if (val === 'NORMAL') {
        activeSet.clear();
        activeSet.add('NORMAL');
        btns.forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
      } else {
        activeSet.delete('NORMAL');
        container.querySelector('[data-bgeffect="NORMAL"], [data-effect="NORMAL"]')?.classList.remove('active');

        if (activeSet.has(val)) {
          activeSet.delete(val);
          btn.classList.remove('active');
          if (activeSet.size === 0) {
            activeSet.add('NORMAL');
            container.querySelector('[data-bgeffect="NORMAL"], [data-effect="NORMAL"]')?.classList.add('active');
          }
        } else {
          activeSet.add(val);
          btn.classList.add('active');
        }
      }
    };
  });
}

setupMultiSelectGroup('bgMotionGroup', 'data-bgeffect', activeBgEffects);
setupMultiSelectGroup('bgEffectsGroup', 'data-effect', activeParticles);

const logoBtns = document.getElementById('logoEffectsGroup').querySelectorAll('.btn-option');
logoBtns.forEach(btn => {
  btn.onclick = () => {
    logoBtns.forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    currentLogoEffect = btn.getAttribute('data-logoeffect') || btn.textContent.trim();
  };
});

// -------------------------------------------------------------
// 3. PARTICLE & ADVANCED FRACTAL LIGHTNING SYSTEM
// -------------------------------------------------------------
function initParticles() {
  particles = [];
  smokeParticles = [];

  for (let i = 0; i < 150; i++) {
    particles.push({
      x: Math.random() * canvas.width,
      y: Math.random() * canvas.height,
      size: Math.random() * 4 + 1,
      speedY: Math.random() * 1.5 + 0.5,
      speedX: (Math.random() - 0.5) * 0.8
    });
  }

  for (let i = 0; i < 40; i++) {
    smokeParticles.push({
      side: i % 2 === 0 ? 'LEFT' : 'RIGHT',
      x: i % 2 === 0 ? Math.random() * 150 : canvas.width - Math.random() * 150,
      y: Math.random() * canvas.height,
      size: Math.random() * 60 + 40,
      vx: (Math.random() - 0.5) * 0.5,
      vy: -Math.random() * 1 - 0.5,
      hue: Math.random() * 360,
      alpha: Math.random() * 0.5 + 0.2
    });
  }
}
initParticles();

function generateLightningPath(x1, y1, x2, y2, displacement) {
  if (displacement < 7) {
    return [{ x: x1, y: y1 }, { x: x2, y: y2 }];
  }
  let midX = (x1 + x2) / 2 + (Math.random() - 0.5) * displacement;
  let midY = (y1 + y2) / 2 + (Math.random() - 0.5) * displacement;

  let path1 = generateLightningPath(x1, y1, midX, midY, displacement / 2);
  let path2 = generateLightningPath(midX, midY, x2, y2, displacement / 2);

  return path1.concat(path2.slice(1));
}

function renderLightningBolt(startX, startY, endX, endY) {
  let path = generateLightningPath(startX, startY, endX, endY, 120);

  ctx.save();
  ctx.beginPath();
  ctx.moveTo(path[0].x, path[0].y);
  for (let i = 1; i < path.length; i++) ctx.lineTo(path[i].x, path[i].y);
  ctx.strokeStyle = '#00f0ff';
  ctx.lineWidth = 8;
  ctx.shadowColor = '#00bfff';
  ctx.shadowBlur = 30;
  ctx.stroke();

  ctx.beginPath();
  ctx.moveTo(path[0].x, path[0].y);
  for (let i = 1; i < path.length; i++) ctx.lineTo(path[i].x, path[i].y);
  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = 2.5;
  ctx.shadowColor = '#ffffff';
  ctx.shadowBlur = 10;
  ctx.stroke();
  ctx.restore();

  for (let i = 2; i < path.length - 2; i += 3) {
    if (Math.random() < 0.45) {
      let bAngle = (Math.random() - 0.5) * 1.5;
      let bLen = 30 + Math.random() * 70;
      let bx = path[i].x + Math.sin(bAngle) * bLen;
      let by = path[i].y + Math.cos(bAngle) * bLen;

      let bPath = generateLightningPath(path[i].x, path[i].y, bx, by, 40);
      ctx.save();
      ctx.beginPath();
      ctx.moveTo(bPath[0].x, bPath[0].y);
      for (let j = 1; j < bPath.length; j++) ctx.lineTo(bPath[j].x, bPath[j].y);
      ctx.strokeStyle = 'rgba(180, 240, 255, 0.8)';
      ctx.lineWidth = 1.2;
      ctx.shadowColor = '#00bfff';
      ctx.shadowBlur = 15;
      ctx.stroke();
      ctx.restore();
    }
  }
}

// -------------------------------------------------------------
// 4. MAIN RENDER LOOP
// -------------------------------------------------------------
function render() {
  requestAnimationFrame(render);
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  let freqArray = new Uint8Array(analyser ? analyser.frequencyBinCount : 0);
  if (analyser) analyser.getByteFrequencyData(freqArray);

  let avgAudio = 0;
  if (freqArray.length > 0) {
    let sum = 0;
    for (let i = 0; i < freqArray.length; i++) sum += freqArray[i];
    avgAudio = (sum / freqArray.length) / 255;
  }

  // A. BACKGROUND RENDER
  ctx.save();
  const bgBrightnessVal = parseInt(document.getElementById('bgBrightness').value);
  const bgBrightnessPercent = (bgBrightnessVal / 50) * 100;
  ctx.filter = `brightness(${bgBrightnessPercent}%)`;

  let bgScale = 1;
  let bgOffX = 0;
  let bgOffY = 0;
  const bgStrength = (parseInt(document.getElementById('bgEffectScale').value) / 100) * 1.8;

  if (!activeBgEffects.has('NORMAL') && bgStrength > 0) {
    if (activeBgEffects.has('BEAT')) bgScale += (avgAudio * 0.25 * bgStrength);
    if (activeBgEffects.has('SNAKE')) {
      bgOffX += Math.sin(Date.now() * 0.003) * 35 * bgStrength;
      bgOffY += Math.cos(Date.now() * 0.003) * 35 * bgStrength;
    }
    if (activeBgEffects.has('VIBRA')) {
      bgOffX += (Math.random() - 0.5) * 30 * bgStrength * avgAudio;
      bgOffY += (Math.random() - 0.5) * 30 * bgStrength * avgAudio;
    }
  }

  ctx.translate(canvas.width / 2 + bgOffX, canvas.height / 2 + bgOffY);
  ctx.scale(bgScale, bgScale);

  if (bgImage) {
    ctx.drawImage(bgImage, -canvas.width / 2, -canvas.height / 2, canvas.width, canvas.height);
  } else {
    ctx.fillStyle = '#050505';
    ctx.fillRect(-canvas.width / 2, -canvas.height / 2, canvas.width, canvas.height);
  }
  ctx.restore();

  // B. MULTI EFEK PARTIKEL & LIGHTING
  const effIntensity = parseInt(document.getElementById('effectIntensity').value);
  const effSpeed = parseInt(document.getElementById('effectSpeed').value);
  const effOpacity = parseInt(document.getElementById('effectOpacity').value) / 100;

  if (!activeParticles.has('NORMAL') && effIntensity > 0 && effOpacity > 0) {
    ctx.save();
    ctx.globalAlpha = effOpacity;

    const speedFactor = (effSpeed / 100) * 0.8 + 0.1;
    const activeCount = Math.floor((effIntensity / 100) * particles.length);

    if (activeParticles.has('SALJU')) {
      ctx.fillStyle = '#ffffff';
      for (let i = 0; i < activeCount; i++) {
        let p = particles[i];
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
        ctx.fill();
        p.y += p.speedY * speedFactor * 2;
        if (p.y > canvas.height) p.y = 0;
      }
    }

    if (activeParticles.has('AIR')) {
      ctx.strokeStyle = '#80d4ff';
      ctx.lineWidth = 1.5;
      for (let i = 0; i < activeCount; i++) {
        let p = particles[i];
        ctx.beginPath();
        ctx.moveTo(p.x, p.y);
        ctx.lineTo(p.x + p.speedX * 2, p.y + p.size * 4);
        ctx.stroke();
        p.y += p.speedY * speedFactor * 5;
        if (p.y > canvas.height) p.y = 0;
      }
    }

    if (activeParticles.has('ASAP')) {
      const activeSmokeCount = Math.floor((effIntensity / 100) * smokeParticles.length);
      for (let i = 0; i < activeSmokeCount; i++) {
        let sp = smokeParticles[i];
        ctx.beginPath();
        let grad = ctx.createRadialGradient(sp.x, sp.y, 0, sp.x, sp.y, sp.size);
        let color = `hsla(${(sp.hue + Date.now() * 0.05) % 360}, 100%, 60%, ${sp.alpha})`;
        grad.addColorStop(0, color);
        grad.addColorStop(1, 'rgba(0,0,0,0)');

        ctx.fillStyle = grad;
        ctx.arc(sp.x, sp.y, sp.size, 0, Math.PI * 2);
        ctx.fill();

        sp.y += sp.vy * speedFactor;
        sp.x += sp.vx;

        if (sp.y < -sp.size) {
          sp.y = canvas.height + sp.size;
          sp.x = sp.side === 'LEFT' ? Math.random() * 150 : canvas.width - Math.random() * 150;
        }
      }
    }

    if (activeParticles.has('LIGHT')) {
      const strikeChance = 0.003 + (effIntensity / 100) * 0.012;
      if (Math.random() < strikeChance + (avgAudio > 0.55 ? 0.015 : 0)) {
        let topX = Math.random() * canvas.width;
        let bottomX = topX + (Math.random() - 0.5) * 450;

        ctx.fillStyle = 'rgba(0, 210, 255, 0.06)';
        ctx.fillRect(0, 0, canvas.width, canvas.height);

        renderLightningBolt(topX, 0, bottomX, canvas.height);
      }
    }

    ctx.restore();
  }

  // C. VISUAL SPECTRUM RENDER
  const specOpacity = parseInt(document.getElementById('spectrumOpacity').value) / 100;
  if (specOpacity > 0 && freqArray.length > 0 && window.isSpectrumActive !== false) {
    ctx.save();
    ctx.globalAlpha = specOpacity;

    const specType = document.getElementById('specType').value;
    const isRGB = document.getElementById('rgbMode').checked;
    const mainColor = document.getElementById('hueColor').value;
    const barHeightVal = parseInt(document.getElementById('barScale').value);
    const heightFactor = Math.pow(barHeightVal / 50, 2);
    const scaleWidthVal = parseInt(document.getElementById('scaleWidth').value) / 50;
    const densityVal = parseInt(document.getElementById('barDensity').value) / 50;
    const boldBarVal = parseInt(document.getElementById('barWidth').value);
    
    const centerX = spectrumPos.x;
    const centerY = spectrumPos.y;

    if (specType === 'BAR1') {
      const columns = Math.max(8, Math.floor(16 * densityVal));
      const rows = 12;
      const totalWidth = canvas.width * 0.75 * scaleWidthVal;
      const blockWidth = (totalWidth / columns) - 4;
      const blockHeight = Math.max(4, (boldBarVal / 100) * 20 + 12);
      const startX = centerX - totalWidth / 2;
      const startY = centerY;

      for (let col = 0; col < columns; col++) {
        let activeRows = Math.floor((freqArray[col * 2] / 255) * rows * heightFactor);
        for (let row = 0; row < rows; row++) {
          let x = startX + col * (blockWidth + 4);
          let y = startY - row * (blockHeight + 3);

          if (row < activeRows) {
            if (isRGB) {
              ctx.fillStyle = `hsl(${(col / columns) * 360}, 100%, 50%)`;
            } else {
              let ratio = row / rows;
              if (ratio < 0.4) ctx.fillStyle = '#00ff44';
              else if (ratio < 0.7) ctx.fillStyle = '#ffcc00';
              else if (ratio < 0.9) ctx.fillStyle = '#ff6600';
              else ctx.fillStyle = '#cc0000';
            }
          } else {
            ctx.fillStyle = 'rgba(255, 255, 255, 0.03)';
          }

          ctx.fillRect(x, y, blockWidth, blockHeight);
        }
      }
    }
    else if (specType === 'BARS') {
      const barCount = Math.max(6, Math.floor(64 * densityVal));
      const strokeWidth = Math.max(2, (boldBarVal / 100) * 120);
      const totalWidth = canvas.width * 0.85 * scaleWidthVal;
      const startX = centerX - totalWidth / 2;
      const stepX = totalWidth / barCount;

      ctx.lineWidth = strokeWidth;
      ctx.lineCap = 'round';
      ctx.shadowBlur = 20;

      for (let i = 0; i < barCount; i++) {
        let h = (freqArray[i] / 255) * 260 * heightFactor;
        let x = startX + i * stepX + (stepX - strokeWidth) / 2;
        let y = centerY - h;
        let color = isRGB ? `hsl(${(i / barCount) * 360}, 100%, 55%)` : mainColor;

        ctx.fillStyle = color;
        ctx.shadowColor = color;
        ctx.fillRect(x, y, strokeWidth, Math.max(3, h));
        
        if (strokeWidth > 4) {
          ctx.fillStyle = '#ffffff';
          ctx.fillRect(x + strokeWidth * 0.25, y, strokeWidth * 0.5, Math.min(6, h));
        }
      }
    }
    else if (specType === 'CIRCLE') {
      const barCount = Math.max(32, Math.floor(120 * densityVal));
      const radius = 140 * scaleWidthVal;
      const strokeWidth = Math.max(1.5, (boldBarVal / 100) * 10);

      ctx.lineWidth = strokeWidth;
      ctx.lineCap = 'round';

      for (let i = 0; i < barCount; i++) {
        let angle = (i / barCount) * Math.PI * 2 - Math.PI / 2;
        let h = (freqArray[i % 64] / 255) * 120 * heightFactor;
        let color = isRGB ? `hsl(${(i / barCount) * 360}, 100%, 50%)` : mainColor;

        let x1 = centerX + Math.cos(angle) * radius;
        let y1 = centerY + Math.sin(angle) * radius;
        let x2 = centerX + Math.cos(angle) * (radius + h);
        let y2 = centerY + Math.sin(angle) * (radius + h);

        ctx.strokeStyle = color;
        ctx.shadowColor = color;
        ctx.shadowBlur = 8;
        ctx.beginPath();
        ctx.moveTo(x1, y1);
        ctx.lineTo(x2, y2);
        ctx.stroke();
      }
    }
    else if (specType === 'WAVE') {
      const points = Math.max(16, Math.floor(64 * densityVal));
      const totalWidth = canvas.width * 0.85 * scaleWidthVal;
      const startX = centerX - totalWidth / 2;
      const strokeWidth = Math.max(2, (boldBarVal / 100) * 12);

      let pts = [];
      for (let i = 0; i < points; i++) {
        let v = (freqArray[i] / 255) * 140 * heightFactor;
        let x = startX + (i / (points - 1)) * totalWidth;
        let y = centerY - v + (Math.sin(i + Date.now() * 0.002) * 10);
        pts.push({ x, y });
      }

      let fillGrad = ctx.createLinearGradient(startX, 0, startX + totalWidth, 0);
      if (isRGB) {
        fillGrad.addColorStop(0, '#ff4b5c');
        fillGrad.addColorStop(0.3, '#4e9f3d');
        fillGrad.addColorStop(0.6, '#00d2fc');
        fillGrad.addColorStop(1, '#ff6bcb');
      } else {
        fillGrad.addColorStop(0, mainColor);
        fillGrad.addColorStop(1, '#000000');
      }

      ctx.save();
      ctx.beginPath();
      ctx.moveTo(pts[0].x, pts[0].y);
      for (let i = 0; i < pts.length - 1; i++) {
        let xc = (pts[i].x + pts[i + 1].x) / 2;
        let yc = (pts[i].y + pts[i + 1].y) / 2;
        ctx.quadraticCurveTo(pts[i].x, pts[i].y, xc, yc);
      }
      ctx.lineTo(pts[pts.length - 1].x, pts[pts.length - 1].y);

      ctx.lineTo(startX + totalWidth, centerY + 100);
      ctx.lineTo(startX, centerY + 100);
      ctx.closePath();

      ctx.fillStyle = fillGrad;
      ctx.globalAlpha = specOpacity * 0.45;
      ctx.fill();

      ctx.globalAlpha = specOpacity;
      ctx.strokeStyle = fillGrad;
      ctx.lineWidth = strokeWidth;
      ctx.shadowColor = isRGB ? '#00d2fc' : mainColor;
      ctx.shadowBlur = 12;
      ctx.stroke();
      ctx.restore();
    }
    else if (specType === 'CIRCLE1') {
      const strokeWidth = Math.max(3, (boldBarVal / 100) * 18);
      ctx.lineWidth = strokeWidth;
      ctx.lineCap = 'round';
      ctx.shadowBlur = 15;

      const rings = [
        { radius: 60 * scaleWidthVal, color: '#00ff44', idx: 3 },
        { radius: 90 * scaleWidthVal, color: '#ff2255', idx: 8 },
        { radius: 120 * scaleWidthVal, color: '#2277ff', idx: 15 },
        { radius: 150 * scaleWidthVal, color: '#e024ff', idx: 22 }
      ];

      rings.forEach((ring, index) => {
        let val = (freqArray[ring.idx] / 255) * heightFactor;
        let speed = (index + 1) * 0.0015;
        let baseAngle = (Date.now() * speed) % (Math.PI * 2);
        let arcLength = Math.PI * 0.6 + val * Math.PI * 0.8;
        let color = isRGB ? `hsl(${(index * 90 + Date.now() * 0.05) % 360}, 100%, 50%)` : ring.color;

        ctx.strokeStyle = color;
        ctx.shadowColor = color;

        ctx.beginPath();
        ctx.arc(centerX, centerY, ring.radius, baseAngle, baseAngle + arcLength);
        ctx.stroke();

        ctx.beginPath();
        ctx.arc(centerX, centerY, ring.radius, baseAngle + Math.PI, baseAngle + Math.PI + (arcLength * 0.7));
        ctx.stroke();
      });
    }

    ctx.shadowBlur = 0;
    ctx.restore();
  }

  // D. LOGO RENDER
  const logoOpacityVal = parseInt(document.getElementById('logoOpacity').value) / 100;
  if (logoImage && logoOpacityVal > 0) {
    ctx.save();
    ctx.globalAlpha = logoOpacityVal;

    const logoSizeVal = parseInt(document.getElementById('logoSize').value);
    const logoScale = logoSizeVal / 50;
    const logoSpeedVal = parseInt(document.getElementById('logoSpeed').value);
    const speedFactor = (logoSpeedVal / 100) * 0.03;

    let lScale = logoScale;
    let lOffX = 0;
    let lOffY = 0;

    if (currentLogoEffect === 'BEAT') {
      lScale = logoScale * (1 + avgAudio * 0.3);
    } else if (currentLogoEffect === 'SNAKE') {
      lOffX = Math.sin(Date.now() * 0.003) * 20;
      lOffY = Math.cos(Date.now() * 0.003) * 20;
    } else if (currentLogoEffect === 'GETAR') {
      lOffX = (Math.random() - 0.5) * 10 * avgAudio;
      lOffY = (Math.random() - 0.5) * 10 * avgAudio;
    } else if (currentLogoEffect === 'PUTAR_R') {
      logoAngle += speedFactor;
    } else if (currentLogoEffect === 'PUTAR_L') {
      logoAngle -= speedFactor;
    }

    ctx.translate(logoPos.x + lOffX, logoPos.y + lOffY);
    ctx.rotate(logoAngle);

    const baseWidth = 150 * lScale;
    const baseHeight = (logoImage.height / logoImage.width) * baseWidth;

    ctx.drawImage(logoImage, -baseWidth / 2, -baseHeight / 2, baseWidth, baseHeight);
    ctx.restore();
  }

  // E. RENDER LIRIK / TEKS LYRIC
  renderLyrics();
}

// -------------------------------------------------------------
// FUNGI UNTUK MENGGAMBAR LIRIK KE CANVAS
// -------------------------------------------------------------
function renderLyrics() {
  if (!window.parsedLyrics || window.parsedLyrics.length === 0) return;

  const currentTime = audio.currentTime || 0;
  let activeText = "";

  for (let i = 0; i < window.parsedLyrics.length; i++) {
    if (currentTime >= window.parsedLyrics[i].time) {
      if (i === window.parsedLyrics.length - 1 || currentTime < window.parsedLyrics[i + 1].time) {
        activeText = window.parsedLyrics[i].text;
        break;
      }
    }
  }

  if (!activeText) return;

  const fontStyle = document.getElementById('lyricFont').value;
  const fontSize = document.getElementById('lyricSize').value;
  const lyricColor = document.getElementById('lyricColor').value;
  const opacity = parseInt(document.getElementById('lyricOpacity').value) / 100;

  if (opacity <= 0) return;

  ctx.save();
  ctx.globalAlpha = opacity;
  ctx.font = `bold ${fontSize}px ${fontStyle}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';

  const lx = (window.lyricPos ? window.lyricPos.x : 0.5) * canvas.width;
  const ly = (window.lyricPos ? window.lyricPos.y : 0.83) * canvas.height;

  // Efek Bayangan / Stroke Teks
  ctx.strokeStyle = '#000000';
  ctx.lineWidth = Math.max(2, fontSize / 8);
  ctx.strokeText(activeText, lx, ly);

  ctx.fillStyle = lyricColor;
  ctx.fillText(activeText, lx, ly);

  ctx.restore();
}

render();

// -------------------------------------------------------------
// 5. EXPORT SYSTEM: CONTINUOUS BATCH PLAYLIST TO MP4 (30 FPS, H.264)
// -------------------------------------------------------------
function stopAndDownloadRecording() {
  if (mediaRecorder && mediaRecorder.state !== 'inactive') {
    mediaRecorder.stop();
  }
  isRecording = false;

  const exportBtn = document.getElementById('exportBtn');
  exportBtn.textContent = "EXPORT MP4";
  exportBtn.style.backgroundColor = "";
}

document.getElementById('exportBtn').onclick = () => {
  const exportBtn = document.getElementById('exportBtn');

  if (!isRecording) {
    if (playlist.length === 0) {
      alert("Masukkan minimal satu file audio di playlist terlebih dahulu!");
      return;
    }

    initAudioContext();
    if (audioCtx.state === 'suspended') {
      audioCtx.resume();
    }

    loadTrack(0);
    audio.currentTime = 0;
    audio.play();
    document.getElementById('playBtn').textContent = 'PAUSE';

    speakerGainNode.gain.setValueAtTime(0, audioCtx.currentTime);

    const canvasStream = canvas.captureStream(30);

    const audioDestination = audioCtx.createMediaStreamDestination();
    sourceNode.connect(audioDestination);

    const combinedStream = new MediaStream([
      ...canvasStream.getVideoTracks(),
      ...audioDestination.stream.getAudioTracks()
    ]);

    let mimeType = 'video/mp4;codecs=avc1.42E01E,mp4a.40.2';
    if (!MediaRecorder.isTypeSupported(mimeType)) {
      mimeType = 'video/mp4;codecs=avc1';
    }
    if (!MediaRecorder.isTypeSupported(mimeType)) {
      mimeType = 'video/mp4';
    }

    recordedChunks = [];
    mediaRecorder = new MediaRecorder(combinedStream, {
      mimeType: mimeType,
      videoBitsPerSecond: 6000000
    });

    mediaRecorder.ondataavailable = (e) => {
      if (e.data.size > 0) recordedChunks.push(e.data);
    };

    mediaRecorder.onstop = () => {
      speakerGainNode.gain.setValueAtTime(1, audioCtx.currentTime);

      const blob = new Blob(recordedChunks, { type: 'video/mp4' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `SPECTRA_PLAYLIST_FULL_${Date.now()}.mp4`;
      a.click();
      URL.revokeObjectURL(url);
    };

    mediaRecorder.start();
    isRecording = true;
    exportBtn.textContent = "STOP & DOWNLOAD";
    exportBtn.style.backgroundColor = "#ff4757";
  } else {
    stopAndDownloadRecording();
  }
};
