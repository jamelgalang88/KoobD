document.addEventListener("DOMContentLoaded", function () {
  var track = document.getElementById("homeHeroTrack");
  var dots = Array.prototype.slice.call(document.querySelectorAll(".dash-hero-dot"));

  if (!track || !dots.length) {
    return;
  }

  var totalSlides = dots.length;
  var currentIndex = 0;
  var autoAdvanceId = null;

  function renderSlide(index) {
    currentIndex = index;
    track.style.transform = "translateX(-" + currentIndex * 100 + "%)";

    dots.forEach(function (dot, dotIndex) {
      dot.classList.toggle("is-active", dotIndex === currentIndex);
    });
  }

  function goToNextSlide() {
    renderSlide((currentIndex + 1) % totalSlides);
  }

  function startAutoAdvance() {
    stopAutoAdvance();
    autoAdvanceId = window.setInterval(goToNextSlide, 4200);
  }

  function stopAutoAdvance() {
    if (autoAdvanceId !== null) {
      window.clearInterval(autoAdvanceId);
      autoAdvanceId = null;
    }
  }

  dots.forEach(function (dot) {
    dot.addEventListener("click", function () {
      var target = Number(dot.getAttribute("data-slide"));
      if (!Number.isNaN(target)) {
        renderSlide(target);
        startAutoAdvance();
      }
    });
  });

  // On touch screens the banner is swiped: left for the next slide, right for
  // the previous one.
  var swipeStartX = null;
  var swipeStartY = 0;
  track.addEventListener("touchstart", function (event) {
    swipeStartX = event.touches[0].clientX;
    swipeStartY = event.touches[0].clientY;
    stopAutoAdvance();
  }, { passive: true });
  track.addEventListener("touchend", function (event) {
    if (swipeStartX === null) {
      return;
    }
    var dx = event.changedTouches[0].clientX - swipeStartX;
    var dy = event.changedTouches[0].clientY - swipeStartY;
    swipeStartX = null;
    if (Math.abs(dx) > 40 && Math.abs(dx) > Math.abs(dy)) {
      renderSlide((currentIndex + (dx < 0 ? 1 : totalSlides - 1)) % totalSlides);
    }
    startAutoAdvance();
  }, { passive: true });

  track.addEventListener("mouseenter", stopAutoAdvance);
  track.addEventListener("mouseleave", startAutoAdvance);
  track.addEventListener("focusin", stopAutoAdvance);
  track.addEventListener("focusout", startAutoAdvance);

  renderSlide(0);
  startAutoAdvance();
});
