(() => {
  for (const panel of document.querySelectorAll("[data-pace]")) {
    if (panel.dataset.mrPaceReady) continue;
    panel.dataset.mrPaceReady = "1";

    const spans = JSON.parse(panel.dataset.pace);
    const video = panel.querySelector("video");
    const badge = panel.querySelector(".playback-rate");
    if (!video || !badge) continue;
    let frameCallback = null;

    function update() {
      const time = video.currentTime;
      const nextSpan = spans.findIndex(([end]) => time < end);
      const index = nextSpan === -1 ? spans.length - 1 : nextSpan;
      const [end, initialSpeed, finalSpeed = initialSpeed] = spans[index];
      const start = spans[index - 1]?.[0] ?? 0;
      const progress = Math.min(1, Math.max(0, (time - start) / (end - start)));
      const easedProgress = progress * progress * (3 - 2 * progress);
      const bakedSpeed = initialSpeed + (finalSpeed - initialSpeed) * easedProgress;
      const speed = Number((bakedSpeed * video.playbackRate).toFixed(2));
      const label = `${speed}×`;
      if (badge.textContent !== label) badge.textContent = label;
      badge.hidden = video.paused || video.ended || speed === 1;
    }

    function onFrame() {
      frameCallback = null;
      if (video.paused || video.ended) return;
      update();
      startFrameTracking();
    }

    function startFrameTracking() {
      if (frameCallback === null && typeof video.requestVideoFrameCallback === "function") {
        frameCallback = video.requestVideoFrameCallback(onFrame);
      }
    }

    video.addEventListener("play", () => {
      update();
      startFrameTracking();
    });
    for (const event of ["seeking", "seeked", "timeupdate", "loadedmetadata", "ratechange"]) {
      video.addEventListener(event, update);
    }
    for (const event of ["pause", "ended"]) {
      video.addEventListener(event, () => {
        if (frameCallback !== null && typeof video.cancelVideoFrameCallback === "function") {
          video.cancelVideoFrameCallback(frameCallback);
        }
        frameCallback = null;
        update();
      });
    }
  }
})();
