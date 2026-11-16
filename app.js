(function () {
  let currentStudents = [];
  let N = 0;
  let comparisons = 0;
  let maxComparisons = 0;
  let currentPool = [];
  let selected = [];

  let phase1End = 0, phase2End = 0, phase3aEnd = 0, phase3bEnd = 0, verificationStart = 0; 
  let currentIsBoundaryDuel = false;
  let currentRankMap = new Map();

  let directWins = [];    
  let fixedOrder = [];    
  let playedPairsMap = new Map();

  const recentWinnerPairs = [];
  const MAX_PAIR_MEMORY = 6;
  const GENERAL_CUTOFF_CYCLE = [4, 2, 6, 1, 5, 3, 7, 0];
  const DUEL_CUTOFF_CYCLE = [6, 7, 5, 0, 1, 6, 7, 2, 3, 4];
  let cycleIndex = 0;

  let settings = { includeVariant: false, includeUnreleased: false, serverJp: false };
  const RATIOS = [0.04, 0.11, 0.23, 0.40, 0.60, 0.77, 0.89, 0.96];
  let cutoffs = [];
  let gradeBounds = [];

  const comparisonTextEl = document.getElementById("comparisonText");
  const progressTextEl = document.getElementById("progressText");
  const progressFillEl = document.getElementById("progressFill");
  const progressPercentTextEl = document.getElementById("progressPercentText");
  const phaseTitleEl = document.getElementById("phaseTitle");
  const poolSizeTagEl = document.getElementById("poolSizeTag");
  const choiceGridEl = document.getElementById("choiceGrid");
  const btnSubmitEl = document.getElementById("btnSubmit");
  const questionSection = document.getElementById("questionSection");
  const resultSection = document.getElementById("resultSection");
  const captureAreaEl = document.getElementById("captureArea"); 

  const settingsModal = document.getElementById("settingsModal");
  const btnOpenSettings = document.getElementById("btnOpenSettings");
  const btnCloseSettings = document.getElementById("btnCloseSettings"); 
  const btnStart = document.getElementById("btnStart");
  const btnDownloadImg = document.getElementById("btnDownloadImg");
  const btnDownloadImgLarge = document.getElementById("btnDownloadImgLarge");
  
  const optVariant = document.getElementById("optVariant");
  const optUnreleased = document.getElementById("optUnreleased");
  const optServerJp = document.getElementById("optServerJp");
  const previewCountEl = document.getElementById("previewCount");
  const previewMaxCompEl = document.getElementById("previewMaxComp");

  // [신규] 세이브/로드 관련 요소
  const saveLoadModal = document.getElementById("saveLoadModal");
  const btnOpenSaveLoad = document.getElementById("btnOpenSaveLoad");
  const btnCloseSaveLoad = document.getElementById("btnCloseSaveLoad");
  const autoSaveStatusText = document.getElementById("autoSaveStatusText");
  const btnResumeAutoSave = document.getElementById("btnResumeAutoSave");
  const btnExportCode = document.getElementById("btnExportCode");
  const btnImportCode = document.getElementById("btnImportCode");
  const inputSaveCode = document.getElementById("inputSaveCode");
  const SAVE_KEY = "baTierSorterSave";

  function calculateAutoComparisons(studentCount) {
    if (studentCount <= 2) return 1;
    return Math.max(15, Math.round(0.76 * studentCount) + 4);
  }

  function getFilteredStudents(opts) {
    return STUDENTS_DATA.filter((s) => {
      if (!opts.includeVariant && s.isVariant) return false;
      if (opts.serverJp) return opts.includeUnreleased ? true : s.isPlayableJp;
      else return opts.includeUnreleased ? s.isAppearedKr : s.isPlayable;
    });
  }

  function updateModalPreview() {
    const tempOpts = { includeVariant: optVariant.checked, includeUnreleased: optUnreleased.checked, serverJp: optServerJp.checked };
    const filtered = getFilteredStudents(tempOpts);
    previewCountEl.innerText = filtered.length;
    previewMaxCompEl.innerText = calculateAutoComparisons(filtered.length);
  }

  function updateProgressUI(current, max) {
    const progressPercent = Math.min(100, Math.round((current / max) * 100));
    progressTextEl.innerText = `${progressPercent}%`;
    comparisonTextEl.innerText = `${current} / ${max}회`;
    progressFillEl.style.width = `${progressPercent}%`;
    progressPercentTextEl.innerText = `${progressPercent}%`;
  }

  // [신규] 데이터 저장 로직 (상태 압축)
  function exportStateData() {
    if (comparisons === 0 || comparisons >= maxComparisons) return null; // 시작 전이거나 끝나면 저장 불가
    const state = {
      opt: settings,
      c: comparisons,
      mc: maxComparisons,
      ci: cycleIndex,
      ibd: currentIsBoundaryDuel,
      cp: currentPool.map(s => s.numericId),
      st: currentStudents.map(s => [s.selectionCount, s.appearCount, s.anchorCount, s.score.toFixed(4), s.localBonus.toFixed(4), s.lastSeenTurn]),
      dw: [],
      rw: recentWinnerPairs.map(set => Array.from(set))
    };
    for(let u=0; u<N; u++) {
      for(let v=0; v<N; v++) {
        if(directWins[u][v] > 0) state.dw.push([u,v,directWins[u][v]]);
      }
    }
    // JSON 변환 후 Base64 인코딩으로 복사 가능한 텍스트 코드 생성
    return btoa(encodeURIComponent(JSON.stringify(state)));
  }

  // [신규] 데이터 불러오기 로직
  function importStateData(codeStr) {
    try {
      const state = JSON.parse(decodeURIComponent(atob(codeStr)));
      settings = state.opt;
      
      // 모달 체크박스 동기화
      optVariant.checked = settings.includeVariant;
      optUnreleased.checked = settings.includeUnreleased;
      optServerJp.checked = settings.serverJp;
      updateModalPreview();

      const baseData = getFilteredStudents(settings);
      N = baseData.length;
      maxComparisons = state.mc;
      comparisons = state.c;
      cycleIndex = state.ci;
      currentIsBoundaryDuel = state.ibd;

      cutoffs = RATIOS.map(r => Math.max(1, Math.round(N * r)));
      const activeTurns = maxComparisons - 1; 
      verificationStart = activeTurns - (N >= 20 ? 3 : 0);
      phase1End = Math.round(activeTurns * 0.30);
      phase2End = phase1End + Math.round(activeTurns * 0.28);
      const p3Turns = verificationStart - phase2End;
      phase3aEnd = phase2End + Math.round(p3Turns * 0.34);
      phase3bEnd = phase3aEnd + Math.round(p3Turns * 0.35);

      gradeBounds = [
        { grade: 1, min: 1, max: cutoffs[0] }, { grade: 2, min: cutoffs[0] + 1, max: cutoffs[1] },
        { grade: 3, min: cutoffs[1] + 1, max: cutoffs[2] }, { grade: 4, min: cutoffs[2] + 1, max: cutoffs[3] },
        { grade: 5, min: cutoffs[3] + 1, max: cutoffs[4] }, { grade: 6, min: cutoffs[4] + 1, max: cutoffs[5] },
        { grade: 7, min: cutoffs[5] + 1, max: cutoffs[6] }, { grade: 8, min: cutoffs[6] + 1, max: cutoffs[7] },
        { grade: 9, min: cutoffs[7] + 1, max: N }
      ];

      currentStudents = baseData.map((s, idx) => ({
        ...s, numericId: idx,
        selectionCount: state.st[idx][0], appearCount: state.st[idx][1], anchorCount: state.st[idx][2],
        score: parseFloat(state.st[idx][3]), localBonus: parseFloat(state.st[idx][4]), lastSeenTurn: state.st[idx][5]
      }));

      directWins = Array.from({ length: N }, () => new Uint8Array(N));
      fixedOrder = Array.from({ length: N }, () => new Uint8Array(N));
      playedPairsMap.clear();

      state.dw.forEach(([u, v, wins]) => {
        directWins[u][v] = wins;
        const minId = Math.min(u, v), maxId = Math.max(u, v);
        playedPairsMap.set(`${minId}_${maxId}`, { u: minId, v: maxId });
        if (wins >= 2) addFixedOrder(u, v);
      });

      recentWinnerPairs.length = 0;
      state.rw.forEach(arr => recentWinnerPairs.push(new Set(arr)));

      currentPool = state.cp.map(id => currentStudents[id]);
      selected = [];

      updateProgressUI(comparisons, maxComparisons);
      resultSection.classList.remove("active");
      captureAreaEl.innerHTML = ""; 
      questionSection.style.display = "flex";
      
      // 불러온 후보 풀을 화면에 즉시 렌더링
      const k = currentPool.length;
      setGridColumns(k);
      phaseTitleEl.innerText = k === 2 ? "더 선호하는 학생 1명을 선택해주세요." : "선호하는 학생 2명을 순서대로 선택해주세요.";
      poolSizeTagEl.innerText = k === 2 && comparisons >= maxComparisons - 1 ? "최종 결승" : `후보 ${k}명`;
      renderChoices(currentPool, k === 2);

      saveLoadModal.classList.add("hidden");
      alert("데이터를 성공적으로 불러왔습니다!");
      return true;
    } catch(e) {
      console.error(e);
      alert("유효하지 않거나 손상된 세이브 코드입니다.");
      return false;
    }
  }

  function initSession() {
    settings.includeVariant = optVariant.checked;
    settings.includeUnreleased = optUnreleased.checked;
    settings.serverJp = optServerJp.checked;

    const baseData = getFilteredStudents(settings);
    N = baseData.length;
    maxComparisons = calculateAutoComparisons(N);
    cutoffs = RATIOS.map((r) => Math.max(1, Math.round(N * r)));
    
    // ... (중간 변수 초기화 기존 동일) ...
    gradeBounds = [
      { grade: 1, min: 1, max: cutoffs[0] }, { grade: 2, min: cutoffs[0] + 1, max: cutoffs[1] },
      { grade: 3, min: cutoffs[1] + 1, max: cutoffs[2] }, { grade: 4, min: cutoffs[2] + 1, max: cutoffs[3] },
      { grade: 5, min: cutoffs[3] + 1, max: cutoffs[4] }, { grade: 6, min: cutoffs[4] + 1, max: cutoffs[5] },
      { grade: 7, min: cutoffs[5] + 1, max: cutoffs[6] }, { grade: 8, min: cutoffs[6] + 1, max: cutoffs[7] },
      { grade: 9, min: cutoffs[7] + 1, max: N }
    ];

    currentStudents = baseData.map((s, idx) => ({
      ...s, numericId: idx, selectionCount: 0, appearCount: 0, anchorCount: 0, score: 0.0, localBonus: 0.0, lastSeenTurn: -999
    }));
    directWins = Array.from({ length: N }, () => new Uint8Array(N));
    fixedOrder = Array.from({ length: N }, () => new Uint8Array(N));
    playedPairsMap.clear();
    recentWinnerPairs.length = 0;

    const activeTurns = maxComparisons - 1; 
    verificationStart = activeTurns - (N >= 20 ? 3 : 0);
    phase1End = Math.round(activeTurns * 0.30);
    phase2End = phase1End + Math.round(activeTurns * 0.28);
    const p3Turns = verificationStart - phase2End;
    phase3aEnd = phase2End + Math.round(p3Turns * 0.34);
    phase3bEnd = phase3aEnd + Math.round(p3Turns * 0.35);

    comparisons = 0; cycleIndex = 0;
    updateProgressUI(0, maxComparisons);
    resultSection.classList.remove("active");
    captureAreaEl.innerHTML = ""; 
    questionSection.style.display = "flex";
    settingsModal.classList.add("hidden");

    localStorage.removeItem(SAVE_KEY); // 새로 시작하면 기존 세이브 삭제
    nextQuestion();
  }

  function addFixedOrder(u, v) {
    if (u === v || fixedOrder[u][v] || fixedOrder[v][u]) return;
    fixedOrder[u][v] = 1;
    for (let a = 0; a < N; a++) {
      if (fixedOrder[a][u]) {
        if (!fixedOrder[v][a]) fixedOrder[a][v] = 1;
        for (let b = 0; b < N; b++) if (fixedOrder[v][b] && !fixedOrder[b][a]) fixedOrder[a][b] = 1;
      }
    }
    for (let b = 0; b < N; b++) if (fixedOrder[v][b] && !fixedOrder[b][u]) fixedOrder[u][b] = 1;
  }

  function updateBradleyTerryScores() {
    if (playedPairsMap.size === 0) return;
    const grad = new Float64Array(N);
    for (let iter = 0; iter < 12; iter++) {
      for (let i = 0; i < N; i++) grad[i] = -0.08 * currentStudents[i].score;
      for (const pair of playedPairsMap.values()) {
        const u = pair.u, v = pair.v;
        const total = directWins[u][v] + directWins[v][u];
        if (total === 0) continue;
        let diff = currentStudents[u].score - currentStudents[v].score;
        if (diff > 10) diff = 10; else if (diff < -10) diff = -10;
        const pU = 1.0 / (1.0 + Math.exp(-diff));
        const delta = directWins[u][v] - total * pU;
        grad[u] += delta; grad[v] -= delta;
      }
      for (let i = 0; i < N; i++) currentStudents[i].score += 0.25 * grad[i];
    }
  }

  function getEffectiveScore(student) {
    return student.score + student.localBonus + (student.selectionCount > 0 ? 0.0 : -0.85);
  }

  function getCurrentRanking() {
    updateBradleyTerryScores();
    const inDegree = new Int32Array(N);
    const adj = Array.from({ length: N }, () => []);
    for (let u = 0; u < N; u++) {
      for (let v = 0; v < N; v++) { if (fixedOrder[u][v]) { adj[u].push(v); inDegree[v]++; } }
    }
    const available = [];
    for (let i = 0; i < N; i++) if (inDegree[i] === 0) available.push(i);

    available.sort((idA, idB) => {
      const a = currentStudents[idA], b = currentStudents[idB];
      const effA = getEffectiveScore(a), effB = getEffectiveScore(b);
      if (Math.abs(effB - effA) > 1e-6) return effB - effA;
      if (b.selectionCount !== a.selectionCount) return b.selectionCount - a.selectionCount;
      return a.appearCount - b.appearCount;
    });

    const ranking = [];
    while (available.length > 0) {
      const u = available.shift();
      ranking.push(u);
      for (const v of adj[u]) {
        inDegree[v]--;
        if (inDegree[v] === 0) {
          available.push(v);
          available.sort((idA, idB) => getEffectiveScore(currentStudents[idB]) - getEffectiveScore(currentStudents[idA]));
        }
      }
    }
    return ranking;
  }

  function setGridColumns(k) {
    choiceGridEl.className = "choice-grid";
    if (k === 10) choiceGridEl.classList.add("grid-cols-5");
    else if (k === 8) choiceGridEl.classList.add("grid-cols-4");
    else if (k === 6) choiceGridEl.classList.add("grid-cols-3");
    else choiceGridEl.classList.add("grid-cols-2");
    if (k === 2) choiceGridEl.classList.add("is-duel");
  }

  function nextQuestion() {
    selected = []; currentIsBoundaryDuel = false;
    const ranking = getCurrentRanking();
    currentRankMap.clear(); ranking.forEach((id, idx) => currentRankMap.set(id, idx));

    if (comparisons >= maxComparisons - 1) {
      currentPool = [currentStudents[ranking[0]], currentStudents[ranking[1]]];
      setGridColumns(2);
      phaseTitleEl.innerText = "가장 선호하는 1위(최애) 학생을 선택해주세요!";
      poolSizeTagEl.innerText = "최종 결승";
    }
    else if (comparisons >= verificationStart) {
      const k = 4; setGridColumns(k);
      const lo = Math.max(0, cutoffs[0] - 3), hi = Math.min(N, cutoffs[0] + 3);
      const band = ranking.slice(lo, hi).sort((a, b) => (comparisons - currentStudents[a].lastSeenTurn < 2 ? 1 : 0) - (comparisons - currentStudents[b].lastSeenTurn < 2 ? 1 : 0) || Math.random() - 0.5);
      currentPool = band.slice(0, k).map(id => currentStudents[id]);
      phaseTitleEl.innerText = "선호하는 학생 2명을 순서대로 선택해주세요.";
      poolSizeTagEl.innerText = "승강전";
    }
    else if (comparisons < phase1End) {
      const k = Math.min(10, N); setGridColumns(k);
      const winnerPool = currentStudents.filter((s) => s.selectionCount > 0);
      let eligibleWinners = winnerPool.filter((s) => comparisons - s.lastSeenTurn > 2);
      if (eligibleWinners.length === 0) eligibleWinners = winnerPool.filter((s) => comparisons - s.lastSeenTurn > 1);
      const anchorIds = [];
      if (eligibleWinners.length > 0) {
        eligibleWinners.sort((a, b) => a.anchorCount - b.anchorCount || a.appearCount - b.appearCount || Math.random() - 0.5);
        eligibleWinners[0].anchorCount++;
        anchorIds.push(eligibleWinners[0].numericId);
      }
      const others = currentStudents.filter((s) => !anchorIds.includes(s.numericId)).sort((a, b) => a.appearCount - b.appearCount || (comparisons - a.lastSeenTurn <= 1 ? 1 : 0) - (comparisons - b.lastSeenTurn <= 1 ? 1 : 0) || Math.random() - 0.5);
      currentPool = [...anchorIds, ...others.slice(0, k - anchorIds.length).map(s => s.numericId)].map(id => currentStudents[id]);
      phaseTitleEl.innerText = "선호하는 학생 2명을 순서대로 선택해주세요.";
      poolSizeTagEl.innerText = `후보 ${k}명`;
    }
    else if (comparisons < phase2End) {
      const k = Math.min(8, N); setGridColumns(k);
      let poolIds = [];
      if (comparisons % 2 === 1) {
        let bottomPool = ranking.filter(id => currentStudents[id].selectionCount === 0);
        if (bottomPool.length < 6) bottomPool = ranking.slice(cutoffs[4]);
        bottomPool.sort((a, b) => (comparisons - currentStudents[a].lastSeenTurn < 3 ? 1 : 0) - (comparisons - currentStudents[b].lastSeenTurn < 3 ? 1 : 0) || currentStudents[a].appearCount - currentStudents[b].appearCount || Math.random() - 0.5);
        poolIds = Array.from(new Set([...bottomPool.slice(0, 6), ranking[Math.max(0, cutoffs[4] - 5)], ranking[N - 1]]));
        if (poolIds.length < k) for (let i = N - 1; i >= 0 && poolIds.length < k; i--) if (!poolIds.includes(ranking[i])) poolIds.push(ranking[i]);
      } else {
        const cRank = cutoffs[GENERAL_CUTOFF_CYCLE[cycleIndex++ % GENERAL_CUTOFF_CYCLE.length]];
        const start = Math.max(2, cRank - 3), end = Math.min(N - 2, start + 6);
        poolIds = Array.from(new Set([...ranking.slice(start, end), ranking[Math.max(0, start - 6)], ranking[Math.min(N - 1, end + 6)]]));
        if (poolIds.length < k) for (let i = Math.max(0, start - 8); i < N && poolIds.length < k; i++) if (!poolIds.includes(ranking[i])) poolIds.push(ranking[i]);
      }
      currentPool = poolIds.slice(0, k).map(id => currentStudents[id]);
      phaseTitleEl.innerText = "선호하는 학생 2명을 순서대로 선택해주세요.";
      poolSizeTagEl.innerText = `후보 ${k}명`;
    }
    else {
      let k = comparisons >= phase3bEnd ? 2 : (comparisons >= phase3aEnd ? 4 : 6);
      k = Math.min(k, N); setGridColumns(k);
      const cIdx = (k === 2 ? DUEL_CUTOFF_CYCLE : GENERAL_CUTOFF_CYCLE)[cycleIndex++ % (k === 2 ? DUEL_CUTOFF_CYCLE : GENERAL_CUTOFF_CYCLE).length];
      if (k === 2) currentIsBoundaryDuel = true;
      let lo = Math.max(0, cutoffs[cIdx] - (k + 2)), hi = Math.min(N, cutoffs[cIdx] + (k + 2));
      if (cIdx >= 5 && N > k) lo = Math.max(Math.min(cutoffs[4], N - k), lo);
      const band = ranking.slice(lo, hi).sort((a, b) => (comparisons - currentStudents[a].lastSeenTurn < 3 ? 1 : 0) - (comparisons - currentStudents[b].lastSeenTurn < 3 ? 1 : 0) || currentStudents[a].appearCount - currentStudents[b].appearCount || Math.random() - 0.5);
      const chosenIds = [];
      for (const candId of band) {
        if (!chosenIds.some(o => fixedOrder[candId][o] || fixedOrder[o][candId]) && !chosenIds.some(o => recentWinnerPairs.some(p => p.has(candId) && p.has(o)))) {
          chosenIds.push(candId); if (chosenIds.length === k) break;
        }
      }
      if (chosenIds.length < k) {
        for (const candId of band) {
          if (!chosenIds.includes(candId)) { chosenIds.push(candId); if (chosenIds.length === k) break; }
        }
      }
      currentPool = chosenIds.slice(0, k).map(id => currentStudents[id]);
      phaseTitleEl.innerText = k === 2 ? "더 선호하는 학생 1명을 선택해주세요." : "선호하는 학생 2명을 순서대로 선택해주세요.";
      poolSizeTagEl.innerText = `후보 ${k}명`;
    }

    currentPool.forEach(s => { s.appearCount++; s.lastSeenTurn = comparisons; });
    renderChoices(currentPool, currentPool.length === 2);
    
    // [신규] 다음 질문이 준비되면 브라우저에 자동 저장
    const code = exportStateData();
    if(code) localStorage.setItem(SAVE_KEY, code);
  }

  function renderChoices(pool, isDuel) {
    choiceGridEl.innerHTML = "";
    pool.forEach((s) => {
      const card = document.createElement("div");
      card.className = "choice-card";
      card.dataset.id = s.numericId;
      card.innerHTML = `
        <div class="avatar-box"><img src="${s.image}" alt="${s.name}" onerror="this.onerror=null; this.parentElement.style.background='#dce5ef';"></div>
        <div class="name-tag">${s.name}</div><div class="choice-badge"></div>
      `;
      card.addEventListener("click", () => handleCardClick(s.numericId, isDuel));
      choiceGridEl.appendChild(card);
    });
  }

  function handleCardClick(numericId, isDuel) {
    if (isDuel) selected = [numericId];
    else {
      const idx = selected.indexOf(numericId);
      if (idx !== -1) selected.splice(idx, 1);
      else { if (selected.length < 2) selected.push(numericId); else selected[1] = numericId; }
    }
    document.querySelectorAll(".choice-card").forEach((card) => {
      card.classList.remove("pick-1", "pick-2");
      const badge = card.querySelector(".choice-badge");
      const cId = parseInt(card.dataset.id, 10);
      if (selected[0] === cId) { card.classList.add("pick-1"); badge.innerText = isDuel ? "선택" : "1위"; } 
      else if (selected[1] === cId) { card.classList.add("pick-2"); badge.innerText = "2위"; }
    });
  }

  btnSubmitEl.addEventListener("click", () => {
    const isDuel = currentPool.length === 2;
    if (isDuel && selected.length < 1) { alert("학생을 1명 선택해주세요."); return; }
    if (!isDuel && selected.length < 2) { alert("1위와 2위를 모두 선택해주세요."); return; }

    const isGrandFinal = comparisons >= maxComparisons - 1;
    comparisons++; updateProgressUI(comparisons, maxComparisons);

    const top1Id = selected[0];
    const top2Id = isDuel ? currentPool.find(s => s.numericId !== top1Id).numericId : selected[1];
    const losers = currentPool.map(s => s.numericId).filter(id => id !== top1Id && id !== top2Id);

    currentStudents[top1Id].selectionCount++;
    if (!isDuel) {
      currentStudents[top2Id].selectionCount++;
      recentWinnerPairs.unshift(new Set([top1Id, top2Id]));
      if (recentWinnerPairs.length > MAX_PAIR_MEMORY) recentWinnerPairs.pop();
    }

    if (currentIsBoundaryDuel && !isGrandFinal) {
      addFixedOrder(top1Id, top2Id);
      const prevWinner = currentRankMap.get(top1Id), prevLoser = currentRankMap.get(top2Id);
      if (prevWinner > prevLoser) {
        updateBradleyTerryScores();
        const effW = getEffectiveScore(currentStudents[top1Id]), effL = getEffectiveScore(currentStudents[top2Id]);
        if (effW <= effL) currentStudents[top1Id].localBonus += (effL - effW) + 0.15;
      }
    }

    function recordWin(wId, lId) {
      directWins[wId][lId]++;
      const minId = Math.min(wId, lId), maxId = Math.max(wId, lId);
      playedPairsMap.set(`${minId}_${maxId}`, { u: minId, v: maxId });
      if (directWins[wId][lId] >= 2) addFixedOrder(wId, lId);
    }
    recordWin(top1Id, top2Id);
    for (const lId of losers) { recordWin(top1Id, lId); if (!isDuel) recordWin(top2Id, lId); }

    if (isGrandFinal || comparisons >= maxComparisons) {
      addFixedOrder(top1Id, top2Id);
      localStorage.removeItem(SAVE_KEY); // 결과가 나오면 자동 저장 삭제
      finalizeClassification(top1Id, top2Id);
    } else {
      nextQuestion();
    }
  });

  function renderHeroPodium(abs1, abs2) {
    const podium = document.createElement("div");
    podium.className = "hero-podium";
    podium.innerHTML = `
      <div class="hero-card rank-1">
        <div class="hero-rank-label">최애 (1위)</div>
        <div class="avatar-box"><img src="${abs1.image}" alt="${abs1.name}" onerror="this.onerror=null; this.parentElement.style.background='#dce5ef';"></div>
        <div class="hero-name">${abs1.name}</div>
      </div>
      <div class="hero-card rank-2">
        <div class="hero-rank-label">차애 (2위)</div>
        <div class="avatar-box"><img src="${abs2.image}" alt="${abs2.name}" onerror="this.onerror=null; this.parentElement.style.background='#dce5ef';"></div>
        <div class="hero-name">${abs2.name}</div>
      </div>
    `;
    captureAreaEl.appendChild(podium);
  }

  function finalizeClassification(abs1Id, abs2Id) {
    questionSection.style.display = "none";
    resultSection.classList.add("active");
    updateProgressUI(maxComparisons, maxComparisons);
    const finalOrderIds = getCurrentRanking();
    const abs1 = currentStudents[abs1Id], abs2 = currentStudents[abs2Id];
    renderHeroPodium(abs1, abs2);
    const remaining = finalOrderIds.filter(id => id !== abs1Id && id !== abs2Id).map(id => currentStudents[id]);
    const finalRanked = [abs1, abs2, ...remaining];
    let rankOffset = 0;
    gradeBounds.forEach((bound) => {
      const count = bound.max - bound.min + 1;
      const group = finalRanked.slice(rankOffset, rankOffset + count);
      rankOffset += count;
      renderTierBox(bound.grade, group, abs1Id, abs2Id);
    });
  }

  function renderTierBox(grade, group, abs1Id, abs2Id) {
    const tierBox = document.createElement("div");
    tierBox.className = "grade-tier-box";
    tierBox.innerHTML = `
      <div class="grade-tier-title"><span class="hud-tag">${grade}등급</span><span>${group.length}명</span></div>
      <div class="grade-slot-list">
        ${group.map((s, idx) => `
          <div class="result-slot" title="${s.name}">
            <img src="${s.image}" alt="${s.name}" onerror="this.onerror=null; this.parentElement.style.background='#dce5ef';">
            ${grade === 1 ? `<span class="order-num">${s.numericId === abs1Id ? "1위" : s.numericId === abs2Id ? "2위" : `${idx + 1}위`}</span>` : ''}
          </div>
        `).join("")}
      </div>
    `;
    captureAreaEl.appendChild(tierBox);
  }

  function downloadImage(isLargeMode, buttonEl) {
    const btnText = buttonEl.querySelector('.btn-text');
    const originalText = btnText.innerText;
    btnText.innerText = "저장 준비 중...";
    buttonEl.disabled = true;

    const originalStyle = captureAreaEl.getAttribute('style');
    const originalClass = captureAreaEl.className;

    if (isLargeMode) captureAreaEl.className = 'capture-container capture-large-icons';
    else captureAreaEl.className = 'capture-container';
    
    captureAreaEl.style.width = '1080px';
    captureAreaEl.style.minWidth = '1080px';
    captureAreaEl.style.maxWidth = '1080px';
    captureAreaEl.style.position = 'relative';

    void captureAreaEl.offsetWidth; 

    setTimeout(() => {
      htmlToImage.toJpeg(captureAreaEl, {
        quality: 0.90,               
        pixelRatio: 2,               
        backgroundColor: '#42b6fc',  
        canvasWidth: 2160,           
        canvasHeight: captureAreaEl.scrollHeight * 2,
        style: {
          transform: 'scale(1)', transformOrigin: 'top left',
          width: '1080px', minWidth: '1080px', margin: '0', padding: '10px'
        }
      })
      .then(function (dataUrl) {
        const link = document.createElement('a');
        link.download = `BA_Tier_List_${isLargeMode ? "Large" : "Standard"}_${new Date().getTime()}.jpg`;
        link.href = dataUrl; link.click();
        
        captureAreaEl.className = originalClass;
        if (originalStyle) captureAreaEl.setAttribute('style', originalStyle); else captureAreaEl.removeAttribute('style');
        btnText.innerText = originalText; buttonEl.disabled = false;
      }).catch(function (error) {
        alert("이미지 저장에 실패했습니다.");
        captureAreaEl.className = originalClass;
        if (originalStyle) captureAreaEl.setAttribute('style', originalStyle); else captureAreaEl.removeAttribute('style');
        btnText.innerText = originalText; buttonEl.disabled = false;
      });
    }, 1000);
  }

  btnDownloadImg.addEventListener("click", () => downloadImage(false, btnDownloadImg));
  btnDownloadImgLarge.addEventListener("click", () => downloadImage(true, btnDownloadImgLarge));

  // 설정 모달
  btnOpenSettings.addEventListener("click", () => { settingsModal.classList.remove("hidden"); updateModalPreview(); });
  btnCloseSettings.addEventListener("click", () => settingsModal.classList.add("hidden"));
  [optVariant, optUnreleased, optServerJp].forEach(el => el.addEventListener("change", updateModalPreview));
  btnStart.addEventListener("click", initSession);

  // 세이브/로드 모달 제어
  btnOpenSaveLoad.addEventListener("click", () => {
    // 저장된 데이터가 있는지 확인
    const savedData = localStorage.getItem(SAVE_KEY);
    if (savedData) {
      try {
        const state = JSON.parse(decodeURIComponent(atob(savedData)));
        const percent = Math.min(100, Math.round((state.c / state.mc) * 100));
        autoSaveStatusText.innerHTML = `브라우저 자동 저장 데이터: <strong style="color:var(--ba-blue-dark)">발견됨 (진행도 ${percent}%)</strong>`;
        btnResumeAutoSave.style.display = "flex";
      } catch(e) {
        autoSaveStatusText.innerHTML = `브라우저 자동 저장 데이터: <strong>없음</strong>`;
        btnResumeAutoSave.style.display = "none";
      }
    } else {
      autoSaveStatusText.innerHTML = `브라우저 자동 저장 데이터: <strong>없음</strong>`;
      btnResumeAutoSave.style.display = "none";
    }
    inputSaveCode.value = "";
    saveLoadModal.classList.remove("hidden");
  });
  btnCloseSaveLoad.addEventListener("click", () => saveLoadModal.classList.add("hidden"));

  // 자동 저장 이어하기
  btnResumeAutoSave.addEventListener("click", () => {
    const savedData = localStorage.getItem(SAVE_KEY);
    if(savedData && importStateData(savedData)) {
       // 성공적으로 불러옴
    }
  });

  // 세이브 코드 복사
  btnExportCode.addEventListener("click", () => {
    const code = exportStateData();
    if (!code) {
      alert("진행 중인 데이터가 없습니다. 테스트를 시작한 후 다시 시도해주세요.");
      return;
    }
    navigator.clipboard.writeText(code).then(() => {
      alert("세이브 코드가 복사되었습니다! (메모장 등에 붙여넣어 보관하세요)");
    }).catch(() => {
      // 복사 권한이 없을 경우를 대비해 input 창에 표시
      inputSaveCode.value = code;
      alert("코드 복사에 실패했습니다. 아래 입력창에 나타난 코드를 직접 복사해주세요.");
    });
  });

  // 세이브 코드 입력 복구
  btnImportCode.addEventListener("click", () => {
    const code = inputSaveCode.value.trim();
    if (!code) { alert("세이브 코드를 입력해주세요."); return; }
    importStateData(code);
  });

  // 최초 로드 시 설정 프리뷰 업데이트
  updateModalPreview();

  // 최초 접속 시 자동 저장 데이터가 있다면 안내 모달 띄우기
  window.addEventListener('DOMContentLoaded', () => {
    if (localStorage.getItem(SAVE_KEY)) {
      btnOpenSaveLoad.click();
    }
  });
})();
