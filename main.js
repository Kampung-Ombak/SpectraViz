/* ===================================================
   Aesthetix Studio - Logic & Engine Utama
   =================================================== */

document.addEventListener('DOMContentLoaded', () => {
  // Canvas Configuration
  const canvas = document.getElementById('canvas');
  const ctx = canvas.getContext('2d');

  // Elements Controls
  const audio = document.getElementById('audio');
  const btnPlay = document.getElementById('btn-play');
  const seekBar = document.getElementById('seek-bar');
  const timeCurrent = document.getElementById('time-current');
  const timeDuration = document.getElementById('time-duration');
  
  // Custom Controls Input
  const aspectRatioSelect = document.getElementById('aspect-ratio');
  const bgUpload = document.getElementById('bg-upload');
  const audioUpload = document.getElementById('audio-upload');
  const playlistContainer = document.getElementById('playlist-container');
  const lrcUpload = document.getElementById('lrc-upload');
  const lyricTextarea = document.getElementById('lyric-text');
  
  // Style Inputs
  const fontFamily = document.getElementById('font-family');
  const colorText = document.getElementById('color-text');
  const colorActive = document.getElementById('color-active');
  const fontSize = document.getElementById('font-size');
  const visualizerType = document.getElementById('visualizer-type');
  const btnExport = document.getElementById('btn-export');

  // State Management
  let bgMedia = null; // Image or Video
  let isVideo = false;
  let playlist = [];
  let currentTrackIndex = 0;
  let lyrics = [];
  
  // Web Audio API Setup
  let audioCtx, analyser, dataArray, source;

  function initAudioContext() {
    if (!audioCtx) {
      audioCtx = new (window.AudioContext || window.webkitAudioContext)();
      analyser = audioCtx.createAnalyser();
      analyser.fftSize = 128;
      source = audioCtx.createMediaElementSource(audio);
      source.connect(analyser);
      analyser.connect(audioCtx.destination);
      dataArray = new Uint8Array(analyser.frequencyBinCount);
    }
  }

  // Set Resolution Canvas sesuai Aspect Ratio
  function updateCanvasDimensions() {
    const ratio = aspectRatioSelect.value;
    if (ratio === '9:16') {
      canvas.width = 1080; canvas.height = 1920;
    } else if (ratio === '1:1') {
      canvas.width = 1080; canvas.height = 1080;
    } else if (ratio === '16:9') {
      canvas.width = 1920; canvas.height = 1080;
    } else if (ratio === '4:5') {
      canvas.width = 1080; canvas.height = 1350;
    }
  }
  updateCanvasDimensions();
  aspectRatioSelect.addEventListener('change', updateCanvasDimensions);

  // Background Upload Handling
  bgUpload.addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (!file) return;

    const url = URL.createObjectURL(file);
    if (file.type.startsWith('video/')) {
      isVideo = true;
      bgMedia = document.createElement('video');
      bgMedia.src = url;
      bgMedia.autoplay = true;
      bgMedia.loop = true;
      bgMedia.muted = true;
      bgMedia.play();
    } else {
      isVideo = false;
      bgMedia = new Image();
      bgMedia.src = url;
    }
  });

  // Audio Upload & Playlist Setup
  audioUpload.addEventListener('change', (e) => {
    const files = Array.from(e.target.files);
    files.forEach(file => {
      playlist.push({
        name: file.name,
        url: URL.createObjectURL(file)
      });
    });
    renderPlaylist();
    if (playlist.length > 0 && !audio.src) {
      loadTrack(0);
    }
  });

  function renderPlaylist() {
    playlistContainer.innerHTML = '';
    playlist.forEach((track, index) => {
      const item = document.createElement('div');
      item.className = `playlist-item ${index === currentTrackIndex ? 'active' : ''}`;
      item.innerHTML = `<span style="font-size:0.8rem; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">${track.name}</span>`;
      item.onclick = () => loadTrack(index);
      playlistContainer.appendChild(item);
    });
  }

  function loadTrack(index) {
    currentTrackIndex = index;
    audio.src = playlist[index].url;
    renderPlaylist();
    audio.play();
    btnPlay.innerHTML = `<i data-lucide="pause"></i>`;
    lucide.createIcons();
  }

  // Play / Pause Action
  btnPlay.addEventListener('click', () => {
    initAudioContext();
    if (audioCtx.state === 'suspended') {
      audioCtx.resume();
    }

    if (audio.paused) {
      if (!audio.src && playlist.length > 0) loadTrack(0);
      else audio.play();
      btnPlay.innerHTML = `<i data-lucide="pause"></i>`;
    } else {
      audio.pause();
      btnPlay.innerHTML = `<i data-lucide="play"></i>`;
    }
    lucide.createIcons();
  });

  // Seekbar Update
  audio.addEventListener('timeupdate', () => {
    if (!isNaN(audio.duration)) {
      seekBar.value = (audio.currentTime / audio.duration) * 100;
      timeCurrent.textContent = formatTime(audio.currentTime);
      timeDuration.textContent = formatTime(audio.duration);
    }
  });

  seekBar.addEventListener('input', () => {
    if (audio.duration) {
      audio.currentTime = (seekBar.value / 100) * audio.duration;
    }
  });

  function formatTime(secs) {
    const m = Math.floor(secs / 60);
    const s = Math.floor(secs % 60);
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  }

  // Parse File LRC
  lrcUpload.addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (evt) => {
      lyricTextarea.value = evt.target.result;
      parseLRC(evt.target.result);
    };
    reader.readAsText(file);
  });

  lyricTextarea.addEventListener('input', () => {
    parseLRC(lyricTextarea.value);
  });

  function parseLRC(lrcContent) {
    const lines = lrcContent.split('\n');
    const regex = /\[(\d{2}):(\d{2})\.(\d{2,3})\](.*)/;
    lyrics = [];

    lines.forEach(line => {
      const match = line.match(regex);
      if (match) {
        const time = parseInt(match[1]) * 60 + parseInt(match[2]) + parseFloat("0." + match[3]);
        const text = match[4].trim();
        if (text) lyrics.push({ time, text });
      }
    });
  }

  // Render Loop Canvas
  function render() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // 1. Draw Background
    if (bgMedia) {
      ctx.drawImage(bgMedia, 0, 0, canvas.width, canvas.height);
    } else {
      ctx.fillStyle = '#111';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
    }

    // 2. Visualizer Spectrum Audio
    if (analyser && visualizerType.value !== 'none') {
      analyser.getByteFrequencyData(dataArray);
      ctx.fillStyle = colorActive.value;

      if (visualizerType.value === 'bars') {
        const barWidth = (canvas.width / dataArray.length) * 2;
        let x = 0;
        for (let i = 0; i < dataArray.length; i++) {
          const barHeight = (dataArray[i] / 255) * (canvas.height * 0.2);
          ctx.fillRect(x, canvas.height - barHeight, barWidth - 2, barHeight);
          x += barWidth;
        }
      }
    }

    // 3. Draw Lyrics Sync
    if (lyrics.length > 0) {
      const currentTime = audio.currentTime;
      let activeIndex = -1;

      for (let i = 0; i < lyrics.length; i++) {
        if (currentTime >= lyrics[i].time) {
          activeIndex = i;
        } else {
          break;
        }
      }

      if (activeIndex !== -1) {
        ctx.textAlign = 'center';
        ctx.font = `700 ${fontSize.value * 2}px ${fontFamily.value}`;
        
        const posX = canvas.width * window.lyricPos.x;
        const posY = canvas.height * window.lyricPos.y;

        // Glow Effect / Shadow Teks
        ctx.shadowColor = 'rgba(0,0,0,0.8)';
        ctx.shadowBlur = 12;
        ctx.fillStyle = colorActive.value;
        ctx.fillText(lyrics[activeIndex].text, posX, posY);
        ctx.shadowBlur = 0; // reset
      }
    }

    requestAnimationFrame(render);
  }

  render();

  // Export Canvas to Video (MP4/WebM)
  btnExport.addEventListener('click', () => {
    alert('Sistem merekam canvas... Musik akan diputar otomatis sampai selesai untuk mengeksport!');
    
    const stream = canvas.captureStream(30);
    const mediaRecorder = new MediaRecorder(stream, { mimeType: 'video/webm' });
    const chunks = [];

    mediaRecorder.ondataavailable = (e) => chunks.push(e.data);
    mediaRecorder.onstop = () => {
      const blob = new Blob(chunks, { type: 'video/webm' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'aesthetix-video.webm';
      a.click();
    };

    mediaRecorder.start();
    audio.currentTime = 0;
    audio.play();

    audio.onended = () => {
      mediaRecorder.stop();
      alert('Export Video Berhasil!');
    };
  });
});
