for (const gallery of document.querySelectorAll('[data-world-gallery]')) {
    const toggle = gallery.querySelector('.world-toggle');
    const videos = [...gallery.querySelectorAll('video[data-world-video]')];
    const rows = [...gallery.querySelectorAll('.world-sequence:not(.duplicate)')];
    const phaseBySource = new Map();
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
    const isBenchmark = gallery.classList.contains('bench-gallery');
    const visible = new Set();
    let paused = false;
    let elapsedBeforeResume = 0;
    let resumedAt = null;

    rows.forEach((row, rowIndex) => {
        const rowVideos = [...row.querySelectorAll('video[data-world-video]')];
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
        if (!video.hasAttribute('src')) {
            video.preload = 'metadata';
            video.src = video.dataset.worldVideo;
        }
    }

    function syncVideo(video) {
        if (isBenchmark) {
            const manual = reducedMotion.matches && !video.closest('.duplicate');
            video.controls = manual;
            video.setAttribute('aria-hidden', String(!manual));
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
            if (Math.abs(video.currentTime - position) > .12) video.currentTime = position;
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
        toggle.hidden = reducedMotion.matches;
        toggle.textContent = paused ? 'Resume gallery' : 'Pause gallery';
        toggle.setAttribute('aria-pressed', String(paused));
        videos.forEach(syncVideo);
    }

    const observer = new IntersectionObserver(entries => {
        for (const { target, intersectionRatio } of entries) {
            if (intersectionRatio >= .08) visible.add(target);
            else visible.delete(target);
            syncVideo(target);
        }
    }, { threshold: [.08] });
    videos.forEach(video => {
        video.addEventListener('loadedmetadata', () => syncVideo(video));
        observer.observe(video);
    });
    toggle.addEventListener('click', () => {
        paused = !paused;
        syncGallery();
    });
    reducedMotion.addEventListener('change', syncGallery);
    document.addEventListener('visibilitychange', syncGallery);
    syncGallery();
}
