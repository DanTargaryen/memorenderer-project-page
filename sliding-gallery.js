(() => {
  const CONDITION_SHORT = {
    "object instances": "Instances",
    "object-space coordinates": "Object coords",
    "world-space coordinates": "World coords",
    "surface normals": "Normals",
  };

  function parseCardMeta(label) {
    if (!label) return null;
    const benchMatch = label.match(/case\s+([A-Za-z0-9]+)/i);
    if (benchMatch) {
      const id = benchMatch[1];
      return {
        name: `Case ${id}`,
        tag: /^d/i.test(id) ? "Dynamic GT" : "Static GT",
      };
    }
    const worldMatch = label.match(/^([^,]+),\s*(.+?)\s+and generated render$/i);
    if (worldMatch) {
      const rawCond = worldMatch[2].trim().toLowerCase();
      return {
        name: worldMatch[1].trim(),
        tag: CONDITION_SHORT[rawCond] || worldMatch[2].trim(),
      };
    }
    return { name: label, tag: "" };
  }

  for (const gallery of document.querySelectorAll("[data-world-gallery]")) {
    if (gallery.dataset.mrGalleryReady) continue;
    gallery.dataset.mrGalleryReady = "1";

    for (const card of gallery.querySelectorAll(".world-card")) {
      if (card.querySelector(".world-card-meta")) continue;
      const meta = parseCardMeta(card.getAttribute("aria-label"));
      if (!meta) continue;
      const overlay = document.createElement("div");
      overlay.className = "world-card-meta";
      overlay.setAttribute("aria-hidden", "true");
      const nameEl = document.createElement("span");
      nameEl.className = "world-card-name";
      nameEl.textContent = meta.name;
      overlay.append(nameEl);
      if (meta.tag) {
        const tagEl = document.createElement("span");
        tagEl.className = "world-card-tag";
        tagEl.textContent = meta.tag;
        overlay.append(tagEl);
      }
      card.append(overlay);
    }

    const toggle = gallery.querySelector(".world-toggle");
    const videos = [...gallery.querySelectorAll("video[data-world-video]")];
    const rows = [...gallery.querySelectorAll(".world-sequence:not(.duplicate)")];
    const phaseBySource = new Map();
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
    const isBenchmark = gallery.classList.contains("bench-gallery");
    const visible = new Set();
    let paused = false;
    let elapsedBeforeResume = 0;
    let resumedAt = null;

    rows.forEach((row, rowIndex) => {
      const rowVideos = [...row.querySelectorAll("video[data-world-video]")];
      const rowOffset = rowIndex / rows.length;
      rowVideos.forEach((video, index) => {
        phaseBySource.set(video.dataset.worldVideo, (index + rowOffset) / rowVideos.length);
      });
    });

    function active() {
      return !paused && !reducedMotion.matches && !document.hidden;
    }

    function elapsed(now) {
      return elapsedBeforeResume + (resumedAt === null ? 0 : (now - resumedAt) / 1000);
    }

    function loadVideo(video) {
      if (!video.hasAttribute("src")) {
        video.preload = "metadata";
        video.src = video.dataset.worldVideo;
      }
    }

    function syncVideo(video) {
      if (isBenchmark) {
        const manual = reducedMotion.matches && !video.closest(".duplicate");
        video.controls = manual;
        video.setAttribute("aria-hidden", String(!manual));
        if (manual) {
          if (visible.has(video) && !document.hidden) loadVideo(video);
          else video.pause();
          return;
        }
      }
      if (!active() || !visible.has(video)) {
        video.pause();
        return;
      }
      loadVideo(video);
      if (!video.paused || video.readyState < HTMLMediaElement.HAVE_METADATA) return;

      const duration = video.duration;
      if (Number.isFinite(duration) && duration > 0) {
        const phase = phaseBySource.get(video.dataset.worldVideo) ?? 0;
        const position = (elapsed(performance.now()) + phase * duration) % duration;
        if (Math.abs(video.currentTime - position) > 0.12) video.currentTime = position;
      }
      video.play().catch(() => {});
    }

    function syncGallery() {
      const running = active();
      const now = performance.now();
      if (running && resumedAt === null) {
        resumedAt = now;
      } else if (!running && resumedAt !== null) {
        elapsedBeforeResume = elapsed(now);
        resumedAt = null;
      }
      gallery.dataset.sliding = String(running);
      if (toggle) {
        toggle.hidden = reducedMotion.matches;
        toggle.textContent = paused ? "Resume gallery" : "Pause gallery";
        toggle.setAttribute("aria-pressed", String(paused));
      }
      videos.forEach(syncVideo);
    }

    const observer = new IntersectionObserver(
      entries => {
        for (const { target, intersectionRatio } of entries) {
          if (intersectionRatio >= 0.08) visible.add(target);
          else visible.delete(target);
          syncVideo(target);
        }
      },
      { threshold: [0.08] }
    );

    videos.forEach(video => {
      video.addEventListener("loadedmetadata", () => syncVideo(video));
      observer.observe(video);
    });
    if (toggle) {
      toggle.addEventListener("click", () => {
        paused = !paused;
        syncGallery();
      });
    }
    reducedMotion.addEventListener("change", syncGallery);
    document.addEventListener("visibilitychange", syncGallery);
    syncGallery();
  }
})();
