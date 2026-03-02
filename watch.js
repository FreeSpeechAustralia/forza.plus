const navToggle = document.querySelector('.nav-toggle');
const nav = document.querySelector('.header-nav');
const sortSelect = document.getElementById('sortSelect');
const sortPanel = document.querySelector('.sort-panel');
const videoGrid = document.getElementById('videoGrid');
const videoCount = document.getElementById('videoCount');
const canvas = document.getElementById('nebula-canvas');
const ctx = canvas ? canvas.getContext('2d') : null;

const videos = [];

function sortVideos(mode) {
  const sorted = [...videos];

  if (mode === 'oldest') {
    sorted.sort((a, b) => b.rank - a.rank);
  } else if (mode === 'title') {
    sorted.sort((a, b) => a.title.localeCompare(b.title));
  } else {
    sorted.sort((a, b) => a.rank - b.rank);
  }

  return sorted;
}

function videoCard(video) {
  const embedUrl = `https://rumble.com/embed/${video.id}/`;

  return `
    <article class="video-card glass">
      <div class="video-embed-wrap">
        <iframe
          src="${embedUrl}"
          title="${video.title}"
          loading="lazy"
          allowfullscreen
        ></iframe>
      </div>
      <div class="video-meta">
        <h2>${video.title}</h2>
        <p>Source: Rumble channel feed</p>
        <a href="${video.sourceUrl}" target="_blank" rel="noopener noreferrer">Open on Rumble</a>
      </div>
    </article>
  `;
}

function videoPlaceholder() {
  return `
    <article class="video-placeholder glass" role="status" aria-live="polite">
      <p>No videos to show yet. Coming soon.</p>
    </article>
  `;
}

function renderVideos(mode = 'latest') {
  const sortedVideos = sortVideos(mode);

  if (sortedVideos.length === 0) {
    videoGrid.innerHTML = videoPlaceholder();
    if (videoCount) videoCount.textContent = 'Coming soon';
    if (sortSelect) sortSelect.disabled = true;
    if (sortPanel) sortPanel.classList.add('is-empty');
    return;
  }

  if (sortSelect) sortSelect.disabled = false;
  if (sortPanel) sortPanel.classList.remove('is-empty');
  videoGrid.innerHTML = sortedVideos.map(videoCard).join('');
  videoCount.textContent = `${sortedVideos.length} videos`;
}

if (sortSelect) {
  sortSelect.addEventListener('change', (event) => {
    renderVideos(event.target.value);
  });
}

if (navToggle) {
  navToggle.addEventListener('click', () => {
    const open = nav.classList.toggle('open');
    navToggle.setAttribute('aria-expanded', String(open));
  });
}

if (canvas && ctx) {
  const stars = Array.from({ length: 70 }, () => ({
    x: Math.random(),
    y: Math.random(),
    r: Math.random() * 1.7 + 0.4,
    o: Math.random() * 0.6 + 0.2,
    v: Math.random() * 0.0007 + 0.0002,
  }));

  function resizeCanvas() {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
  }

  function drawStars() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    stars.forEach((star) => {
      star.y += star.v;
      if (star.y > 1.02) star.y = -0.02;

      ctx.beginPath();
      ctx.arc(star.x * canvas.width, star.y * canvas.height, star.r, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(183, 222, 255, ${star.o})`;
      ctx.fill();
    });

    requestAnimationFrame(drawStars);
  }

  resizeCanvas();
  drawStars();
  window.addEventListener('resize', resizeCanvas);
}

renderVideos('latest');
