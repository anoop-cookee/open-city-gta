(function () {
  const isTouch =
    "ontouchstart" in window ||
    navigator.maxTouchPoints > 0 ||
    window.matchMedia("(pointer: coarse)").matches;
  if (!isTouch) return;

  document.body.classList.add("touch");

  const controls = { active: false, x: 0, y: 0 };
  window.touchControls = controls;

  const stick = document.getElementById("stick");
  const nub = document.getElementById("nub");

  if (stick && nub) {
    const radius = 44;
    let pointerId = null;
    let cx = 0;
    let cy = 0;

    const setNub = (dx, dy) => {
      nub.style.transform = `translate(${dx}px, ${dy}px)`;
    };

    const move = (px, py) => {
      let dx = px - cx;
      let dy = py - cy;
      const len = Math.hypot(dx, dy);
      if (len > radius) {
        dx = (dx / len) * radius;
        dy = (dy / len) * radius;
      }
      setNub(dx, dy);
      controls.x = dx / radius;
      controls.y = -dy / radius;
    };

    stick.addEventListener("pointerdown", (e) => {
      e.preventDefault();
      pointerId = e.pointerId;
      stick.setPointerCapture(pointerId);
      const r = stick.getBoundingClientRect();
      cx = r.left + r.width / 2;
      cy = r.top + r.height / 2;
      controls.active = true;
      move(e.clientX, e.clientY);
    });

    stick.addEventListener("pointermove", (e) => {
      if (pointerId !== e.pointerId) return;
      e.preventDefault();
      move(e.clientX, e.clientY);
    });

    const end = (e) => {
      if (pointerId !== e.pointerId) return;
      pointerId = null;
      controls.active = false;
      controls.x = 0;
      controls.y = 0;
      setNub(0, 0);
    };
    stick.addEventListener("pointerup", end);
    stick.addEventListener("pointercancel", end);
  }

  document.querySelectorAll(".tbtn").forEach((btn) => {
    const key = btn.dataset.key;
    const down = (e) => {
      e.preventDefault();
      btn.classList.add("down");
      window.dispatchEvent(new KeyboardEvent("keydown", { key }));
    };
    const up = (e) => {
      if (!btn.classList.contains("down")) return;
      e.preventDefault();
      btn.classList.remove("down");
      window.dispatchEvent(new KeyboardEvent("keyup", { key }));
    };
    btn.addEventListener("pointerdown", down);
    btn.addEventListener("pointerup", up);
    btn.addEventListener("pointercancel", up);
    btn.addEventListener("pointerleave", up);
  });
})();
