(function () {
  const storyEl = document.getElementById("lastReadStory");
  const fillEl = document.getElementById("lastReadFill");
  const percentEl = document.getElementById("lastReadPercent");
  const hintEl = document.getElementById("lastReadHint");
  const cardEl = document.getElementById("lastReadCard");

  if (!storyEl || !fillEl || !percentEl || !hintEl || !cardEl) {
    return;
  }

  const storyRoutes = {
    book1: "book1.php",
    false_knight: "false_knight.php"
  };

  const session = window.KOOBD_SESSION || {};
  const storageKey = session.userId ? `koobd-last-read:${session.userId}` : null;
  let lastRead = null;

  function readLastRead() {
    if (!storageKey) {
      return null;
    }

    try {
      return JSON.parse(window.localStorage.getItem(storageKey) || "null");
    } catch (error) {
      return null;
    }
  }

  // The story's details pop-up (js/story-details.js), with how far the reader
  // got: Continue picks up where they stopped, Restart begins again.
  function openDetails() {
    if (!lastRead || !storyRoutes[lastRead.storyId]) {
      return;
    }
    const route = storyRoutes[lastRead.storyId];
    const tile = document.querySelector(`[data-story-href="${route}"]`);
    const data = tile ? tile.dataset : {};
    const progress = Math.max(0, Math.min(100, Math.round(lastRead.progress)));
    const finished = progress >= 100;
    window.KoobdStoryDetails.open({
      title: data.storyTitle || lastRead.title,
      cover: data.storyCover || "",
      mode: data.storyMode || "story",
      creator: data.storyCreator || "",
      description: data.storyDescription || "",
      lesson: data.storyLesson || "",
      progress,
      href: route + (finished ? "?restart=1" : "?resume=1"),
      play: finished ? "Read Again" : "Continue",
      altHref: finished ? "" : route + "?restart=1",
      altLabel: "Restart",
      key: data.storyKey || lastRead.storyId
    });
  }

  function renderEmptyState() {
    storyEl.textContent = "No story read yet";
    fillEl.style.width = "0%";
    percentEl.textContent = "0%";
    hintEl.textContent = "Open a story to start tracking progress.";
    cardEl.disabled = true;
    cardEl.style.cursor = "default";
  }

  lastRead = readLastRead();

  if (!storageKey || !lastRead || typeof lastRead.progress !== "number" || !lastRead.title || !storyRoutes[lastRead.storyId]) {
    renderEmptyState();
    return;
  }

  const boundedProgress = Math.max(0, Math.min(100, Math.round(lastRead.progress)));

  storyEl.textContent = lastRead.title;
  fillEl.style.width = boundedProgress + "%";
  percentEl.textContent = boundedProgress + "%";
  hintEl.textContent = boundedProgress >= 100 ? "Completed." : "Stopped here last time.";
  cardEl.disabled = false;

  cardEl.addEventListener("click", openDetails);
})();
