document.addEventListener('DOMContentLoaded', () => {
    const BOARD_SIZE = 8;
    const EMPTY = 0;
    const BLACK = 1;
    const WHITE = 2;
    const SUPERPOSITION = 3;

    const Complex = {
        add: (c1, c2) => ({ real: c1.real + c2.real, imag: c1.imag + c2.imag }),
        sub: (c1, c2) => ({ real: c1.real - c2.real, imag: c1.imag - c2.imag }),
        mul: (c1, c2) => ({ real: c1.real * c2.real - c1.imag * c2.imag, imag: c1.real * c2.imag + c1.imag * c2.real }),
        mulScalar: (c, s) => ({ real: c.real * s, imag: c.imag * s }),
        absSq: (c) => c.real * c.real + c.imag * c.imag,
        normalize: (c1, c2) => {
            const sumSq = Complex.absSq(c1) + Complex.absSq(c2);
            if (sumSq === 0) { // Handle case where both amplitudes are zero (e.g. from empty to superposition)
                return [Complex.fromPolar(Complex.sqrt2inv, Math.random() * 2 * Math.PI), Complex.fromPolar(Complex.sqrt2inv, Math.random() * 2 * Math.PI)];
            }
            const norm = Math.sqrt(sumSq);
            if (norm === 0) return [Complex.zero(), Complex.zero()]; // Should not happen if sumSq > 0
            return [Complex.mulScalar(c1, 1/norm), Complex.mulScalar(c2, 1/norm)];
        },
        phase: (c) => Math.atan2(c.imag, c.real),
        fromPolar: (r, phi) => ({ real: r * Math.cos(phi), imag: r * Math.sin(phi) }),
        zero: () => ({real: 0, imag: 0}),
        one: () => ({real: 1, imag: 0}),
        i: () => ({real: 0, imag: 1}),
        sqrt2inv: Math.sqrt(2) / 2,
    };

    const INITIAL_Q_POINTS = 3;
    const Q_POINTS_ON_STRATEGIC_OBSERVE = 1;
    const ECHO_DURATION = 3;
    const ENTANGLE_COST = 2;
    const ECHO_COST = 1;
    const HADAMARD_COST = 1;
    const AGE_TO_START_DECOHERENCE = 2;
    const DECOHERENCE_RATE_AMPLITUDE = 0.12;
    const DECOHERENCE_RATE_PHASE = 0.25;

    let board = [];
    let currentPlayer = BLACK;
    let scores = { [BLACK]: 0, [WHITE]: 0 };
    let qPoints = { [BLACK]: INITIAL_Q_POINTS, [WHITE]: INITIAL_Q_POINTS };
    let gameEnded = false;
    let currentAction = 'place';
    let skillParams = {};
    let consecutivePasses = 0;

    const gameBoardElement = document.getElementById('game-board');
    const blackScoreElement = document.getElementById('black-score');
    const whiteScoreElement = document.getElementById('white-score');
    const blackQPointsElement = document.getElementById('black-q-points');
    const whiteQPointsElement = document.getElementById('white-q-points');
    const blackPlayerScoreArea = document.getElementById('black-player-score-area');
    const whitePlayerScoreArea = document.getElementById('white-player-score-area');
    const turnIndicatorElement = document.getElementById('turn-indicator');
    const messageAreaElement = document.getElementById('message-area');
    const skillInfoArea = document.getElementById('skill-info-area');
    const overlayMessageElement = document.getElementById('overlay-message');
    const superpositionCountElement = document.getElementById('superposition-count');
    const entangledPairsCountElement = document.getElementById('entangled-pairs-count');
    const tooltipPopupElement = document.getElementById('tooltip-popup');

    const actionPlaceButton = document.getElementById('action-place-disc');
    const actionObserveButton = document.getElementById('action-observe-disc');
    const skillEntangleButton = document.getElementById('skill-entangle');
    const skillEchoButton = document.getElementById('skill-echo');
    const skillHadamardButton = document.getElementById('skill-hadamard');
    const passTurnButton = document.getElementById('pass-turn-button');
    const resetGameButton = document.getElementById('reset-game-button');

    // !!! CRITICAL FIX: Define getValidMovesForPlacement !!!
    function getValidMovesForPlacement(player) {
        const moves = [];
        for (let r = 0; r < BOARD_SIZE; r++) {
            for (let c = 0; c < BOARD_SIZE; c++) {
                if (board[r][c].state === EMPTY) {
                    if (getFlippedDiscs(r, c, player, false).length > 0) {
                        moves.push({ r, c });
                    }
                }
            }
        }
        return moves;
    }


    function createDiscObject(state = EMPTY, alpha = null, beta = null, age = 0) {
        let disc = {
            state: state,
            alpha: alpha || Complex.zero(),
            beta: beta || Complex.zero(),
            age: age,
            isEntangled: false,
            entangledWith: null,
            echoTurns: 0,
            element: null,
            faceElement: null
        };

        if (state === BLACK) {
            disc.alpha = Complex.one();
            disc.beta = Complex.zero();
        } else if (state === WHITE) {
            disc.alpha = Complex.zero();
            disc.beta = Complex.one();
        } else if (state === SUPERPOSITION) {
            if ((!alpha && !beta) || (Complex.absSq(disc.alpha) < 1e-9 && Complex.absSq(disc.beta) < 1e-9 )) { // ほぼゼロなら
                disc.alpha = Complex.fromPolar(Complex.sqrt2inv, Math.random() * 2 * Math.PI);
                disc.beta = Complex.fromPolar(Complex.sqrt2inv, Math.random() * 2 * Math.PI);
            }
            [disc.alpha, disc.beta] = Complex.normalize(disc.alpha, disc.beta);
        }
        return disc;
    }

    function initBoard() {
        board = Array(BOARD_SIZE).fill(null).map(() => Array(BOARD_SIZE).fill(null).map(() => createDiscObject()));
        
        board[3][3] = createDiscObject(WHITE);
        board[3][4] = createDiscObject(BLACK);
        board[4][3] = createDiscObject(BLACK);
        board[4][4] = createDiscObject(WHITE);

        gameEnded = false;
        currentPlayer = BLACK;
        qPoints[BLACK] = INITIAL_Q_POINTS;
        qPoints[WHITE] = INITIAL_Q_POINTS;
        currentAction = 'place';
        skillParams = {};
        consecutivePasses = 0;
    }
    
    function renderBoard() {
        gameBoardElement.innerHTML = ''; // Clear previous board
        let hasAnyValidActionForCurrentPlayer = false;
        // Get valid placement moves only if current action is 'place'
        const validPlaceMoves = (currentAction === 'place') ? getValidMovesForPlacement(currentPlayer) : [];

        for (let r = 0; r < BOARD_SIZE; r++) {
            for (let c = 0; c < BOARD_SIZE; c++) {
                const cellElement = document.createElement('div');
                cellElement.classList.add('cell');
                cellElement.dataset.row = r;
                cellElement.dataset.col = c;
                const discData = board[r][c];

                if (discData.state !== EMPTY) {
                    cellElement.classList.add('occupied');
                    const discElement = document.createElement('div');
                    discElement.classList.add('disc');
                    const discFaceFront = document.createElement('div');
                    discFaceFront.classList.add('disc-face', 'front');
                    const discFaceBack = document.createElement('div');
                    discFaceBack.classList.add('disc-face', 'back');
                    discElement.appendChild(discFaceFront);
                    discElement.appendChild(discFaceBack);
                    discData.element = discElement;
                    discData.faceElement = discFaceFront;
                    updateDiscAppearance(discData, r, c);
                    
                    // Ensure 'placed' class is added for existing discs for animation consistency
                    // Use a small timeout to allow the element to be in DOM for transition
                    requestAnimationFrame(() => {
                        if (discElement && !discElement.classList.contains('placed')) {
                             discElement.classList.add('placed');
                        }
                    });

                    cellElement.appendChild(discElement);
                    if (discData.state === SUPERPOSITION) {
                        cellElement.addEventListener('mouseenter', (e) => showProbabilityTooltip(e, discData));
                        cellElement.addEventListener('mouseleave', hideProbabilityTooltip);
                        cellElement.addEventListener('mousemove', moveProbabilityTooltip);
                    }
                }

                // Highlighting logic (check if this cell is a valid target for the current action)
                let isTargetableThisCell = false;
                if (currentAction === 'place' && discData.state === EMPTY) {
                    if (validPlaceMoves.some(move => move.r === r && move.c === c)) {
                        cellElement.classList.add('potential-move-cell');
                        isTargetableThisCell = true;
                    }
                } else if (currentAction === 'observe' && discData.state === SUPERPOSITION) {
                    cellElement.classList.add('observable-disc');
                    isTargetableThisCell = true;
                } else if (currentAction === 'skill-entangle-1' && discData.state === currentPlayer && !discData.isEntangled) {
                    cellElement.classList.add('skill-targetable');
                    isTargetableThisCell = true;
                } else if (currentAction === 'skill-entangle-2') {
                    const isSelf = skillParams.firstDisc && skillParams.firstDisc.r === r && skillParams.firstDisc.c === c;
                    if (!isSelf && discData.state === currentPlayer && !discData.isEntangled) {
                        cellElement.classList.add('skill-targetable');
                        isTargetableThisCell = true;
                    }
                } else if (currentAction === 'skill-echo' && discData.state === currentPlayer && discData.echoTurns === 0) {
                    cellElement.classList.add('skill-targetable');
                    isTargetableThisCell = true;
                } else if (currentAction === 'skill-hadamard' && discData.state === currentPlayer) {
                    cellElement.classList.add('skill-targetable');
                    isTargetableThisCell = true;
                }
                if(isTargetableThisCell) hasAnyValidActionForCurrentPlayer = true;
                
                gameBoardElement.appendChild(cellElement);
            }
        }
        updateUI();
        
        // Pass button display logic: show if no valid action is available for the *current* selected action (not just placement)
        passTurnButton.style.display = (!hasAnyValidActionForCurrentPlayer && !gameEnded && !currentAction.startsWith('skill-')) ? 'inline-block' : 'none';

        if (passTurnButton.style.display === 'inline-block' && !gameEnded) {
             messageAreaElement.textContent = `${currentPlayer === BLACK ? "黒" : "白"}プレイヤーは現在のアクションで有効な手がありません。`;
        }
    }


    function updateDiscAppearance(discData, r, c) {
        if (!discData || !discData.element) return;

        const discElement = discData.element;
        const discFace = discData.faceElement; 

        discElement.classList.remove('black', 'white', 'superposition', 'entangled', 'echo-active', 'entangled-pair-highlight');
        discFace.style.background = ''; // Clear previous dynamic background
        
        if (discData.state === BLACK) {
            discElement.classList.add('black');
        } else if (discData.state === WHITE) {
            discElement.classList.add('white');
        } else if (discData.state === SUPERPOSITION) {
            discElement.classList.add('superposition');
            const probBlack = Complex.absSq(discData.alpha);
            const blackPercent = Math.round(probBlack * 100);
            
            const phaseAlphaNorm = (Complex.phase(discData.alpha) / (2 * Math.PI) + 1) % 1;
            const phaseBetaNorm = (Complex.phase(discData.beta) / (2 * Math.PI) + 1) % 1; 

            const blackHue = 220; // Blueish for blackish part
            const whiteHue = 50;  // Yellowish for whitish part
            
            const color1 = `hsla(${blackHue + phaseAlphaNorm * 30 - 15}, 60%, ${30 + (1 - probBlack) * 30}%, 0.9)`;
            const color2 = `hsla(${whiteHue + phaseBetaNorm * 30 - 15}, 80%, ${70 + probBlack * 20}%, 0.9)`;
            
            discFace.style.background = `conic-gradient(from ${phaseAlphaNorm * 360}deg at 50% 50%, ${color1} ${blackPercent}%, ${color2} ${blackPercent}%)`;
        }

        if (discData.isEntangled) discElement.classList.add('entangled');
        if (discData.echoTurns > 0) discElement.classList.add('echo-active');

        if (skillParams.highlightEntangledPair && 
            ((skillParams.highlightEntangledPair.r1 === r && skillParams.highlightEntangledPair.c1 === c) ||
             (skillParams.highlightEntangledPair.r2 === r && skillParams.highlightEntangledPair.c2 === c))
        ) {
            discElement.classList.add('entangled-pair-highlight');
        }
    }
    
    function updateUI() {
        scores[BLACK] = 0;
        scores[WHITE] = 0;
        let superpositionCount = 0;
        let entangledDiscCoords = new Set();

        for (let r_idx = 0; r_idx < BOARD_SIZE; r_idx++) {
            for (let c_idx = 0; c_idx < BOARD_SIZE; c_idx++) {
                const disc = board[r_idx][c_idx];
                if (disc.state === BLACK) scores[BLACK]++;
                else if (disc.state === WHITE) scores[WHITE]++;
                else if (disc.state === SUPERPOSITION) superpositionCount++;
                if (disc.isEntangled) entangledDiscCoords.add(`${r_idx},${c_idx}`);
            }
        }
        blackScoreElement.textContent = scores[BLACK];
        whiteScoreElement.textContent = scores[WHITE];
        blackQPointsElement.textContent = qPoints[BLACK];
        whiteQPointsElement.textContent = qPoints[WHITE];
        
        superpositionCountElement.textContent = superpositionCount;
        entangledPairsCountElement.textContent = Math.floor(entangledDiscCoords.size / 2);

        turnIndicatorElement.textContent = `${currentPlayer === BLACK ? "黒" : "白"}のターン`;
        turnIndicatorElement.className = 'turn-indicator'; 
        turnIndicatorElement.classList.add(currentPlayer === BLACK ? 'black-turn' : 'white-turn');
        
        blackPlayerScoreArea.classList.toggle('current-turn', currentPlayer === BLACK);
        whitePlayerScoreArea.classList.toggle('current-turn', currentPlayer === WHITE);
        
        actionPlaceButton.classList.toggle('active', currentAction === 'place');
        actionObserveButton.classList.toggle('active', currentAction === 'observe');
        
        skillEntangleButton.classList.toggle('active-selection', currentAction.startsWith('skill-entangle'));
        skillEchoButton.classList.toggle('active-selection', currentAction === 'skill-echo');
        skillHadamardButton.classList.toggle('active-selection', currentAction === 'skill-hadamard');
        
        updateSkillButtons();
    }
    
    function updateSkillButtons() {
        const canSelectNewSkill = !currentAction.startsWith('skill-');
        skillEntangleButton.classList.toggle('disabled', qPoints[currentPlayer] < ENTANGLE_COST || !canSelectNewSkill && !currentAction.startsWith('skill-entangle'));
        skillEchoButton.classList.toggle('disabled', qPoints[currentPlayer] < ECHO_COST || !canSelectNewSkill && currentAction !== 'skill-echo');
        skillHadamardButton.classList.toggle('disabled', qPoints[currentPlayer] < HADAMARD_COST || !canSelectNewSkill && currentAction !== 'skill-hadamard');
    }

    function getFlippedDiscs(r, c, player, actuallyFlip = false) {
        const opponent = (player === BLACK) ? WHITE : BLACK;
        let allFlipped = [];
        const directions = [
            [-1, -1], [-1, 0], [-1, 1], [0, -1], [0, 1], [1, -1], [1, 0], [1, 1]
        ];

        for (const [dr, dc] of directions) {
            let currentFlippedInDir = [];
            let x = r + dr;
            let y = c + dc;
            while (x >= 0 && x < BOARD_SIZE && y >= 0 && y < BOARD_SIZE) {
                const targetDisc = board[x][y];
                if (targetDisc.state === opponent) {
                    currentFlippedInDir.push({ r: x, c: y });
                } else if (targetDisc.state === player) {
                    allFlipped = allFlipped.concat(currentFlippedInDir);
                    break;
                } else { break; }
                x += dr;
                y += dc;
            }
        }

        if (actuallyFlip && allFlipped.length > 0) {
            allFlipped.forEach(pos => {
                const discToFlip = board[pos.r][pos.c];
                // discToFlip の状態を player の色に確定させる
                discToFlip.state = player; // player は現在のターンプレイヤー
                discToFlip.alpha = (player === BLACK) ? Complex.one() : Complex.zero();
                discToFlip.beta  = (player === BLACK) ? Complex.zero() : Complex.one();
                discToFlip.age = 0;

                if (discToFlip.element) {
                    const discElement = discToFlip.element;
                    discElement.classList.remove('placed'); // アニメーションリセットのため
                    
                    const backFace = discElement.querySelector('.disc-face.back');
                    if (backFace) { // バックフェイスの色を反転後の色に設定
                        backFace.style.backgroundColor = (player === BLACK) ? 'var(--color-disc-black)' : 'var(--color-disc-white)';
                    }
                    
                    // flipping アニメーションのトリガーはクラス追加のみでOKなはず
                    requestAnimationFrame(() => { // DOM変更が反映されてからクラス追加
                        discElement.classList.add('flipping');
                        setTimeout(() => {
                            if (discElement) discElement.classList.remove('flipping');
                            updateDiscAppearance(discToFlip, pos.r, pos.c); // 最終状態を再描画
                            // 反転後、即座に 'placed' を再適用するとアニメーションがおかしくなる場合がある
                            // 必要であれば、updateDiscAppearance の後で再度 placed を付ける
                            requestAnimationFrame(() => { discElement.classList.add('placed'); });
                        }, 600); // CSS transition duration for flip
                    });
                }
                if (discToFlip.isEntangled) breakEntanglement(pos.r, pos.c, true);
            });
        }
        return allFlipped;
    }

    function applyTimeEvolution() {
        for (let r = 0; r < BOARD_SIZE; r++) {
            for (let c = 0; c < BOARD_SIZE; c++) {
                const disc = board[r][c];
                if (disc.state === EMPTY) continue;
                if (disc.echoTurns > 0) {
                    disc.echoTurns--;
                    const currentPhaseAlpha = Complex.phase(disc.alpha);
                    const currentPhaseBeta = Complex.phase(disc.beta);
                    disc.alpha = Complex.fromPolar(Math.sqrt(Complex.absSq(disc.alpha)), currentPhaseAlpha + (Math.random() - 0.5) * 0.02); // エコー中は位相の揺らぎを極小に
                    disc.beta  = Complex.fromPolar(Math.sqrt(Complex.absSq(disc.beta)),  currentPhaseBeta  + (Math.random() - 0.5) * 0.02);
                    [disc.alpha, disc.beta] = Complex.normalize(disc.alpha, disc.beta);
                    continue; 
                }
                disc.age++;
                if (disc.state !== SUPERPOSITION && disc.age > AGE_TO_START_DECOHERENCE) {
                    disc.state = SUPERPOSITION; // 確定状態から重ね合わせへ移行開始
                    // 移行時、現在の確定状態に基づいてalpha, betaを再設定（位相は維持）
                    const currentAbs = 1.0; // 確定状態の振幅の大きさ
                    const currentPhase = (disc.alpha.real === 1) ? Complex.phase(disc.alpha) : Complex.phase(disc.beta); // 黒ならalphaの位相、白ならbetaの位相
                    
                    // 少しだけ反対の振幅を持たせる
                    const smallOppositeAmp = 0.1; 
                    if (Complex.absSq(disc.alpha) > 0.99) { // もし黒なら
                        disc.alpha = Complex.fromPolar(Math.sqrt(1 - smallOppositeAmp*smallOppositeAmp), currentPhase);
                        disc.beta  = Complex.fromPolar(smallOppositeAmp, Math.random() * 2 * Math.PI);
                    } else { // もし白なら
                        disc.alpha = Complex.fromPolar(smallOppositeAmp, Math.random() * 2 * Math.PI);
                        disc.beta  = Complex.fromPolar(Math.sqrt(1 - smallOppositeAmp*smallOppositeAmp), currentPhase);
                    }
                     [disc.alpha, disc.beta] = Complex.normalize(disc.alpha, disc.beta);
                }

                if (disc.state === SUPERPOSITION) {
                    const probBlack = Complex.absSq(disc.alpha);
                    const currentMagAlpha = Math.sqrt(probBlack);
                    const currentMagBeta = Math.sqrt(1 - probBlack); 
                    const targetMag = Complex.sqrt2inv;

                    let newMagAlpha = currentMagAlpha + (targetMag - currentMagAlpha) * DECOHERENCE_RATE_AMPLITUDE * (1 + (Math.random()-0.5)*0.2); // 微小なランダム性
                    let newMagBeta = currentMagBeta + (targetMag - currentMagBeta) * DECOHERENCE_RATE_AMPLITUDE * (1 + (Math.random()-0.5)*0.2);
                    
                    const currentPhaseAlpha = Complex.phase(disc.alpha);
                    const currentPhaseBeta = Complex.phase(disc.beta);
                    const newPhaseAlpha = currentPhaseAlpha + (Math.random() - 0.5) * DECOHERENCE_RATE_PHASE;
                    const newPhaseBeta = currentPhaseBeta + (Math.random() - 0.5) * DECOHERENCE_RATE_PHASE;

                    disc.alpha = Complex.fromPolar(newMagAlpha, newPhaseAlpha);
                    disc.beta = Complex.fromPolar(newMagBeta, newPhaseBeta);
                    [disc.alpha, disc.beta] = Complex.normalize(disc.alpha, disc.beta);
                }
                
                const finalProbBlack = Complex.absSq(disc.alpha);
                if (disc.state === SUPERPOSITION) { // 再度チェック
                    if (finalProbBlack < 0.005) { // ほぼ白 (閾値を少し厳しく)
                        disc.state = WHITE; disc.alpha = Complex.zero(); disc.beta = Complex.one(); disc.age = 0;
                    } else if (finalProbBlack > 0.995) { // ほぼ黒
                        disc.state = BLACK; disc.alpha = Complex.one(); disc.beta = Complex.zero(); disc.age = 0;
                    }
                }
            }
        }
    }
    
    function observeDisc(r, c) { // currentPlayerのQポイントを操作するため、引数不要
        const disc = board[r][c];
        if (disc.state !== SUPERPOSITION) return false;
        const probBlack = Complex.absSq(disc.alpha);
        const wasBlack = Math.random() < probBlack;
        
        disc.state = wasBlack ? BLACK : WHITE;
        disc.alpha = wasBlack ? Complex.one() : Complex.zero();
        disc.beta = wasBlack ? Complex.zero() : Complex.one();
        disc.age = 0;

        let qPointGainedThisObservation = false;
        let message = "";
        if ((wasBlack && probBlack < 0.35) || (!wasBlack && probBlack > 0.65)) {
            qPoints[currentPlayer] += Q_POINTS_ON_STRATEGIC_OBSERVE;
            qPointGainedThisObservation = true;
            message = `コマ(${r},${c})を観測 → ${wasBlack ? "黒" : "白"}に確定！ (+${Q_POINTS_ON_STRATEGIC_OBSERVE} Qポイント)`;
        } else {
            message = `コマ(${r},${c})を観測 → ${wasBlack ? "黒" : "白"}に確定しました。`;
        }
        
        if (disc.isEntangled) {
            const partnerPos = disc.entangledWith;
            skillParams.highlightEntangledPair = { r1:r, c1:c, r2:partnerPos.r, c2:partnerPos.c }; 
            const previouslyEntangledPartnerR = partnerPos.r; // もつれ解消前に座標を保存
            const previouslyEntangledPartnerC = partnerPos.c;
            breakEntanglement(r, c, false); // まず観測したコマのもつれを解消
            
            const partnerDisc = board[previouslyEntangledPartnerR][previouslyEntangledPartnerC];
            // パートナーがまだ存在し、もつれ状態だった場合のみ処理
            if (partnerDisc && partnerDisc.isEntangled && partnerDisc.entangledWith && partnerDisc.entangledWith.r === r && partnerDisc.entangledWith.c === c) {
                const partnerBecomesBlack = !wasBlack; 
                partnerDisc.state = partnerBecomesBlack ? BLACK : WHITE;
                partnerDisc.alpha = partnerBecomesBlack ? Complex.one() : Complex.zero();
                partnerDisc.beta = partnerBecomesBlack ? Complex.zero() : Complex.one();
                partnerDisc.age = 0;
                
                message += ` もつれ先のコマ(${previouslyEntangledPartnerR},${previouslyEntangledPartnerC})は${partnerBecomesBlack ? "黒" : "白"}に。`;
                breakEntanglement(previouslyEntangledPartnerR, previouslyEntangledPartnerC, false); // パートナーのもつれも解消
            }

            // ハイライト処理はrenderBoardに任せる
            renderBoard(); // 状態変更を即座に反映
            setTimeout(() => { // ハイライトを消すために遅延実行
                delete skillParams.highlightEntangledPair;
                renderBoard(); 
            }, 1500);
        }
        messageAreaElement.textContent = message;
        return true;
    }

    function breakEntanglement(r, c, breakPartnerToo) {
        const disc = board[r][c];
        if (!disc.isEntangled) return;
        const partnerPos = disc.entangledWith; // 解除前に相手の座標を記憶
        disc.isEntangled = false;
        disc.entangledWith = null;
        if (breakPartnerToo && partnerPos) {
            const partnerDisc = board[partnerPos.r][partnerPos.c];
            if (partnerDisc && partnerDisc.isEntangled) { // 相手もまだもつれているか確認
                partnerDisc.isEntangled = false;
                partnerDisc.entangledWith = null;
            }
        }
    }

    function handleCellClick(event) {
        if (gameEnded) return;
        const cell = event.target.closest('.cell');
        if (!cell) return;
        const r = parseInt(cell.dataset.row);
        const c = parseInt(cell.dataset.col);
        const discData = board[r][c];
        let turnShouldAdvance = false;
        const actingPlayer = currentPlayer; // このターンのアクション実行者を確定

        if (currentAction === 'place') {
            if (discData.state === EMPTY) {
                const flippedDiscs = getFlippedDiscs(r, c, actingPlayer, true);
                if (flippedDiscs.length > 0) {
                    // 新しいコマをactingPlayerの色で作成
                    board[r][c] = createDiscObject(actingPlayer);
                    messageAreaElement.textContent = `コマ(${r},${c})を配置。${flippedDiscs.length}個反転。`;
                    turnShouldAdvance = true;
                } else { messageAreaElement.textContent = "そこには配置できません。"; }
            } else { messageAreaElement.textContent = "既にコマがあります。"; }
        } else if (currentAction === 'observe') {
            if (discData.state === SUPERPOSITION) {
                if (observeDisc(r, c)) turnShouldAdvance = true; // observeDisc内でメッセージ設定
            } else { messageAreaElement.textContent = "重ね合わせ状態のコマのみ観測できます。"; }
        } else if (currentAction.startsWith('skill-')) {
            // スキル処理 (actingPlayer を使用)
            if (currentAction === 'skill-entangle-1') {
                if (discData.state === actingPlayer && !discData.isEntangled) {
                    skillParams.firstDisc = {r, c};
                    currentAction = 'skill-entangle-2';
                    skillInfoArea.textContent = `コマ(${r},${c})選択。2つ目の自分の確定コマを選択。`;
                } else { skillInfoArea.textContent = "自分の確定かつ非もつれコマを選択。"; }
            } else if (currentAction === 'skill-entangle-2') {
                const firstDiscPos = skillParams.firstDisc;
                if (firstDiscPos.r === r && firstDiscPos.c === c) {
                    skillInfoArea.textContent = "同じコマは選択できません。";
                } else if (discData.state === actingPlayer && !discData.isEntangled) {
                    board[firstDiscPos.r][firstDiscPos.c].isEntangled = true;
                    board[firstDiscPos.r][firstDiscPos.c].entangledWith = {r, c};
                    discData.isEntangled = true;
                    discData.entangledWith = {r: firstDiscPos.r, c: firstDiscPos.c};
                    qPoints[actingPlayer] -= ENTANGLE_COST;
                    messageAreaElement.textContent = `コマ(${firstDiscPos.r},${firstDiscPos.c})と(${r},${c})をエンタングル！`;
                    turnShouldAdvance = true;
                } else { skillInfoArea.textContent = "2つ目も自分の確定かつ非もつれコマを選択。"; }
            } else if (currentAction === 'skill-echo') {
                if (discData.state === actingPlayer && discData.echoTurns === 0) {
                    discData.echoTurns = ECHO_DURATION;
                    qPoints[actingPlayer] -= ECHO_COST;
                    messageAreaElement.textContent = `コマ(${r},${c})に量子エコー適用。`;
                    turnShouldAdvance = true;
                } else { skillInfoArea.textContent = `自分の確定コマでエコー未使用のものを選んでください。`; }
            } else if (currentAction === 'skill-hadamard') {
                if (discData.state === actingPlayer) {
                    const originalAlpha = discData.alpha; // 元の確定状態のalpha,beta
                    const originalBeta = discData.beta;
                    discData.state = SUPERPOSITION;
                    // H|0> = (|0>+|1>)/sqrt(2) -> alpha=1/sqrt(2), beta=1/sqrt(2)
                    // H|1> = (|0>-|1>)/sqrt(2) -> alpha=1/sqrt(2), beta=-1/sqrt(2)
                    discData.alpha = Complex.mulScalar(Complex.add(originalAlpha, originalBeta), Complex.sqrt2inv);
                    discData.beta  = Complex.mulScalar(Complex.sub(originalAlpha, originalBeta), Complex.sqrt2inv);
                    [discData.alpha, discData.beta] = Complex.normalize(discData.alpha, discData.beta);
                    discData.age = 0;
                    qPoints[actingPlayer] -= HADAMARD_COST;
                    messageAreaElement.textContent = `コマ(${r},${c})にアダマール展開適用。`;
                    turnShouldAdvance = true;
                } else { skillInfoArea.textContent = "自分の確定状態のコマを選択。"; }
            }
        }

        if (turnShouldAdvance) {
            consecutivePasses = 0;
            // スキルが完了した場合、または通常アクションの場合にデフォルトに戻す
            if (!currentAction.startsWith('skill-') || 
                (currentAction === 'skill-entangle-2' && skillParams.firstDisc) || // エンタングル2段階目完了
                currentAction === 'skill-echo' || 
                currentAction === 'skill-hadamard') {
                currentAction = 'place';
                skillParams = {};
                skillInfoArea.textContent = 'アクションまたはスキルを選択してください。';
            }
            applyTimeEvolution();
            switchPlayer(); // ここでcurrentPlayerが切り替わる
            if (checkGameOver()) { renderBoard(); return; }
        }
        renderBoard(); 
    }

    function switchPlayer() {
        currentPlayer = (currentPlayer === BLACK) ? WHITE : BLACK;
        passTurnButton.style.display = 'none';
        // ターン開始時のメッセージはrenderBoard後のpassButton表示ロジックでカバーされるので、ここではシンプルに
        // messageAreaElement.textContent = `${currentPlayer === BLACK ? "黒" : "白"}のターンです。`;
    }

    function checkGameOver() {
        let allCellsOccupied = true;
        for (let r = 0; r < BOARD_SIZE; r++) {
            for (let c = 0; c < BOARD_SIZE; c++) {
                if (board[r][c].state === EMPTY) { allCellsOccupied = false; break; }
            }
            if (!allCellsOccupied) break;
        }
        if (allCellsOccupied || consecutivePasses >= 2) gameEnded = true;

        if (gameEnded) {
            for (let r = 0; r < BOARD_SIZE; r++) { // 全重ね合わせを最終観測
                for (let c = 0; c < BOARD_SIZE; c++) {
                    if (board[r][c].state === SUPERPOSITION) {
                        const probBlack = Complex.absSq(board[r][c].alpha);
                        board[r][c].state = (Math.random() < probBlack) ? BLACK : WHITE;
                    }
                }
            }
            updateUI(); // 最終スコア計算と表示
            let winnerMessage;
            if (scores[BLACK] > scores[WHITE]) winnerMessage = "黒の勝利です！";
            else if (scores[WHITE] > scores[BLACK]) winnerMessage = "白の勝利です！";
            else winnerMessage = "引き分けです！";
            overlayMessageElement.innerHTML = `ゲーム終了！ ${winnerMessage}<br>黒: ${scores[BLACK]} - 白: ${scores[WHITE]}`;
            overlayMessageElement.style.display = 'flex';
            turnIndicatorElement.textContent = "ゲーム終了";
            return true;
        }
        return false;
    }

    function resetGame() {
        initBoard();
        renderBoard();
        messageAreaElement.textContent = "ゲームをリセットしました。黒のターンです。";
        overlayMessageElement.style.display = 'none';
        skillInfoArea.textContent = 'アクションまたはスキルを選択してください。';
    }

    // --- Event Listeners & Tooltip ---
    actionPlaceButton.addEventListener('click', () => {
        if (currentAction.startsWith('skill-')) { skillInfoArea.textContent = "スキル選択を完了/キャンセルしてください。"; return; }
        currentAction = 'place'; skillParams = {};
        skillInfoArea.textContent = 'アクション: 配置。配置可能な空きマスをクリック。'; renderBoard();
    });
    actionObserveButton.addEventListener('click', () => {
        if (currentAction.startsWith('skill-')) { skillInfoArea.textContent = "スキル選択を完了/キャンセルしてください。"; return; }
        currentAction = 'observe'; skillParams = {};
        skillInfoArea.textContent = 'アクション: 観測。重ね合わせ状態のコマをクリック。'; renderBoard();
    });
    
    function toggleSkillSelection(skillNameKey, cost, stage1Text, skillActionName) {
        if (currentAction === skillActionName) { // キャンセル
            currentAction = 'place'; skillParams = {};
            skillInfoArea.textContent = 'スキル選択をキャンセルしました。';
        } else if (currentAction.startsWith('skill-')) { // 他のスキル選択中
            skillInfoArea.textContent = "他のスキル選択中です。一度キャンセルしてください。"; return false;
        } else if (qPoints[currentPlayer] < cost) { // Qポイント不足
            skillInfoArea.textContent = `Qポイント不足 (コスト: ${cost})`; return false;
        } else { // 新規スキル選択
            currentAction = skillActionName; skillParams = {};
            skillInfoArea.textContent = stage1Text;
        }
        renderBoard(); return true;
    }

    skillEntangleButton.addEventListener('click', () => toggleSkillSelection('エンタングル', ENTANGLE_COST, 'スキル: エンタングル。1つ目の自分の確定コマを選択。', 'skill-entangle-1'));
    skillEchoButton.addEventListener('click', () => toggleSkillSelection('量子エコー', ECHO_COST, 'スキル: 量子エコー。保護する自分のコマを選択。', 'skill-echo'));
    skillHadamardButton.addEventListener('click', () => toggleSkillSelection('アダマール展開', HADAMARD_COST, 'スキル: アダマール展開。自分の確定コマを選択。', 'skill-hadamard'));
    
    passTurnButton.addEventListener('click', () => {
        if (gameEnded || currentAction.startsWith('skill-')) {
             if(currentAction.startsWith('skill-')) skillInfoArea.textContent = "スキル選択中はパスできません。"; return;
        }
        consecutivePasses++;
        messageAreaElement.textContent = `${currentPlayer === BLACK ? "黒" : "白"}プレイヤーがパスしました。(${consecutivePasses}回連続)`;
        applyTimeEvolution(); 
        switchPlayer();
        if (checkGameOver()) { renderBoard(); return; }
        currentAction = 'place'; 
        skillInfoArea.textContent = 'アクションまたはスキルを選択してください。';
        renderBoard();
    });

    resetGameButton.addEventListener('click', resetGame);
    gameBoardElement.addEventListener('click', handleCellClick);

    function showProbabilityTooltip(event, discData) {
        if (discData.state !== SUPERPOSITION) return;
        const probBlack = Complex.absSq(discData.alpha);
        const probWhite = 1 - probBlack; // 正規化されている前提
        const phaseAlphaDeg = Math.round(Complex.phase(discData.alpha) * 180 / Math.PI);
        const phaseBetaDeg = Math.round(Complex.phase(discData.beta) * 180 / Math.PI);
        tooltipPopupElement.innerHTML = `黒確率: ${Math.round(probBlack * 100)}% (位相 ${phaseAlphaDeg}°)<br>白確率: ${Math.round(probWhite * 100)}% (位相 ${phaseBetaDeg}°)`;
        tooltipPopupElement.style.display = 'block';
        moveProbabilityTooltip(event);
    }
    function hideProbabilityTooltip() { tooltipPopupElement.style.display = 'none'; }
    function moveProbabilityTooltip(event) {
        const popupWidth = tooltipPopupElement.offsetWidth;
        const popupHeight = tooltipPopupElement.offsetHeight;
        const margin = 15; // カーソルからのオフセット
        let x = event.clientX + margin; // clientX/Y でビューポート座標を取得
        let y = event.clientY + margin;
        if (x + popupWidth > window.innerWidth) x = event.clientX - popupWidth - margin;
        if (y + popupHeight > window.innerHeight) y = event.clientY - popupHeight - margin;
        tooltipPopupElement.style.left = `${x}px`;
        tooltipPopupElement.style.top = `${y}px`;
    }

    initBoard();
    renderBoard();
});
