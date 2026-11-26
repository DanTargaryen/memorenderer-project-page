(() => {
  /* ========================================================================
     1. Legacy Profile Comparison Support
     ======================================================================== */
  for (const article of document.querySelectorAll(".comparison[data-revisit-profiles]")) {
    if (article.dataset.mrProfileReady) continue;
    article.dataset.mrProfileReady = "1";

    const profiles = JSON.parse(article.dataset.revisitProfiles);
    const own = JSON.parse(article.dataset.revisitOurs);
    const options = article.querySelector(".revisit-options");
    const video = article.querySelector("video");
    const label = article.querySelector(".pair-labels b:last-child");
    const loading = article.querySelector(".comparison-loading");
    const cache = new Map();
    let revision = 0;

    function selectedMethod() {
      return options.querySelector("input:checked").value;
    }

    function seek(time) {
      if (video.readyState >= 1) {
        video.currentTime = Math.max(0, Math.min(time, video.duration - 0.01));
        delete video.dataset.seek;
      } else {
        video.dataset.seek = String(time);
        video.preload = "metadata";
        video.load();
      }
    }

    async function ready(expected) {
      if (location.protocol === "file:") return;
      const key = selectedMethod();
      let entry = cache.get(key);
      if (!entry) {
        entry = {};
        entry.promise = fetch(profiles[key].movie)
          .then(response => {
            if (!response.ok) throw new Error("Video unavailable");
            return response.blob();
          })
          .then(blob => {
            entry.url = URL.createObjectURL(blob);
            return entry.url;
          })
          .catch(error => {
            cache.delete(key);
            throw error;
          });
        cache.set(key, entry);
      }
      const url = entry.url || (await entry.promise);
      if (revision === expected && video.src !== url) video.src = url;
    }

    function snapshots(profile) {
      for (const role of ["ours", "other"]) {
        const row = article.querySelector(".snapshot-row." + role);
        const method = role === "ours" ? "MemoRenderer (Ours)" : profile.label;
        row.querySelector(".snapshot-method").textContent = method;
        for (const [index, stage] of ["history", "revisit"].entries()) {
          const src =
            role === "ours" ? profile["ours_" + stage + "_image"] || own[stage] : profile[stage + "_image"];
          const anchor = row.querySelectorAll("a")[index];
          const image = anchor.querySelector("img");
          const text =
            stage[0].toUpperCase() + stage.slice(1) + " view of " + article.dataset.subject + " from " + method;
          anchor.href = src;
          anchor.setAttribute("aria-label", "Open " + text);
          image.src = src;
          image.alt = text;
        }
      }
    }

    options.addEventListener("change", async () => {
      const key = selectedMethod();
      const profile = profiles[key];
      if (profile.available === false) return;
      const time = Number.isFinite(video.currentTime) ? video.currentTime : 0;
      const expected = ++revision;
      video.pause();
      video.poster = profile.poster;
      video.src = cache.get(key)?.url || profile.movie;
      label.textContent = profile.label;
      snapshots(profile);
      video.setAttribute("aria-label", article.dataset.case + " synchronized comparison with " + profile.label);
      loading.textContent = "Loading comparison…";
      loading.hidden = false;
      try {
        await ready(expected);
        if (revision === expected) seek(time);
      } catch (error) {
        console.error("Revisit comparison:", article.dataset.case, error);
      } finally {
        if (revision === expected) loading.hidden = true;
      }
    });

    for (const button of article.querySelectorAll(".play-controls button")) {
      button.onclick = async () => {
        const expected = revision;
        const play = button.classList.contains("play-trajectory");
        const time = play ? 0 : Number(button.dataset.seconds);
        const title = button.textContent;
        video.pause();
        button.disabled = true;
        button.textContent = "Loading…";
        try {
          await ready(expected);
          if (revision !== expected || !article.getClientRects().length) return;
          seek(time);
          if (play) await video.play();
        } catch (error) {
          console.error("Revisit comparison:", article.dataset.case, error);
        } finally {
          button.disabled = false;
          button.textContent = title;
        }
      };
    }
  }

  /* ========================================================================
     2. Synchronized 5-Method Strip Player & Marker Highlighting
     ======================================================================== */
  function syncActiveStage(video, stageButtons, stageContainers) {
    const t = video.currentTime;
    const hasStarted = video.readyState >= 1 && (t > 0 || !video.paused);
    stageButtons.forEach((btn, idx) => {
      const target = Number(btn.dataset.seconds);
      const near = hasStarted && Math.abs(t - target) <= 0.72;
      btn.dataset.active = String(near);
      if (stageContainers[idx]) {
        stageContainers[idx].dataset.active = String(near);
      }
    });
  }

  function setupStrip(article, video, timeline) {
    const play = article.querySelector(".strip-play-button");
    const label = play.querySelector(".strip-play-label");
    const playLabel = label.textContent;
    const range = timeline.querySelector("input");
    const clock = timeline.querySelector("span:not(.playback-rate)");
    const failure = article.querySelector(".strip-playback-error");
    const stageButtons = [...article.querySelectorAll(".play-controls button[data-seconds]")];
    const stillRows = [...article.querySelectorAll(".strip-stills")];
    let pendingSeek;

    // Wrap range input so History / Revisit marker pins sit cleanly on the track
    let trackWrap = timeline.querySelector(".strip-track-wrap");
    if (!trackWrap) {
      trackWrap = document.createElement("div");
      trackWrap.className = "strip-track-wrap";
      range.before(trackWrap);
      trackWrap.append(range);
    }

    const pins = stageButtons.map(btn => {
      const pin = document.createElement("button");
      pin.type = "button";
      pin.className = "strip-marker-pin";
      pin.hidden = true;
      pin.title = `Jump to ${btn.textContent.trim()}`;
      pin.setAttribute("aria-label", `Jump to ${btn.textContent.trim()}`);
      pin.addEventListener("click", e => {
        e.stopPropagation();
        btn.click();
      });
      trackWrap.append(pin);
      return { pin, seconds: Number(btn.dataset.seconds) };
    });

    const format = time => `${Math.floor(time / 60)}:${String(Math.floor(time % 60)).padStart(2, "0")}`;

    function refresh() {
      if (Number.isFinite(video.duration) && video.duration > 0) {
        range.disabled = !!video.error;
        range.max = video.duration;
        range.value = video.currentTime;
        const pct = Math.max(0, Math.min(100, (video.currentTime / video.duration) * 100));
        timeline.style.setProperty("--range-progress", `${pct.toFixed(2)}%`);
        clock.textContent = `${format(video.currentTime)} / ${format(video.duration)}`;
        for (const { pin, seconds } of pins) {
          const pos = Math.max(1, Math.min(99, (seconds / video.duration) * 100));
          pin.style.left = `${pos.toFixed(2)}%`;
          pin.hidden = false;
        }
      }
      const playing = !video.paused && !video.ended;
      play.dataset.playing = String(playing);
      label.textContent = playing ? "Pause" : playLabel;
      syncActiveStage(video, stageButtons, stillRows);
    }

    function toggle(fromStart) {
      if (!video.paused && !video.ended) {
        video.pause();
        return;
      }
      pendingSeek = undefined;
      failure.hidden = true;
      if (video.error) video.load();
      if (video.readyState && (fromStart || video.ended)) video.currentTime = 0;
      clock.textContent = "Loading…";
      video.play().catch(error => {
        if (error.name !== "AbortError") failure.hidden = false;
        if (!video.readyState) clock.textContent = "0:00";
        refresh();
      });
    }

    play.addEventListener("click", () => toggle(true));
    video.addEventListener("click", () => toggle(false));
    video.addEventListener("error", () => {
      failure.hidden = false;
      clock.textContent = "0:00";
      refresh();
    });
    range.addEventListener("input", () => {
      video.currentTime = range.valueAsNumber;
      refresh();
    });
    for (const button of stageButtons) {
      button.addEventListener("click", () => {
        video.pause();
        const time = Number(button.dataset.seconds);
        if (video.readyState) {
          video.currentTime = time;
          refresh();
        } else {
          pendingSeek = time;
          video.load();
        }
      });
    }
    video.addEventListener("loadedmetadata", () => {
      if (pendingSeek !== undefined) {
        video.currentTime = pendingSeek;
        pendingSeek = undefined;
      }
      refresh();
    });
    for (const event of ["timeupdate", "seeking", "seeked", "playing", "play", "pause", "ended"]) {
      video.addEventListener(event, refresh);
    }
    video.controls = false;
    timeline.hidden = false;
    refresh();
  }

  /* ========================================================================
     3. Memory Showcase Cases (#revisits) & Fixed Revisit Panels
     ======================================================================== */
  for (const article of document.querySelectorAll("[data-revisit-fixed]")) {
    if (article.dataset.mrFixedReady) continue;
    article.dataset.mrFixedReady = "1";

    const video = article.querySelector("video");
    const timeline = article.querySelector(".strip-timeline");
    if (timeline) {
      setupStrip(article, video, timeline);
      continue;
    }

    const source = video.getAttribute("src");
    const playBtn = article.querySelector(".play-trajectory");
    const defaultPlayText = playBtn ? playBtn.textContent : "Play trajectory";
    const stageButtons = [...article.querySelectorAll(".play-controls button[data-seconds]")];
    const figures = [...article.querySelectorAll(".memory-frames figure")];
    let action = 0;
    let pending;

    function syncCaseUI() {
      const playing = !video.paused && !video.ended;
      if (playBtn && !playBtn.disabled) {
        playBtn.dataset.playing = String(playing);
        playBtn.textContent = playing ? "Pause" : defaultPlayText;
      }
      syncActiveStage(video, stageButtons, figures);
    }

    video.addEventListener("loadedmetadata", () => {
      if (video.dataset.seek !== undefined) {
        video.currentTime = Math.max(0, Math.min(Number(video.dataset.seek), video.duration - 0.01));
        delete video.dataset.seek;
      }
      syncCaseUI();
    });

    for (const event of ["timeupdate", "seeking", "seeked", "playing", "play", "pause", "ended"]) {
      video.addEventListener(event, syncCaseUI);
    }

    for (const button of article.querySelectorAll(".play-controls button")) {
      button.onclick = async () => {
        const isPlayBtn = button.classList.contains("play-trajectory");
        if (isPlayBtn && !video.paused && !video.ended) {
          video.pause();
          return;
        }
        const expected = ++action;
        const time = isPlayBtn ? 0 : Number(button.dataset.seconds);
        const savedLabel = isPlayBtn ? defaultPlayText : button.textContent;
        video.pause();
        button.disabled = true;
        button.textContent = "Loading…";
        try {
          if (location.protocol !== "file:") {
            if (!pending) {
              pending = fetch(source)
                .then(response => {
                  if (!response.ok) throw new Error("Video unavailable");
                  return response.blob();
                })
                .then(blob => URL.createObjectURL(blob))
                .catch(error => {
                  pending = undefined;
                  throw error;
                });
            }
            const url = await pending;
            if (expected !== action || !article.getClientRects().length) return;
            if (video.src !== url) video.src = url;
          }
          if (!article.getClientRects().length) return;
          if (video.readyState >= 1) {
            video.currentTime = Math.max(0, Math.min(time, video.duration - 0.01));
          } else {
            video.dataset.seek = String(time);
            video.preload = "metadata";
            video.load();
          }
          if (isPlayBtn) await video.play();
        } catch (error) {
          console.error("Revisit playback:", article.dataset.case, error);
        } finally {
          button.disabled = false;
          button.textContent = savedLabel;
          syncCaseUI();
        }
      };
    }
  }

  /* ========================================================================
     4. Deep-Link Scene Parameter (?case=...)
     ======================================================================== */
  const requested = new URLSearchParams(location.search).get("case");
  const requestedMemory = [...document.querySelectorAll("#revisits .memory-case[data-case]")]
    .find(card => card.dataset.case === requested);
  if (requestedMemory && (!location.hash || location.hash === "#revisits")) {
    const scrollToCase = () => requestAnimationFrame(() => requestAnimationFrame(() => {
      requestedMemory.scrollIntoView({ block: "start", behavior: "instant" });
    }));
    // Let the browser finish scrolling to the section fragment first.
    if (document.readyState === "complete") scrollToCase();
    else window.addEventListener("load", scrollToCase, { once: true });
  }

  const radio = [...document.querySelectorAll('input[name="mr-case"]')].find(input => input.value === requested);
  if (radio) {
    radio.checked = true;
    radio.dispatchEvent(new Event("change", { bubbles: true }));
    document.getElementById("revisit-comparisons")?.scrollIntoView({ block: "start" });
  }

  /* ========================================================================
     5. Sticky Masthead Scroll-Spy & Progress Indicator
     ======================================================================== */
  const masthead = document.querySelector(".mr-project .masthead");
  const navLinks = [...document.querySelectorAll('.mr-project .masthead nav a[href^="#"]')];
  if (masthead && navLinks.length && !masthead.dataset.mrNavReady) {
    masthead.dataset.mrNavReady = "1";
    const sections = navLinks
      .map(link => {
        const id = link.getAttribute("href").slice(1);
        const section = document.getElementById(id);
        return section ? { link, section } : null;
      })
      .filter(Boolean);

    let ticking = false;
    function updateScrollUI() {
      ticking = false;
      const doc = document.documentElement;
      const maxScroll = Math.max(1, doc.scrollHeight - window.innerHeight);
      const progress = Math.max(0, Math.min(100, (window.scrollY / maxScroll) * 100));
      masthead.style.setProperty("--scroll-progress", `${progress.toFixed(1)}%`);

      const triggerY = window.scrollY + 150;
      let activeItem = null;
      for (const item of sections) {
        const top = item.section.getBoundingClientRect().top + window.scrollY;
        if (triggerY >= top) activeItem = item;
      }
      for (const item of sections) {
        item.link.dataset.active = String(item === activeItem);
      }
    }

    window.addEventListener(
      "scroll",
      () => {
        if (!ticking) {
          ticking = true;
          requestAnimationFrame(updateScrollUI);
        }
      },
      { passive: true }
    );
    window.addEventListener("resize", updateScrollUI, { passive: true });
    updateScrollUI();
  }

  /* ========================================================================
     6. Interactive Frame & Architecture Inspector Lightbox
     ======================================================================== */
  if (!window.__mrLightboxReady) {
    window.__mrLightboxReady = true;

    const lb = document.createElement("div");
    lb.className = "mr-lightbox";
    lb.setAttribute("role", "dialog");
    lb.setAttribute("aria-modal", "true");
    lb.setAttribute("aria-label", "Image inspector");
    lb.hidden = true;
    lb.innerHTML = `
      <div class="mr-lb-bar">
        <div class="mr-lb-title"></div>
        <div class="mr-lb-stages" role="group" aria-label="View stage"></div>
        <div class="mr-lb-actions">
          <a class="mr-lb-raw" target="_blank" rel="noopener">Open original ↗</a>
          <button type="button" class="mr-lb-close" aria-label="Close inspector">Close · Esc</button>
        </div>
      </div>
      <div class="mr-lb-stage"><img alt=""></div>
      <div class="mr-lb-foot">
        <div class="mr-lb-methods" role="group" aria-label="Renderer method"></div>
        <span class="mr-lb-hint"></span>
      </div>
    `;
    document.body.append(lb);

    const titleEl = lb.querySelector(".mr-lb-title");
    const stagesEl = lb.querySelector(".mr-lb-stages");
    const methodsEl = lb.querySelector(".mr-lb-methods");
    const hintEl = lb.querySelector(".mr-lb-hint");
    const imgEl = lb.querySelector(".mr-lb-stage img");
    const rawEl = lb.querySelector(".mr-lb-raw");
    const closeBtn = lb.querySelector(".mr-lb-close");

    let state = null;
    let lastFocus = null;

    function preloadGrid(grid) {
      for (const row of grid) {
        for (const cell of row) {
          if (cell && cell.src) {
            const im = new Image();
            im.src = cell.src;
          }
        }
      }
    }

    function renderLightbox() {
      if (!state) return;
      const cell = state.grid[state.stageIdx]?.[state.methodIdx];
      if (!cell) return;

      imgEl.src = cell.src;
      imgEl.alt = cell.alt || state.sceneTitle;
      rawEl.href = cell.src;

      const methodPart = state.methods.length > 1 ? ` · ${state.methods[state.methodIdx]}` : "";
      const stagePart = state.stages.length > 1 ? ` — ${state.stages[state.stageIdx]}` : "";
      titleEl.textContent = `${state.sceneTitle}${methodPart}${stagePart}`;

      stagesEl.hidden = state.stages.length <= 1;
      for (const [idx, btn] of [...stagesEl.querySelectorAll("button")].entries()) {
        btn.setAttribute("aria-pressed", String(idx === state.stageIdx));
      }

      methodsEl.hidden = state.methods.length <= 1;
      for (const [idx, btn] of [...methodsEl.querySelectorAll("button")].entries()) {
        btn.setAttribute("aria-pressed", String(idx === state.methodIdx));
      }

      if (state.stages.length > 1 && state.methods.length > 1) {
        hintEl.textContent = "Space / ↑↓ flip History ↔ Revisit · ←→ switch method";
      } else if (state.stages.length > 1) {
        hintEl.textContent = "Space / ←→ flip History ↔ Revisit";
      } else {
        hintEl.textContent = "";
      }
    }

    function openLightbox(nextState, trigger) {
      lastFocus = trigger;
      state = nextState;

      stagesEl.replaceChildren(
        ...state.stages.map((name, idx) => {
          const b = document.createElement("button");
          b.type = "button";
          b.textContent = name;
          b.addEventListener("click", () => {
            state.stageIdx = idx;
            renderLightbox();
          });
          return b;
        })
      );

      methodsEl.replaceChildren(
        ...state.methods.map((name, idx) => {
          const b = document.createElement("button");
          b.type = "button";
          b.textContent = name;
          b.addEventListener("click", () => {
            if (state.grid[state.stageIdx]?.[idx]) {
              state.methodIdx = idx;
              renderLightbox();
            }
          });
          return b;
        })
      );

      preloadGrid(state.grid);
      renderLightbox();
      lb.hidden = false;
      closeBtn.focus();
    }

    function closeLightbox() {
      if (lb.hidden) return;
      lb.hidden = true;
      state = null;
      if (lastFocus && typeof lastFocus.focus === "function") {
        lastFocus.focus();
      }
    }

    closeBtn.addEventListener("click", closeLightbox);
    lb.addEventListener("click", e => {
      if (e.target === lb || e.target.classList.contains("mr-lb-stage")) {
        closeLightbox();
      }
    });

    document.addEventListener("keydown", e => {
      if (lb.hidden || !state) return;
      if (e.key === "Escape") {
        e.preventDefault();
        closeLightbox();
      } else if (e.key === " " && state.stages.length > 1 && e.target.tagName !== "A") {
        e.preventDefault();
        state.stageIdx = (state.stageIdx + 1) % state.stages.length;
        renderLightbox();
      } else if ((e.key === "ArrowUp" || e.key === "ArrowDown") && state.stages.length > 1) {
        e.preventDefault();
        state.stageIdx = (state.stageIdx + 1) % state.stages.length;
        renderLightbox();
      } else if (e.key === "ArrowRight") {
        e.preventDefault();
        if (state.methods.length > 1) {
          state.methodIdx = (state.methodIdx + 1) % state.methods.length;
        } else if (state.stages.length > 1) {
          state.stageIdx = (state.stageIdx + 1) % state.stages.length;
        }
        renderLightbox();
      } else if (e.key === "ArrowLeft") {
        e.preventDefault();
        if (state.methods.length > 1) {
          state.methodIdx = (state.methodIdx - 1 + state.methods.length) % state.methods.length;
        } else if (state.stages.length > 1) {
          state.stageIdx = (state.stageIdx - 1 + state.stages.length) % state.stages.length;
        }
        renderLightbox();
      }
    });

    document.addEventListener("click", e => {
      if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      const anchor = e.target.closest(".mr-project a");
      if (!anchor) return;

      // Case A: 5-method Baseline Comparison Stills
      const stripStills = anchor.closest(".strip-stills");
      if (stripStills) {
        const comparison = anchor.closest(".comparison");
        const rows = [...comparison.querySelectorAll(".strip-stills")];
        const stageIdx = rows.indexOf(stripStills);
        const colAnchors = [...stripStills.querySelectorAll(".strip-columns > *")];
        const methodIdx = colAnchors.indexOf(anchor);
        if (stageIdx >= 0 && methodIdx >= 0) {
          e.preventDefault();
          const sceneTitle = comparison.querySelector(".case-head h3")?.textContent.trim() || "Comparison";
          const stages = rows.map(r => r.querySelector("h4")?.textContent.trim() || "Frame");
          const labels = [...comparison.querySelectorAll(".strip-labels strong")].map(el =>
            el.classList.contains("ours") ? "MemoRenderer (Ours)" : el.textContent.trim()
          );
          const grid = rows.map(row =>
            [...row.querySelectorAll(".strip-columns > *")].map(item => {
              if (item.tagName !== "A") return null;
              return { src: item.getAttribute("href"), alt: item.querySelector("img")?.alt || "" };
            })
          );
          openLightbox({ sceneTitle, stages, methods: labels, grid, stageIdx, methodIdx }, anchor);
        }
        return;
      }

      // Case B: Memory in Action Frames (Television / Snow fox)
      const memFrames = anchor.closest(".memory-frames");
      if (memFrames) {
        const memCase = anchor.closest(".memory-case");
        const figs = [...memFrames.querySelectorAll("figure")];
        const fig = anchor.closest("figure");
        const stageIdx = figs.indexOf(fig);
        if (stageIdx >= 0) {
          e.preventDefault();
          const sceneTitle = memCase.querySelector(".case-head h3")?.textContent.trim() || "MemoRenderer";
          const stages = figs.map(f => f.querySelector("figcaption")?.textContent.trim() || "View");
          const grid = figs.map(f => {
            const a = f.querySelector("a");
            return [{ src: a.getAttribute("href"), alt: a.querySelector("img")?.alt || "" }];
          });
          openLightbox({ sceneTitle, stages, methods: ["MemoRenderer"], grid, stageIdx, methodIdx: 0 }, anchor);
        }
        return;
      }

      // Case C: Architecture Pipeline Figure
      if (anchor.classList.contains("figure")) {
        e.preventDefault();
        openLightbox(
          {
            sceneTitle: "MemoRenderer Architecture — Geometry-Aligned Memory",
            stages: ["Pipeline"],
            methods: ["Architecture"],
            grid: [[{ src: anchor.getAttribute("href"), alt: anchor.querySelector("img")?.alt || "" }]],
            stageIdx: 0,
            methodIdx: 0,
          },
          anchor
        );
      }
    });
  }

  /* ========================================================================
     7. Demo Film Split-Theater & Chapter Controller (#film)
     ======================================================================== */
  const filmSection = document.getElementById("film");
  const filmScreen = filmSection?.querySelector(".film-screen");
  const filmVideo = filmScreen?.querySelector("video");
  if (filmScreen && filmVideo && !filmSection.dataset.mrFilmReady) {
    filmSection.dataset.mrFilmReady = "1";

    const coverPill = filmScreen.querySelector(".film-cover-pill");
    const playBtn = filmSection.querySelector(".film-play-btn");
    const playLabel = playBtn?.querySelector(".film-play-label");
    const chapters = [...filmSection.querySelectorAll(".film-chapter[data-film-seek]")];
    let started = false;
    let queuedSeek = null;

    filmScreen.dataset.started = "false";
    filmVideo.controls = false;
    if (coverPill) coverPill.hidden = false;

    function activatePlayer() {
      if (started) return;
      started = true;
      filmScreen.dataset.started = "true";
      filmVideo.controls = true;
      if (coverPill) coverPill.hidden = true;
    }

    function syncFilmUI() {
      const playing = !filmVideo.paused && !filmVideo.ended;
      if (playBtn && playLabel) {
        playBtn.dataset.playing = String(playing);
        playLabel.textContent = playing ? "Pause" : "Play film";
      }
      const t = filmVideo.currentTime;
      const showActive = started && (playing || t > 0);
      for (const ch of chapters) {
        const s = Number(ch.dataset.filmSeek);
        const e = Number(ch.dataset.filmEnd);
        ch.dataset.active = String(showActive && t >= s - 0.05 && t < e);
      }
    }

    function playFrom(seconds) {
      activatePlayer();
      if (seconds !== undefined) {
        if (filmVideo.readyState >= 1) {
          filmVideo.currentTime = seconds;
          queuedSeek = null;
        } else {
          queuedSeek = seconds;
          filmVideo.preload = "metadata";
          filmVideo.load();
        }
      }
      filmVideo.play().catch(() => {});
      syncFilmUI();
    }

    filmVideo.addEventListener("loadedmetadata", () => {
      if (queuedSeek !== null) {
        filmVideo.currentTime = Math.min(queuedSeek, Math.max(0, filmVideo.duration - 0.1));
        queuedSeek = null;
      }
      syncFilmUI();
    });

    filmVideo.addEventListener("click", e => {
      if (!started) {
        e.preventDefault();
        playFrom();
      }
    });

    if (coverPill) {
      coverPill.addEventListener("click", () => playFrom());
    }

    if (playBtn) {
      playBtn.addEventListener("click", () => {
        if (!filmVideo.paused && !filmVideo.ended) {
          filmVideo.pause();
        } else {
          playFrom(filmVideo.ended ? 0 : undefined);
        }
      });
    }

    for (const ch of chapters) {
      ch.addEventListener("click", () => {
        playFrom(Number(ch.dataset.filmSeek));
      });
    }

    for (const ev of ["play", "playing", "pause", "ended", "timeupdate", "seeking", "seeked"]) {
      filmVideo.addEventListener(ev, syncFilmUI);
    }
    syncFilmUI();
  }
})();
