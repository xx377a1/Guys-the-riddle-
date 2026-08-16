/**
 * Arrow Flow Puzzle - Main Game Script
 * Fully self-contained logic for rendering, path validation, audio synthesis,
 * hints, undo, animations, state management, and particle celebration.
 */

(function () {
  'use strict';

  // ==================== GLOBAL GAME STATE ====================
  const STATE = {
    screen: 'HOME', // HOME, LEVEL_SELECT, PLAYING, SETTINGS
    currentLevelNum: 1,
    activeLevelData: null,
    activeArrows: [], // Array of current active arrow objects
    undoStack: [], // Array of previous activeArrows states
    moveCount: 0,
    isAnimating: false,
    coins: 100,
    unlockedLevel: 1,
    levelStars: {}, // { levelNum: stars }
    levelBestMoves: {}, // { levelNum: bestMoves }
    settings: {
      sound: true,
      music: true,
      vibration: true,
      reducedMotion: false
    },
    tutorialSeen: false,
    keyboardSelectedArrowId: null
  };

  // ==================== AUDIO SYNTHESIZER (WEB AUDIO API) ====================
  let audioCtx = null;
  let bgMusicOsc = null;
  let bgMusicGain = null;

  function initAudio() {
    if (!audioCtx) {
      const AudioContextClass = window.AudioContext || window.webkitAudioContext;
      if (AudioContextClass) {
        audioCtx = new AudioContextClass();
      }
    }
    if (audioCtx && audioCtx.state === 'suspended') {
      audioCtx.resume();
    }
  }

  function playSound(type) {
    if (!STATE.settings.sound || !audioCtx) return;
    initAudio();

    const now = audioCtx.currentTime;

    try {
      if (type === 'click') {
        const osc = audioCtx.createOscillator();
        const gain = audioCtx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(600, now);
        osc.frequency.exponentialRampToValueAtTime(150, now + 0.08);
        gain.gain.setValueAtTime(0.3, now);
        gain.gain.linearRampToValueAtTime(0.01, now + 0.08);
        osc.connect(gain);
        gain.connect(audioCtx.destination);
        osc.start(now);
        osc.stop(now + 0.08);

      } else if (type === 'move') {
        const osc = audioCtx.createOscillator();
        const gain = audioCtx.createGain();
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(300, now);
        osc.frequency.exponentialRampToValueAtTime(900, now + 0.2);
        gain.gain.setValueAtTime(0.35, now);
        gain.gain.exponentialRampToValueAtTime(0.01, now + 0.22);
        osc.connect(gain);
        gain.connect(audioCtx.destination);
        osc.start(now);
        osc.stop(now + 0.22);

      } else if (type === 'blocked') {
        const osc = audioCtx.createOscillator();
        const gain = audioCtx.createGain();
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(140, now);
        osc.frequency.setValueAtTime(100, now + 0.08);
        gain.gain.setValueAtTime(0.3, now);
        gain.gain.linearRampToValueAtTime(0.01, now + 0.18);
        osc.connect(gain);
        gain.connect(audioCtx.destination);
        osc.start(now);
        osc.stop(now + 0.18);

        if (STATE.settings.vibration && navigator.vibrate) {
          navigator.vibrate(50);
        }

      } else if (type === 'hint') {
        [523.25, 659.25, 783.99].forEach((freq, idx) => {
          const osc = audioCtx.createOscillator();
          const gain = audioCtx.createGain();
          osc.type = 'sine';
          osc.frequency.setValueAtTime(freq, now + idx * 0.08);
          gain.gain.setValueAtTime(0.2, now + idx * 0.08);
          gain.gain.exponentialRampToValueAtTime(0.01, now + idx * 0.08 + 0.25);
          osc.connect(gain);
          gain.connect(audioCtx.destination);
          osc.start(now + idx * 0.08);
          osc.stop(now + idx * 0.08 + 0.25);
        });

      } else if (type === 'victory') {
        const notes = [523.25, 659.25, 783.99, 1046.50, 1318.51];
        notes.forEach((freq, idx) => {
          const osc = audioCtx.createOscillator();
          const gain = audioCtx.createGain();
          osc.type = 'triangle';
          osc.frequency.setValueAtTime(freq, now + idx * 0.1);
          gain.gain.setValueAtTime(0.35, now + idx * 0.1);
          gain.gain.exponentialRampToValueAtTime(0.01, now + idx * 0.1 + 0.4);
          osc.connect(gain);
          gain.connect(audioCtx.destination);
          osc.start(now + idx * 0.1);
          osc.stop(now + idx * 0.1 + 0.4);
        });

        if (STATE.settings.vibration && navigator.vibrate) {
          navigator.vibrate([40, 60, 40, 60, 100]);
        }
      }
    } catch (e) {
      console.warn("Audio playback error:", e);
    }
  }

  // Toggle ambient background synth music
  function updateMusicState() {
    if (!STATE.settings.music) {
      if (bgMusicGain) {
        bgMusicGain.gain.linearRampToValueAtTime(0.001, audioCtx ? audioCtx.currentTime + 0.5 : 0);
      }
      return;
    }
    initAudio();
    if (!audioCtx) return;

    if (!bgMusicOsc) {
      try {
        bgMusicOsc = audioCtx.createOscillator();
        bgMusicGain = audioCtx.createGain();
        bgMusicOsc.type = 'sine';
        bgMusicOsc.frequency.setValueAtTime(110, audioCtx.currentTime); // A2 ambient drone
        bgMusicGain.gain.setValueAtTime(0.05, audioCtx.currentTime);

        // Slow LFO for relaxation effect
        const lfo = audioCtx.createOscillator();
        const lfoGain = audioCtx.createGain();
        lfo.frequency.setValueAtTime(0.2, audioCtx.currentTime);
        lfoGain.gain.setValueAtTime(10, audioCtx.currentTime);
        lfo.connect(lfoGain);
        lfoGain.connect(bgMusicOsc.frequency);
        lfo.start();

        bgMusicOsc.connect(bgMusicGain);
        bgMusicGain.connect(audioCtx.destination);
        bgMusicOsc.start();
      } catch (e) {
        console.warn("Music synthesis error:", e);
      }
    } else if (bgMusicGain) {
      bgMusicGain.gain.linearRampToValueAtTime(0.05, audioCtx.currentTime + 0.5);
    }
  }

  // ==================== STORAGE SYSTEM ====================
  const STORAGE_KEY = 'arrow_flow_puzzle_save_v1';

  function loadProgress() {
    try {
      const dataStr = localStorage.getItem(STORAGE_KEY);
      if (dataStr) {
        const data = JSON.parse(dataStr);
        STATE.coins = typeof data.coins === 'number' ? data.coins : 100;
        STATE.unlockedLevel = typeof data.unlockedLevel === 'number' ? data.unlockedLevel : 1;
        STATE.levelStars = data.levelStars || {};
        STATE.levelBestMoves = data.levelBestMoves || {};

        if (data.settings) {
          STATE.settings = { ...STATE.settings, ...data.settings };
        }
        STATE.tutorialSeen = !!data.tutorialSeen;
      }
    } catch (e) {
      console.warn("Error loading localStorage progress:", e);
    }
  }

  function saveProgress() {
    try {
      const data = {
        coins: STATE.coins,
        unlockedLevel: STATE.unlockedLevel,
        levelStars: STATE.levelStars,
        levelBestMoves: STATE.levelBestMoves,
        settings: STATE.settings,
        tutorialSeen: STATE.tutorialSeen
      };
      localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    } catch (e) {
      console.warn("Error saving to localStorage:", e);
    }
  }

  // ==================== UI STATE MANAGEMENT ====================
  function setScreen(screenName) {
    STATE.screen = screenName;
    document.querySelectorAll('.screen').forEach(el => el.classList.remove('active'));
    const targetScreen = document.getElementById(`screen-${screenName.toLowerCase().replace('_', '-')}`);
    if (targetScreen) {
      targetScreen.classList.add('active');
    }
    updateHeaderUI();
    if (screenName === 'LEVEL_SELECT') {
      renderLevelSelectGrid();
    }
  }

  function updateHeaderUI() {
    const coinEl = document.getElementById('badge-coin-val');
    const levelEl = document.getElementById('badge-level-val');
    if (coinEl) coinEl.textContent = STATE.coins;
    if (levelEl) {
      if (STATE.screen === 'PLAYING') {
        levelEl.textContent = `Lvl ${STATE.currentLevelNum}`;
      } else {
        levelEl.textContent = `Lvl ${STATE.unlockedLevel}`;
      }
    }

    // Home screen stats summary
    const homeLevelEl = document.getElementById('home-stat-level');
    const homeStarsEl = document.getElementById('home-stat-stars');
    const homeCoinsEl = document.getElementById('home-stat-coins');

    if (homeLevelEl) homeLevelEl.textContent = `${STATE.unlockedLevel} / 100`;
    if (homeStarsEl) {
      const totalStars = Object.values(STATE.levelStars).reduce((acc, curr) => acc + curr, 0);
      homeStarsEl.textContent = `★ ${totalStars}`;
    }
    if (homeCoinsEl) homeCoinsEl.textContent = `🪙 ${STATE.coins}`;

    // Playing screen displays
    const gameLevelEl = document.getElementById('level-display');
    const gameCoinsEl = document.getElementById('game-coins-val');
    if (gameLevelEl) {
      gameLevelEl.textContent = String(STATE.currentLevelNum).padStart(2, '0');
    }
    if (gameCoinsEl) {
      gameCoinsEl.textContent = STATE.coins;
    }
  }

  function showToast(message, icon = '💡') {
    const container = document.getElementById('toast-container');
    if (!container) return;
    container.innerHTML = '';
    const toast = document.createElement('div');
    toast.className = 'toast';
    toast.innerHTML = `<span>${icon}</span><span>${message}</span>`;
    container.appendChild(toast);
    setTimeout(() => {
      if (toast.parentNode) toast.parentNode.removeChild(toast);
    }, 2600);
  }

  // ==================== GAME LOGIC & PATH VALIDATION ====================
  const DIR_VECTORS = {
    up: { dr: -1, dc: 0 },
    down: { dr: 1, dc: 0 },
    left: { dr: 0, dc: -1 },
    right: { dr: 0, dc: 1 }
  };

  /**
   * Scans grid path from arrow towards the edge.
   * Returns { blocked: true, blocker: arrow } if an active arrow blocks its path,
   * or { blocked: false } if path is completely clear.
   */
  function checkArrowBlocked(arrow, activeArrowsList, rows, cols) {
    const { dr, dc } = DIR_VECTORS[arrow.dir];
    let currR = arrow.r + dr;
    let currC = arrow.c + dc;

    while (currR >= 0 && currR < rows && currC >= 0 && currC < cols) {
      const blocker = activeArrowsList.find(a => a.id !== arrow.id && a.r === currR && a.c === currC);
      if (blocker) {
        return { blocked: true, blocker };
      }
      currR += dr;
      currC += dc;
    }

    return { blocked: false };
  }

  function loadLevel(levelNum) {
    STATE.currentLevelNum = levelNum;
    STATE.activeLevelData = getLevelData(levelNum);

    // Deep copy initial active arrows
    STATE.activeArrows = JSON.parse(JSON.stringify(STATE.activeLevelData.arrows));
    STATE.undoStack = [];
    STATE.moveCount = 0;
    STATE.isAnimating = false;

    renderBoard();
    updateGameTopBar();
    updateUndoButtonState();
    setScreen('PLAYING');

    // Show tutorial if first time playing level 1
    if (levelNum === 1 && !STATE.tutorialSeen) {
      showTutorialOverlay();
    }
  }

  function renderBoard() {
    const boardEl = document.getElementById('puzzle-board');
    if (!boardEl || !STATE.activeLevelData) return;

    const { rows, cols } = STATE.activeLevelData;

    boardEl.style.gridTemplateRows = `repeat(${rows}, 1fr)`;
    boardEl.style.gridTemplateColumns = `repeat(${cols}, 1fr)`;

    // Calculate tile dimensions to fit screen comfortably
    const boardContainer = document.querySelector('.board-container-wrapper');
    if (!boardContainer) return;

    const gap = 8;
    const boardPadding = 16;
    const totalPadding = boardPadding * 2; // 32px

    const containerWidth = Math.max(180, boardContainer.clientWidth - 16);
    const containerHeight = Math.max(180, boardContainer.clientHeight - 16);

    const availableW = containerWidth - (cols - 1) * gap - totalPadding;
    const availableH = containerHeight - (rows - 1) * gap - totalPadding;

    const cellSize = Math.max(26, Math.floor(Math.min(availableW / cols, availableH / rows)));

    const boardWidth = cellSize * cols + (cols - 1) * gap + totalPadding;
    const boardHeight = cellSize * rows + (rows - 1) * gap + totalPadding;

    boardEl.style.width = `${boardWidth}px`;
    boardEl.style.height = `${boardHeight}px`;

    boardEl.innerHTML = '';

    // Static grid cells
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const cell = document.createElement('div');
        cell.className = 'tile-cell';
        cell.dataset.r = r;
        cell.dataset.c = c;
        boardEl.appendChild(cell);
      }
    }

    // Active arrows
    STATE.activeArrows.forEach(arrow => {
      const arrowTile = createArrowElement(arrow, cellSize, gap, boardPadding);
      boardEl.appendChild(arrowTile);
    });
  }

  function createArrowElement(arrow, cellSize, gap = 8, boardPadding = 16) {
    const tile = document.createElement('div');
    tile.className = `arrow-tile dir-${arrow.dir} color-${arrow.color || 'cyan'}`;
    tile.id = `arrow-tile-${arrow.id}`;
    tile.style.width = `${cellSize}px`;
    tile.style.height = `${cellSize}px`;

    tile.setAttribute('tabindex', '0');
    tile.setAttribute('role', 'button');
    tile.setAttribute('aria-label', `Arrow pointing ${arrow.dir}`);

    // Position tile over grid cell
    const leftOffset = boardPadding + arrow.c * (cellSize + gap);
    const topOffset = boardPadding + arrow.r * (cellSize + gap);
    tile.style.left = `${leftOffset}px`;
    tile.style.top = `${topOffset}px`;

    // High-precision SVG Arrow graphic
    tile.innerHTML = `
      <svg class="arrow-svg" viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg">
        <path d="M50 12L82 46H62V88H38V46H18L50 12Z" fill="currentColor" stroke="rgba(255,255,255,0.4)" stroke-width="4" stroke-linejoin="round"/>
        <path d="M50 20L72 43H58V80H42V43H28L50 20Z" fill="rgba(255,255,255,0.25)"/>
      </svg>
    `;

    tile.addEventListener('focus', () => {
      STATE.keyboardSelectedArrowId = arrow.id;
      document.querySelectorAll('.arrow-tile').forEach(el => el.classList.remove('keyboard-focused'));
      tile.classList.add('keyboard-focused');
    });

    let handledByPointer = false;
    tile.addEventListener('pointerdown', (e) => {
      if (e.pointerType === 'mouse' && e.button !== 0) return;
      handledByPointer = true;
      e.preventDefault();
      handleArrowClick(arrow);
      setTimeout(() => { handledByPointer = false; }, 300);
    });

    tile.addEventListener('click', (e) => {
      if (handledByPointer) return;
      handleArrowClick(arrow);
    });

    return tile;
  }

  function handleArrowClick(arrow) {
    if (STATE.isAnimating || STATE.screen !== 'PLAYING') return;

    const { rows, cols } = STATE.activeLevelData;
    const checkResult = checkArrowBlocked(arrow, STATE.activeArrows, rows, cols);

    if (checkResult.blocked) {
      // Path is blocked! Play sound & trigger shake feedback
      playSound('blocked');
      const arrowEl = document.getElementById(`arrow-tile-${arrow.id}`);
      if (arrowEl) {
        arrowEl.classList.add('anim-shake');
        setTimeout(() => arrowEl.classList.remove('anim-shake'), 420);
      }
      // Briefly pulse the blocking arrow
      const blockerEl = document.getElementById(`arrow-tile-${checkResult.blocker.id}`);
      if (blockerEl) {
        blockerEl.classList.add('anim-nudge');
        setTimeout(() => blockerEl.classList.remove('anim-nudge'), 300);
      }
      showToast('Path blocked by another arrow!', '⚠️');
      return;
    }

    // Path is CLEAR! Execute arrow removal
    STATE.isAnimating = true;
    playSound('move');

    // Save state for undo
    STATE.undoStack.push(JSON.parse(JSON.stringify(STATE.activeArrows)));
    updateUndoButtonState();

    STATE.moveCount++;
    updateGameTopBar();

    const arrowEl = document.getElementById(`arrow-tile-${arrow.id}`);
    if (arrowEl) {
      // Remove any hint glow
      arrowEl.classList.remove('anim-hint');

      // Calculate translation off screen
      const { dr, dc } = DIR_VECTORS[arrow.dir];
      const flyDist = 600; // pixels
      const tx = dc * flyDist;
      const ty = dr * flyDist;

      arrowEl.style.transition = 'transform 0.32s cubic-bezier(0.4, 0, 0.2, 1), opacity 0.28s ease';
      arrowEl.style.transform = `translate(${tx}px, ${ty}px) scale(0.85)`;
      arrowEl.style.opacity = '0';

      // Nudge nearby adjacent tiles
      nudgeAdjacentTiles(arrow);

      setTimeout(() => {
        if (arrowEl.parentNode) {
          arrowEl.parentNode.removeChild(arrowEl);
        }
        // Remove from active list
        STATE.activeArrows = STATE.activeArrows.filter(a => a.id !== arrow.id);
        STATE.isAnimating = false;

        // Check level win condition
        if (STATE.activeArrows.length === 0) {
          handleLevelComplete();
        }
      }, 320);
    } else {
      STATE.activeArrows = STATE.activeArrows.filter(a => a.id !== arrow.id);
      STATE.isAnimating = false;
      if (STATE.activeArrows.length === 0) {
        handleLevelComplete();
      }
    }
  }

  function nudgeAdjacentTiles(removedArrow) {
    STATE.activeArrows.forEach(a => {
      if (a.id !== removedArrow.id && (a.r === removedArrow.r || a.c === removedArrow.c)) {
        const el = document.getElementById(`arrow-tile-${a.id}`);
        if (el) {
          el.classList.add('anim-nudge');
          setTimeout(() => el.classList.remove('anim-nudge'), 260);
        }
      }
    });
  }

  function updateGameTopBar() {
    const moveVal = document.getElementById('stat-moves');
    const targetVal = document.getElementById('stat-target');
    if (moveVal) moveVal.textContent = STATE.moveCount;
    if (targetVal) targetVal.textContent = STATE.activeLevelData ? STATE.activeLevelData.targetMoves : '-';
  }

  function updateUndoButtonState() {
    const undoBtn = document.getElementById('btn-undo');
    if (undoBtn) {
      undoBtn.disabled = STATE.undoStack.length === 0;
    }
  }

  // ==================== UNDO, RESTART, HINT ====================
  function executeUndo() {
    if (STATE.undoStack.length === 0 || STATE.isAnimating) return;
    playSound('click');
    STATE.activeArrows = STATE.undoStack.pop();
    if (STATE.moveCount > 0) STATE.moveCount--;
    renderBoard();
    updateGameTopBar();
    updateUndoButtonState();
    showToast('Move undone', '↩️');
  }

  function executeRestart() {
    if (STATE.isAnimating) return;
    playSound('click');
    STATE.activeArrows = JSON.parse(JSON.stringify(STATE.activeLevelData.arrows));
    STATE.undoStack = [];
    STATE.moveCount = 0;
    renderBoard();
    updateGameTopBar();
    updateUndoButtonState();
    showToast('Level restarted', '🔄');
  }

  function executeHint() {
    if (STATE.isAnimating || STATE.screen !== 'PLAYING') return;

    const HINT_COST = 15;
    if (STATE.coins < HINT_COST) {
      playSound('blocked');
      showToast(`Need ${HINT_COST} coins for a hint! Clear levels to earn coins.`, '🪙');
      return;
    }

    const { rows, cols } = STATE.activeLevelData;
    // Find unblocked arrow
    const validArrow = STATE.activeArrows.find(arrow => {
      const check = checkArrowBlocked(arrow, STATE.activeArrows, rows, cols);
      return !check.blocked;
    });

    if (validArrow) {
      STATE.coins -= HINT_COST;
      saveProgress();
      updateHeaderUI();
      playSound('hint');

      const el = document.getElementById(`arrow-tile-${validArrow.id}`);
      if (el) {
        el.classList.add('anim-hint');
        setTimeout(() => el.classList.remove('anim-hint'), 3000);
      }
      showToast('Hint: Try tapping the highlighted arrow!', '💡');
    } else {
      playSound('blocked');
      showToast('No clear path right now! Try using Undo or Restart.', '🔍');
    }
  }

  // ==================== LEVEL COMPLETE & REWARDS ====================
  function handleLevelComplete() {
    playSound('victory');
    triggerConfetti();

    // Calculate Star Rating
    const target = STATE.activeLevelData.targetMoves;
    let stars = 1;
    if (STATE.moveCount <= target) {
      stars = 3;
    } else if (STATE.moveCount <= Math.ceil(target * 1.4)) {
      stars = 2;
    }

    // Base Coins reward
    let coinsEarned = 15;
    if (stars === 3) coinsEarned += 10;
    if (stars === 2) coinsEarned += 5;

    // Save Stars & Unlocks
    const lvlNum = STATE.currentLevelNum;
    const prevStars = STATE.levelStars[lvlNum] || 0;
    if (stars > prevStars) {
      STATE.levelStars[lvlNum] = stars;
    }
    const prevBest = STATE.levelBestMoves[lvlNum];
    if (!prevBest || STATE.moveCount < prevBest) {
      STATE.levelBestMoves[lvlNum] = STATE.moveCount;
    }
    if (lvlNum === STATE.unlockedLevel && lvlNum < 100) {
      STATE.unlockedLevel = lvlNum + 1;
    }

    STATE.coins += coinsEarned;

    saveProgress();
    updateHeaderUI();

    // Render Victory Modal
    setTimeout(() => {
      showVictoryModal(stars, coinsEarned);
    }, 450);
  }

  function showVictoryModal(stars, coinsEarned) {
    const modal = document.getElementById('modal-victory');
    const titleEl = document.getElementById('victory-level-title');
    const movesEl = document.getElementById('victory-moves');
    const bestEl = document.getElementById('victory-best');
    const coinsEl = document.getElementById('victory-coins');

    if (titleEl) {
      titleEl.textContent = `Level ${STATE.currentLevelNum} Cleared!`;
    }
    if (movesEl) movesEl.textContent = STATE.moveCount;
    if (bestEl) bestEl.textContent = STATE.levelBestMoves[STATE.currentLevelNum] || STATE.moveCount;
    if (coinsEl) coinsEl.textContent = `+${coinsEarned}`;

    // Animate stars
    const starIcons = modal.querySelectorAll('.victory-star-icon');
    starIcons.forEach((star, idx) => {
      star.classList.remove('active');
      if (idx < stars) {
        setTimeout(() => {
          star.classList.add('active');
          playSound('click');
        }, 200 + idx * 220);
      }
    });

    const nextBtn = document.getElementById('btn-next-level');
    if (nextBtn) {
      const btnSpan = nextBtn.querySelector('span') || nextBtn;
      if (STATE.currentLevelNum < 100) {
        btnSpan.textContent = 'NEXT LEVEL';
      } else {
        btnSpan.textContent = 'LEVEL SELECT';
      }
    }

    modal.classList.add('active');
  }

  function hideVictoryModal() {
    const modal = document.getElementById('modal-victory');
    if (modal) modal.classList.remove('active');
  }

  // ==================== CONFETTI CELEBRATION ====================
  function triggerConfetti() {
    const canvas = document.getElementById('confetti-canvas');
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;

    const colors = ['#06b6d4', '#a855f7', '#f59e0b', '#10b981', '#ec4899'];
    const particles = [];

    for (let i = 0; i < 90; i++) {
      particles.push({
        x: canvas.width / 2,
        y: canvas.height / 2,
        vx: (Math.random() - 0.5) * 16,
        vy: (Math.random() - 0.8) * 16,
        size: Math.random() * 8 + 4,
        color: colors[Math.floor(Math.random() * colors.length)],
        rotation: Math.random() * 360,
        rSpeed: (Math.random() - 0.5) * 10,
        alpha: 1
      });
    }

    let startTime = performance.now();

    function renderConfetti(time) {
      const elapsed = time - startTime;
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      particles.forEach(p => {
        p.x += p.vx;
        p.y += p.vy;
        p.vy += 0.35; // gravity
        p.rotation += p.rSpeed;
        p.alpha -= 0.012;

        if (p.alpha > 0) {
          ctx.save();
          ctx.globalAlpha = Math.max(0, p.alpha);
          ctx.translate(p.x, p.y);
          ctx.rotate((p.rotation * Math.PI) / 180);
          ctx.fillStyle = p.color;
          ctx.fillRect(-p.size / 2, -p.size / 2, p.size, p.size);
          ctx.restore();
        }
      });

      if (elapsed < 2000) {
        requestAnimationFrame(renderConfetti);
      } else {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
      }
    }

    requestAnimationFrame(renderConfetti);
  }

  // ==================== LEVEL SELECT SCREEN ====================
  function renderLevelSelectGrid() {
    const grid = document.getElementById('levels-grid');
    if (!grid) return;

    grid.innerHTML = '';

    for (let i = 1; i <= 100; i++) {
      const isLocked = i > STATE.unlockedLevel;
      const stars = STATE.levelStars[i] || 0;

      const card = document.createElement('div');
      card.className = `level-card ${isLocked ? 'locked' : ''}`;

      if (isLocked) {
        card.innerHTML = `
          <div class="level-num">${i}</div>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect>
            <path d="M7 11V7a5 5 0 0 1 10 0v4"></path>
          </svg>
        `;
      } else {
        let starsHtml = '';
        for (let s = 1; s <= 3; s++) {
          starsHtml += `<span class="${s <= stars ? 'star-filled' : 'star-empty'}">★</span>`;
        }
        card.innerHTML = `
          <div class="level-num">${i}</div>
          <div class="level-stars">${starsHtml}</div>
        `;

        card.addEventListener('click', () => {
          playSound('click');
          loadLevel(i, false);
        });
      }

      grid.appendChild(card);
    }
  }

  // ==================== TUTORIAL OVERLAY ====================
  function showTutorialOverlay() {
    const container = document.getElementById('screen-playing');
    if (!container || document.querySelector('.tutorial-banner')) return;

    const banner = document.createElement('div');
    banner.className = 'tutorial-banner';
    banner.innerHTML = `
      <span>💡 Tap any arrow pointing to a clear edge to remove it!</span>
      <button id="btn-skip-tutorial" style="background:rgba(0,0,0,0.2); border:none; padding:4px 10px; border-radius:6px; font-weight:800; cursor:pointer;">Got it!</button>
    `;

    container.appendChild(banner);

    const skipBtn = banner.querySelector('#btn-skip-tutorial');
    if (skipBtn) {
      skipBtn.addEventListener('click', () => {
        STATE.tutorialSeen = true;
        saveProgress();
        if (banner.parentNode) banner.parentNode.removeChild(banner);
      });
    }
  }

  // ==================== SETTINGS & MODALS ====================
  function showCustomConfirm(options) {
    return new Promise((resolve) => {
      const modal = document.getElementById('modal-confirm');
      const titleEl = document.getElementById('modal-confirm-title');
      const msgEl = document.getElementById('modal-confirm-message');
      const okBtn = document.getElementById('modal-confirm-ok');
      const cancelBtn = document.getElementById('modal-confirm-cancel');

      if (!modal || !okBtn || !cancelBtn) {
        resolve(false);
        return;
      }

      if (titleEl) titleEl.textContent = options.title || 'Are you sure?';
      if (msgEl) msgEl.textContent = options.message || '';
      if (okBtn) okBtn.textContent = options.confirmText || 'Confirm';
      if (cancelBtn) cancelBtn.textContent = options.cancelText || 'Cancel';

      if (options.confirmStyle === 'danger') {
        okBtn.style.background = 'linear-gradient(135deg, #ef4444, #dc2626)';
        okBtn.style.borderColor = '#ef4444';
      } else {
        okBtn.style.background = 'linear-gradient(135deg, #0284c7, #0369a1)';
        okBtn.style.borderColor = '#38bdf8';
      }

      modal.classList.add('active');

      const cleanup = () => {
        modal.classList.remove('active');
        okBtn.removeEventListener('click', onOk);
        cancelBtn.removeEventListener('click', onCancel);
      };

      const onOk = () => {
        cleanup();
        playSound('click');
        resolve(true);
      };

      const onCancel = () => {
        cleanup();
        playSound('click');
        resolve(false);
      };

      okBtn.addEventListener('click', onOk);
      cancelBtn.addEventListener('click', onCancel);
    });
  }

  function bindSettingsUI() {
    const soundToggle = document.getElementById('setting-sound');
    const musicToggle = document.getElementById('setting-music');
    const vibeToggle = document.getElementById('setting-vibration');
    const resetBtn = document.getElementById('btn-reset-progress');

    if (soundToggle) {
      soundToggle.checked = STATE.settings.sound;
      soundToggle.addEventListener('change', (e) => {
        STATE.settings.sound = e.target.checked;
        saveProgress();
      });
    }

    if (musicToggle) {
      musicToggle.checked = STATE.settings.music;
      musicToggle.addEventListener('change', (e) => {
        STATE.settings.music = e.target.checked;
        updateMusicState();
        saveProgress();
      });
    }

    if (vibeToggle) {
      vibeToggle.checked = STATE.settings.vibration;
      vibeToggle.addEventListener('change', (e) => {
        STATE.settings.vibration = e.target.checked;
        saveProgress();
      });
    }

    if (resetBtn) {
      resetBtn.addEventListener('click', async () => {
        playSound('click');
        const confirmed = await showCustomConfirm({
          title: 'Reset All Progress?',
          message: 'This will erase all unlocked levels, earned stars, and coins back to level 1. Are you sure?',
          confirmText: 'Reset Progress',
          cancelText: 'Cancel',
          confirmStyle: 'danger'
        });
        if (confirmed) {
          localStorage.removeItem(STORAGE_KEY);
          STATE.unlockedLevel = 1;
          STATE.stars = 0;
          STATE.coins = 100;
          STATE.levelStars = {};
          STATE.levelBestMoves = {};
          STATE.dailyProgress = {};
          STATE.dailyStreak = 0;
          STATE.dailyCompletedDate = null;
          STATE.tutorialSeen = false;
          saveProgress();
          hideModal('modal-settings');
          updateHeaderUI();
          renderLevelSelectGrid();
          showToast('Progress reset successfully!', '🔄');
          if (STATE.screen === 'PLAYING') {
            loadLevel(1, false);
          }
        }
      });
    }
  }

  // ==================== KEYBOARD SHORTCUTS & DESKTOP NAVIGATION ====================
  function navigateKeyboardArrow(dir) {
    if (!STATE.activeArrows || STATE.activeArrows.length === 0) return;

    let current = STATE.activeArrows.find(a => a.id === STATE.keyboardSelectedArrowId);
    if (!current) {
      current = STATE.activeArrows[0];
      highlightKeyboardSelected(current);
      return;
    }

    let candidates = [];
    if (dir === 'up') {
      candidates = STATE.activeArrows.filter(a => a.r < current.r);
      candidates.sort((a, b) => (current.r - a.r) * 10 + Math.abs(a.c - current.c));
    } else if (dir === 'down') {
      candidates = STATE.activeArrows.filter(a => a.r > current.r);
      candidates.sort((a, b) => (a.r - current.r) * 10 + Math.abs(a.c - current.c));
    } else if (dir === 'left') {
      candidates = STATE.activeArrows.filter(a => a.c < current.c);
      candidates.sort((a, b) => (current.c - a.c) * 10 + Math.abs(a.r - current.r));
    } else if (dir === 'right') {
      candidates = STATE.activeArrows.filter(a => a.c > current.c);
      candidates.sort((a, b) => (a.c - current.c) * 10 + Math.abs(a.r - current.r));
    }

    if (candidates.length > 0) {
      highlightKeyboardSelected(candidates[0]);
    }
  }

  function highlightKeyboardSelected(arrow) {
    if (!arrow) return;
    STATE.keyboardSelectedArrowId = arrow.id;
    document.querySelectorAll('.arrow-tile').forEach(el => el.classList.remove('keyboard-focused'));
    const targetEl = document.getElementById(`arrow-tile-${arrow.id}`);
    if (targetEl) {
      targetEl.classList.add('keyboard-focused');
      targetEl.focus();
    }
  }

  function bindKeyboardEvents() {
    window.addEventListener('keydown', (e) => {
      // Don't capture when typing in inputs or textareas
      if (['INPUT', 'TEXTAREA', 'SELECT'].includes(e.target.tagName)) return;

      if (STATE.screen === 'PLAYING') {
        const key = e.key.toLowerCase();

        if (key === 'u' || (e.ctrlKey && key === 'z')) {
          e.preventDefault();
          executeUndo();
        } else if (key === 'r') {
          e.preventDefault();
          executeRestart();
        } else if (key === 'h') {
          e.preventDefault();
          executeHint();
        } else if (key === 'arrowup' || key === 'w') {
          e.preventDefault();
          navigateKeyboardArrow('up');
        } else if (key === 'arrowdown' || key === 's') {
          e.preventDefault();
          navigateKeyboardArrow('down');
        } else if (key === 'arrowleft' || key === 'a') {
          e.preventDefault();
          navigateKeyboardArrow('left');
        } else if (key === 'arrowright' || key === 'd') {
          e.preventDefault();
          navigateKeyboardArrow('right');
        } else if (key === ' ' || key === 'enter') {
          e.preventDefault();
          if (STATE.keyboardSelectedArrowId) {
            const arrow = STATE.activeArrows.find(a => a.id === STATE.keyboardSelectedArrowId);
            if (arrow) handleArrowClick(arrow);
          } else if (STATE.activeArrows.length > 0) {
            highlightKeyboardSelected(STATE.activeArrows[0]);
          }
        } else if (key === 'escape') {
          setScreen('HOME');
        }
      } else if (e.key === 'Escape') {
        hideVictoryModal();
        hideModal('modal-settings');
      } else if (e.key === 'Enter' && document.getElementById('modal-victory')?.classList.contains('active')) {
        document.getElementById('btn-next-level')?.click();
      }
    });
  }

  function showModal(id) {
    const el = document.getElementById(id);
    if (el) el.classList.add('active');
  }

  function hideModal(id) {
    const el = document.getElementById(id);
    if (el) el.classList.remove('active');
  }

  // ==================== INITIALIZATION & EVENT BINDING ====================
  function initApp() {
    loadProgress();
    bindSettingsUI();
    bindKeyboardEvents();

    // Global click listener to unlock Web Audio context on mobile
    window.addEventListener('pointerdown', () => {
      initAudio();
      if (STATE.settings.music) {
        updateMusicState();
      }
    }, { once: true });

    // Header buttons
    document.getElementById('btn-header-back')?.addEventListener('click', () => {
      playSound('click');
      setScreen('HOME');
    });

    document.getElementById('btn-header-settings')?.addEventListener('click', () => {
      playSound('click');
      showModal('modal-settings');
    });

    // Home buttons
    document.getElementById('btn-home-play')?.addEventListener('click', () => {
      playSound('click');
      loadLevel(STATE.unlockedLevel);
    });

    document.getElementById('btn-home-levels')?.addEventListener('click', () => {
      playSound('click');
      setScreen('LEVEL_SELECT');
    });

    // Playing Control buttons
    document.getElementById('btn-undo')?.addEventListener('click', executeUndo);
    document.getElementById('btn-restart')?.addEventListener('click', executeRestart);
    document.getElementById('btn-hint')?.addEventListener('click', executeHint);

    // Victory modal buttons
    document.getElementById('btn-next-level')?.addEventListener('click', () => {
      playSound('click');
      hideVictoryModal();
      if (STATE.currentLevelNum < 100) {
        loadLevel(STATE.currentLevelNum + 1);
      } else {
        setScreen('LEVEL_SELECT');
      }
    });

    document.getElementById('btn-replay-level')?.addEventListener('click', () => {
      playSound('click');
      hideVictoryModal();
      loadLevel(STATE.currentLevelNum);
    });

    document.getElementById('btn-victory-levels')?.addEventListener('click', () => {
      playSound('click');
      hideVictoryModal();
      setScreen('LEVEL_SELECT');
    });

    // Close buttons for modals
    document.querySelectorAll('.btn-close-modal').forEach(btn => {
      btn.addEventListener('click', (e) => {
        playSound('click');
        const modal = e.target.closest('.modal-overlay');
        if (modal) modal.classList.remove('active');
      });
    });

    // Window resize & orientation handlers for responsive board
    let resizeAnimationFrame = null;
    const handleResize = () => {
      if (resizeAnimationFrame) {
        cancelAnimationFrame(resizeAnimationFrame);
      }
      resizeAnimationFrame = requestAnimationFrame(() => {
        if (STATE.screen === 'PLAYING') {
          renderBoard();
        }
      });
    };

    window.addEventListener('resize', handleResize);
    window.addEventListener('orientationchange', () => {
      setTimeout(handleResize, 100);
      setTimeout(handleResize, 300);
    });

    if (window.ResizeObserver) {
      const ro = new ResizeObserver(() => {
        handleResize();
      });
      const boardContainer = document.querySelector('.board-container-wrapper');
      if (boardContainer) {
        ro.observe(boardContainer);
      }
    }

    // Suppress benign browser ResizeObserver loop notification warnings
    window.addEventListener('error', (e) => {
      if (e.message && e.message.includes('ResizeObserver loop')) {
        e.stopImmediatePropagation();
        e.preventDefault();
      }
    });

    // Set initial screen
    setScreen('HOME');
  }

  document.addEventListener('DOMContentLoaded', initApp);
})();
