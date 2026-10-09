(function () {
  "use strict";

  const $ = (id) => document.getElementById(id);
  const SCORE_KEY = "opencity.minigames.scores";
  const scores = (() => {
    try {
      return JSON.parse(localStorage.getItem(SCORE_KEY)) || {};
    } catch (e) {
      return {};
    }
  })();
  function getScore(id) {
    return scores[id] || 0;
  }
  function setScore(id, v) {
    if (v > (scores[id] || 0)) {
      scores[id] = v;
      try {
        localStorage.setItem(SCORE_KEY, JSON.stringify(scores));
      } catch (e) {}
      return true;
    }
    return false;
  }

  const center = $("gamecenter");
  const grid = $("gc-grid");
  const view = $("gameview");
  const viewTitle = $("gv-title");
  const stage = $("gv-stage");
  let active = null;
  let games = [];

  function renderMenu() {
    grid.innerHTML = "";
    const sections = [];
    games.forEach((g) => {
      if (!sections.includes(g.section)) sections.push(g.section);
    });
    sections.forEach((sec) => {
      const head = document.createElement("div");
      head.className = "gc-section";
      head.textContent = sec;
      grid.appendChild(head);
      const row = document.createElement("div");
      row.className = "gc-row";
      games
        .filter((g) => g.section === sec)
        .forEach((g) => {
          const card = document.createElement("button");
          card.className = "gc-card";
          card.dataset.id = g.id;
          card.innerHTML =
            '<span class="gc-icon">' +
            g.icon +
            '</span><span class="gc-name">' +
            g.title +
            '</span><span class="gc-desc">' +
            g.desc +
            '</span><span class="gc-score">BEST ' +
            getScore(g.id) +
            "</span>";
          card.addEventListener("click", () => startGame(g));
          row.appendChild(card);
        });
      grid.appendChild(row);
    });
  }
  function refreshCards() {
    grid.querySelectorAll(".gc-card").forEach((card) => {
      const el = card.querySelector(".gc-score");
      if (el) el.textContent = "BEST " + getScore(card.dataset.id);
    });
  }

  function stopActive() {
    if (active && active.unmount) {
      try {
        active.unmount();
      } catch (e) {}
    }
    active = null;
    stage.innerHTML = "";
  }
  function startGame(g) {
    stopActive();
    active = g;
    viewTitle.textContent = g.title;
    stage.innerHTML = "";
    center.classList.remove("show");
    view.classList.add("show");
    document.body.classList.add("ui-open");
    g.mount(stage, {
      best: () => getScore(g.id),
      submit: (v) => MiniGames.submit(g.id, v),
      exit: backToMenu,
      leave: close,
    });
  }
  function backToMenu() {
    stopActive();
    view.classList.remove("show");
    renderMenu();
    center.classList.add("show");
  }
  function open() {
    if (MiniGames.isOpen) return;
    MiniGames.isOpen = true;
    renderMenu();
    view.classList.remove("show");
    center.classList.add("show");
    document.body.classList.add("ui-open");
    if (MiniGames.onOpen) MiniGames.onOpen();
  }
  function close() {
    stopActive();
    view.classList.remove("show");
    center.classList.remove("show");
    document.body.classList.remove("ui-open");
    MiniGames.isOpen = false;
    if (MiniGames.onClose) MiniGames.onClose();
  }

  const MiniGames = {
    isOpen: false,
    onOpen: null,
    onClose: null,
    open: open,
    close: close,
    score: getScore,
    submit: function (id, v) {
      if (setScore(id, v)) refreshCards();
    },
  };
  window.MiniGames = MiniGames;

  $("gc-leave").addEventListener("click", close);
  $("gv-back").addEventListener("click", backToMenu);
  $("gv-leave").addEventListener("click", close);
  document.addEventListener("keydown", (e) => {
    if (!MiniGames.isOpen || e.key !== "Escape") return;
    e.preventDefault();
    if (view.classList.contains("show")) backToMenu();
    else close();
  });

  // ---- Snake
  const Snake = {
    id: "snake",
    title: "Snake",
    section: "Arcade",
    icon: "🐍",
    desc: "Eat and grow — don't bite yourself.",
    mount(root, api) {
      const N = 16,
        CELL = 20;
      const wrap = document.createElement("div");
      wrap.className = "mg mg-snake";
      wrap.innerHTML =
        '<div class="mg-hud"><span>SCORE <b class="mg-score">0</b></span>' +
        '<span class="mg-best">BEST ' +
        api.best() +
        "</span></div>" +
        '<canvas class="mg-canvas" width="' +
        N * CELL +
        '" height="' +
        N * CELL +
        '"></canvas>' +
        '<div class="mg-dpad"><button data-d="up">▲</button>' +
        '<button data-d="left">◀</button><button data-d="down">▼</button>' +
        '<button data-d="right">▶</button></div>' +
        '<button class="mg-btn mg-restart">Restart</button>';
      root.appendChild(wrap);
      const cvs = wrap.querySelector("canvas");
      const ctx = cvs.getContext("2d");
      const scoreEl = wrap.querySelector(".mg-score");
      const bestEl = wrap.querySelector(".mg-best");

      let snake, dir, nextDir, food, score, alive, acc, lastT, raf, sw = null;

      function placeFood() {
        let p;
        do {
          p = { x: (Math.random() * N) | 0, y: (Math.random() * N) | 0 };
        } while (snake.some((s) => s.x === p.x && s.y === p.y));
        return p;
      }
      function reset() {
        snake = [
          { x: 8, y: 8 },
          { x: 7, y: 8 },
          { x: 6, y: 8 },
        ];
        dir = { x: 1, y: 0 };
        nextDir = dir;
        score = 0;
        alive = true;
        acc = 0;
        lastT = 0;
        food = placeFood();
        scoreEl.textContent = "0";
        draw();
      }
      function setDir(x, y) {
        if (x === -dir.x && y === -dir.y) return;
        nextDir = { x: x, y: y };
      }
      function step() {
        dir = nextDir;
        const head = { x: snake[0].x + dir.x, y: snake[0].y + dir.y };
        const eat = head.x === food.x && head.y === food.y;
        const body = eat ? snake : snake.slice(0, -1);
        const dead =
          head.x < 0 ||
          head.x >= N ||
          head.y < 0 ||
          head.y >= N ||
          body.some((s) => s.x === head.x && s.y === head.y);
        if (dead) {
          alive = false;
          api.submit(score);
          bestEl.textContent = "BEST " + api.best();
          return;
        }
        snake.unshift(head);
        if (eat) {
          score += 10;
          scoreEl.textContent = score;
          food = placeFood();
        } else {
          snake.pop();
        }
      }
      function draw() {
        ctx.fillStyle = "#0b0f16";
        ctx.fillRect(0, 0, cvs.width, cvs.height);
        ctx.strokeStyle = "rgba(255,255,255,.05)";
        for (let k = 1; k < N; k++) {
          ctx.beginPath();
          ctx.moveTo(k * CELL, 0);
          ctx.lineTo(k * CELL, cvs.height);
          ctx.moveTo(0, k * CELL);
          ctx.lineTo(cvs.width, k * CELL);
          ctx.stroke();
        }
        ctx.fillStyle = "#ff3b6b";
        ctx.beginPath();
        ctx.arc(
          food.x * CELL + CELL / 2,
          food.y * CELL + CELL / 2,
          CELL / 2 - 3,
          0,
          7,
        );
        ctx.fill();
        snake.forEach((s, i) => {
          ctx.fillStyle = i === 0 ? "#ffd23f" : "#34c759";
          ctx.fillRect(s.x * CELL + 2, s.y * CELL + 2, CELL - 4, CELL - 4);
        });
        if (!alive) {
          ctx.fillStyle = "rgba(0,0,0,.62)";
          ctx.fillRect(0, 0, cvs.width, cvs.height);
          ctx.fillStyle = "#fff";
          ctx.font = "bold 26px system-ui, sans-serif";
          ctx.textAlign = "center";
          ctx.fillText("GAME OVER", cvs.width / 2, cvs.height / 2 - 6);
          ctx.font = "16px system-ui, sans-serif";
          ctx.fillText("score " + score, cvs.width / 2, cvs.height / 2 + 20);
        }
      }
      function loop(now) {
        raf = requestAnimationFrame(loop);
        if (!alive) return;
        if (!lastT) lastT = now;
        acc += now - lastT;
        lastT = now;
        while (acc >= 120) {
          acc -= 120;
          step();
          if (!alive) break;
        }
        draw();
      }
      function onKey(e) {
        const k = e.key.toLowerCase();
        const map = {
          arrowup: [0, -1],
          w: [0, -1],
          arrowdown: [0, 1],
          s: [0, 1],
          arrowleft: [-1, 0],
          a: [-1, 0],
          arrowright: [1, 0],
          d: [1, 0],
        };
        if (map[k]) {
          e.preventDefault();
          setDir(map[k][0], map[k][1]);
        }
      }
      function onDown(e) {
        sw = { x: e.clientX, y: e.clientY };
      }
      function onUp(e) {
        if (!sw) return;
        const dx = e.clientX - sw.x,
          dy = e.clientY - sw.y;
        sw = null;
        if (Math.hypot(dx, dy) < 18) return;
        if (Math.abs(dx) > Math.abs(dy)) setDir(dx > 0 ? 1 : -1, 0);
        else setDir(0, dy > 0 ? 1 : -1);
      }
      const dbtns = wrap.querySelectorAll(".mg-dpad button");
      dbtns.forEach((b) =>
        b.addEventListener("pointerdown", (e) => {
          e.preventDefault();
          const d = b.dataset.d;
          if (d === "up") setDir(0, -1);
          else if (d === "down") setDir(0, 1);
          else if (d === "left") setDir(-1, 0);
          else setDir(1, 0);
        }),
      );
      const restart = wrap.querySelector(".mg-restart");
      restart.addEventListener("click", reset);
      window.addEventListener("keydown", onKey);
      cvs.addEventListener("pointerdown", onDown);
      cvs.addEventListener("pointerup", onUp);

      reset();
      raf = requestAnimationFrame(loop);
      this._cleanup = () => {
        cancelAnimationFrame(raf);
        window.removeEventListener("keydown", onKey);
        cvs.removeEventListener("pointerdown", onDown);
        cvs.removeEventListener("pointerup", onUp);
      };
    },
    unmount() {
      if (this._cleanup) this._cleanup();
      this._cleanup = null;
    },
  };

  // ---- 2048
  const Game2048 = {
    id: "2048",
    title: "2048",
    section: "Puzzle",
    icon: "🔢",
    desc: "Merge tiles to reach 2048.",
    mount(root, api) {
      const wrap = document.createElement("div");
      wrap.className = "mg mg-2048";
      wrap.innerHTML =
        '<div class="mg-hud"><span>SCORE <b class="mg-score">0</b></span>' +
        '<span class="mg-best">BEST ' +
        api.best() +
        "</span></div>" +
        '<div class="g2048-board"></div>' +
        '<div class="mg-dpad"><button data-d="up">▲</button>' +
        '<button data-d="left">◀</button><button data-d="down">▼</button>' +
        '<button data-d="right">▶</button></div>' +
        '<button class="mg-btn mg-restart">New Game</button>';
      root.appendChild(wrap);
      const board = wrap.querySelector(".g2048-board");
      const scoreEl = wrap.querySelector(".mg-score");
      const bestEl = wrap.querySelector(".mg-best");
      const COLORS = {
        2: "#eee4da",
        4: "#ede0c8",
        8: "#f2b179",
        16: "#f59563",
        32: "#f67c5f",
        64: "#f65e3b",
        128: "#edcf72",
        256: "#edcc61",
        512: "#edc850",
        1024: "#edc53f",
        2048: "#edc22e",
      };
      let cells = [],
        score = 0,
        over = false,
        sw = null;

      for (let i = 0; i < 16; i++) {
        const c = document.createElement("div");
        c.className = "g2048-cell";
        board.appendChild(c);
      }
      function empty() {
        const out = [];
        for (let i = 0; i < 16; i++) if (!cells[i]) out.push(i);
        return out;
      }
      function add() {
        const e = empty();
        if (!e.length) return;
        cells[e[(Math.random() * e.length) | 0]] =
          Math.random() < 0.9 ? 2 : 4;
      }
      function slide(line) {
        const a = line.filter((v) => v);
        let gained = 0;
        for (let i = 0; i < a.length - 1; i++) {
          if (a[i] === a[i + 1]) {
            a[i] *= 2;
            gained += a[i];
            a.splice(i + 1, 1);
          }
        }
        while (a.length < 4) a.push(0);
        return { a: a, gained: gained };
      }
      function move(dir) {
        if (over) return;
        const before = cells.join(",");
        const lines = [];
        for (let i = 0; i < 4; i++) {
          let idx = [];
          for (let j = 0; j < 4; j++) {
            if (dir === "left") idx.push(i * 4 + j);
            else if (dir === "right") idx.push(i * 4 + (3 - j));
            else if (dir === "up") idx.push(j * 4 + i);
            else idx.push((3 - j) * 4 + i);
          }
          lines.push(idx);
        }
        lines.forEach((idx) => {
          const r = slide(idx.map((i) => cells[i]));
          score += r.gained;
          idx.forEach((i, k) => (cells[i] = r.a[k]));
        });
        if (cells.join(",") !== before) {
          add();
          scoreEl.textContent = score;
          if (dead()) {
            over = true;
            api.submit(score);
            bestEl.textContent = "BEST " + api.best();
          }
        }
        render();
      }
      function dead() {
        if (empty().length) return false;
        for (let r = 0; r < 4; r++) {
          for (let c = 0; c < 4; c++) {
            const i = r * 4 + c;
            if (c < 3 && cells[i] === cells[i + 1]) return false;
            if (r < 3 && cells[i] === cells[i + 4]) return false;
          }
        }
        return true;
      }
      function render() {
        for (let i = 0; i < 16; i++) {
          const el = board.children[i];
          const v = cells[i];
          el.textContent = v || "";
          el.style.background = v ? COLORS[v] || "#3c3a32" : "rgba(255,255,255,.06)";
          el.style.color = v && v <= 4 ? "#5a4b32" : "#fff";
        }
        if (over) board.classList.add("over");
        else board.classList.remove("over");
      }
      function reset() {
        cells = new Array(16).fill(0);
        score = 0;
        over = false;
        scoreEl.textContent = "0";
        add();
        add();
        render();
      }
      function onKey(e) {
        const map = {
          arrowup: "up",
          w: "up",
          arrowdown: "down",
          s: "down",
          arrowleft: "left",
          a: "left",
          arrowright: "right",
          d: "right",
        };
        const m = map[e.key.toLowerCase()];
        if (m) {
          e.preventDefault();
          move(m);
        }
      }
      function onDown(e) {
        sw = { x: e.clientX, y: e.clientY };
      }
      function onUp(e) {
        if (!sw) return;
        const dx = e.clientX - sw.x,
          dy = e.clientY - sw.y;
        sw = null;
        if (Math.hypot(dx, dy) < 18) return;
        if (Math.abs(dx) > Math.abs(dy)) move(dx > 0 ? "right" : "left");
        else move(dy > 0 ? "down" : "up");
      }
      wrap.querySelectorAll(".mg-dpad button").forEach((b) =>
        b.addEventListener("pointerdown", (e) => {
          e.preventDefault();
          move(b.dataset.d);
        }),
      );
      wrap.querySelector(".mg-restart").addEventListener("click", reset);
      board.addEventListener("pointerdown", onDown);
      board.addEventListener("pointerup", onUp);
      window.addEventListener("keydown", onKey);

      reset();
      this._cleanup = () => {
        window.removeEventListener("keydown", onKey);
        board.removeEventListener("pointerdown", onDown);
        board.removeEventListener("pointerup", onUp);
      };
    },
    unmount() {
      if (this._cleanup) this._cleanup();
      this._cleanup = null;
    },
  };

  // ---- Memory Match
  const Memory = {
    id: "memory",
    title: "Memory Match",
    section: "Puzzle",
    icon: "🧠",
    desc: "Flip cards and find every pair.",
    mount(root, api) {
      const ICONS = ["🚗", "🚕", "🚓", "🏢", "🌲", "⭐", "🍕", "🎮"];
      const wrap = document.createElement("div");
      wrap.className = "mg mg-memory";
      wrap.innerHTML =
        '<div class="mg-hud"><span>MOVES <b class="mg-moves">0</b></span>' +
        '<span class="mg-best">BEST ' +
        api.best() +
        "</span></div>" +
        '<div class="mem-board"></div>' +
        '<div class="mg-msgline"></div>' +
        '<button class="mg-btn mg-restart">Shuffle</button>';
      root.appendChild(wrap);
      const board = wrap.querySelector(".mem-board");
      const movesEl = wrap.querySelector(".mg-moves");
      const bestEl = wrap.querySelector(".mg-best");
      const msg = wrap.querySelector(".mg-msgline");
      let deck, first, moves, lock, done, tid;

      function shuffle(a) {
        for (let i = a.length - 1; i > 0; i--) {
          const j = (Math.random() * (i + 1)) | 0;
          const t = a[i];
          a[i] = a[j];
          a[j] = t;
        }
        return a;
      }
      function reset() {
        deck = shuffle(ICONS.concat(ICONS).map((ic) => ({ ic: ic, up: false, done: false })));
        first = null;
        moves = 0;
        lock = false;
        done = 0;
        movesEl.textContent = "0";
        msg.textContent = "";
        board.innerHTML = "";
        deck.forEach((card, i) => {
          const b = document.createElement("button");
          b.className = "mem-card";
          b.dataset.i = i;
          b.innerHTML = '<span class="mem-face"></span>';
          b.addEventListener("click", () => flip(i));
          board.appendChild(b);
        });
      }
      function paint() {
        deck.forEach((card, i) => {
          const b = board.children[i];
          const face = b.querySelector(".mem-face");
          face.textContent = card.up || card.done ? card.ic : "";
          b.classList.toggle("up", card.up || card.done);
          b.classList.toggle("done", card.done);
        });
      }
      function flip(i) {
        if (lock || deck[i].up || deck[i].done) return;
        deck[i].up = true;
        paint();
        if (first === null) {
          first = i;
          return;
        }
        moves++;
        movesEl.textContent = moves;
        const a = first;
        const b = i;
        first = null;
        if (deck[a].ic === deck[b].ic) {
          deck[a].done = deck[b].done = true;
          done++;
          paint();
          if (done === ICONS.length) {
            const sc = Math.max(0, 1000 - moves * 30);
            api.submit(sc);
            bestEl.textContent = "BEST " + api.best();
            msg.textContent = "Cleared in " + moves + " moves!";
          }
        } else {
          lock = true;
          tid = setTimeout(() => {
            deck[a].up = deck[b].up = false;
            lock = false;
            paint();
          }, 700);
        }
      }
      wrap.querySelector(".mg-restart").addEventListener("click", reset);
      reset();
      this._cleanup = () => clearTimeout(tid);
    },
    unmount() {
      if (this._cleanup) this._cleanup();
      this._cleanup = null;
    },
  };

  // ---- Tic-Tac-Toe
  const TicTacToe = {
    id: "ttt",
    title: "Tic-Tac-Toe",
    section: "Puzzle",
    icon: "❌",
    desc: "Beat the computer. You are X.",
    mount(root, api) {
      const LINES = [
        [0, 1, 2],
        [3, 4, 5],
        [6, 7, 8],
        [0, 3, 6],
        [1, 4, 7],
        [2, 5, 8],
        [0, 4, 8],
        [2, 4, 6],
      ];
      const wrap = document.createElement("div");
      wrap.className = "mg mg-ttt";
      wrap.innerHTML =
        '<div class="mg-hud"><span>WINS <b class="ttt-wins">0</b></span>' +
        '<span class="mg-best">BEST ' +
        api.best() +
        "</span></div>" +
        '<div class="ttt-board"></div>' +
        '<div class="mg-msgline"></div>' +
        '<button class="mg-btn mg-restart">New Round</button>';
      root.appendChild(wrap);
      const board = wrap.querySelector(".ttt-board");
      const msg = wrap.querySelector(".mg-msgline");
      const winsEl = wrap.querySelector(".ttt-wins");
      const bestEl = wrap.querySelector(".mg-best");
      let cells,
        wins = 0,
        lock,
        tid;

      function check(b) {
        for (let i = 0; i < LINES.length; i++) {
          const L = LINES[i];
          if (b[L[0]] && b[L[0]] === b[L[1]] && b[L[0]] === b[L[2]])
            return b[L[0]];
        }
        return b.every((x) => x) ? "draw" : null;
      }
      function mm(b, me) {
        const w = check(b);
        if (w === "O") return { score: 10 };
        if (w === "X") return { score: -10 };
        if (w === "draw") return { score: 0 };
        const moves = [];
        for (let i = 0; i < 9; i++) {
          if (b[i]) continue;
          b[i] = me;
          moves.push({ score: mm(b, me === "O" ? "X" : "O").score, index: i });
          b[i] = 0;
        }
        let best = moves[0];
        for (let i = 1; i < moves.length; i++) {
          if (me === "O" ? moves[i].score > best.score : moves[i].score < best.score)
            best = moves[i];
        }
        return best;
      }
      function paint() {
        for (let i = 0; i < 9; i++) {
          board.children[i].textContent = cells[i] || "";
          board.children[i].classList.toggle("x", cells[i] === "X");
          board.children[i].classList.toggle("o", cells[i] === "O");
        }
      }
      function finish(w) {
        if (w === "X") {
          wins++;
          winsEl.textContent = wins;
          api.submit(wins);
          bestEl.textContent = "BEST " + api.best();
          msg.textContent = "You win!";
        } else if (w === "O") msg.textContent = "Computer wins.";
        else msg.textContent = "Draw.";
      }
      function aiMove() {
        const b = cells.slice();
        let idx;
        if (b.every((x) => !x)) idx = [0, 2, 4, 6, 8][(Math.random() * 5) | 0];
        else idx = mm(b, "O").index;
        if (b[idx]) return;
        cells[idx] = "O";
        paint();
        const w = check(cells);
        if (w) finish(w);
        else lock = false;
      }
      function play(i) {
        if (lock || cells[i]) return;
        cells[i] = "X";
        paint();
        let w = check(cells);
        if (w) return finish(w);
        lock = true;
        tid = setTimeout(aiMove, 260);
      }
      function reset() {
        cells = new Array(9).fill(0);
        lock = false;
        msg.textContent = "";
        board.innerHTML = "";
        for (let i = 0; i < 9; i++) {
          const b = document.createElement("button");
          b.className = "ttt-cell";
          b.addEventListener("click", () => play(i));
          board.appendChild(b);
        }
        paint();
      }
      wrap.querySelector(".mg-restart").addEventListener("click", reset);
      reset();
      this._cleanup = () => clearTimeout(tid);
    },
    unmount() {
      if (this._cleanup) this._cleanup();
      this._cleanup = null;
    },
  };

  games = [Snake, Game2048, Memory, TicTacToe];
})();
