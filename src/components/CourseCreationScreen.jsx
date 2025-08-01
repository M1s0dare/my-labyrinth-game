/**
 * コース作成画面コンポーネント
 * プレイヤーが迷路を作成し、スタート・ゴール位置を設定する画面
 */

import React, { useState, useEffect, useRef } from 'react';
import { getFirestore, doc, getDoc, updateDoc, serverTimestamp, Timestamp, onSnapshot } from 'firebase/firestore';
import { CheckCircle, XCircle, Clock } from 'lucide-react';
import { db, appId } from '../firebase';
import MazeGrid from './MazeGrid';
import { STANDARD_GRID_SIZE, EXTRA_GRID_SIZE, WALL_COUNT, SECRET_OBJECTIVES, DECLARATION_PHASE_DURATION, EXTRA_MODE_PERSONAL_TIME_LIMIT } from '../constants';
import { createInitialWallStates, isPathPossible, shuffleArray, formatTime, getUsername } from '../utils';

/**
 * コース作成画面コンポーネント
 * @param {string} userId - 現在のユーザーID
 * @param {Function} setScreen - 画面を切り替える関数
 * @param {string} gameMode - ゲームモード（2player or 4player）
 * @param {boolean} debugMode - デバッグモードのON/OFF
 */
const CourseCreationScreen = ({ userId, setScreen, gameMode, debugMode, isOnline }) => {
    // === 状態管理 ===
    const [gameId, setGameId] = useState(null);              // 現在のゲームID
    const [gameData, setGameData] = useState(null);          // ゲームデータ
    const [gameType, setGameType] = useState('standard');    // ゲームタイプ
    
    // ゲームタイプに応じたグリッドサイズを決定
    const currentGridSize = gameType === 'extra' ? EXTRA_GRID_SIZE : STANDARD_GRID_SIZE;
    
    const [myMazeWalls, setMyMazeWalls] = useState(createInitialWallStates(currentGridSize));  // 迷路の壁情報
    const [startPos, setStartPos] = useState(null);          // スタート位置
    const [goalPos, setGoalPos] = useState(null);            // ゴール位置
    const [settingMode, setSettingMode] = useState('wall');  // 設定モード（wall/start/goal）
    const [message, setMessage] = useState(`壁を${WALL_COUNT}本設置し、S/Gを設定してください。`);  // メッセージ
    const [creationTimeLeft, setCreationTimeLeft] = useState(null);  // 作成残り時間
    const [connectionStatus, setConnectionStatus] = useState('connected'); // 接続状態
    const [lastSyncTime, setLastSyncTime] = useState(Date.now()); // 最後の同期時刻

    // ユーザー名を取得
    const currentUserName = getUsername() || "未設定ユーザー";

    // リアルタイムリスナーの参照を保持
    const listenerRef = useRef(null);
    const syncTimeoutRef = useRef(null);

    // ユーザーIDからユーザー名を取得するヘルパー関数
    const getUserNameById = (playerId) => {
        if (playerId === userId) {
            return currentUserName;
        }
        
        // まずゲームデータのplayerNamesマップから取得を試行
        if (gameData?.playerNames && gameData.playerNames[playerId]) {
            return gameData.playerNames[playerId];
        }
        
        // 次にplayerStatesから取得を試行（ゲーム開始後）
        if (gameData?.playerStates?.[playerId]?.playerName) {
            return gameData.playerStates[playerId].playerName;
        }
        
        // デバッグプレイヤーの場合
        if (playerId.startsWith('debug_player')) {
            const playerNumber = playerId.charAt(12) || playerId.split('_')[2];
            return `デバッグプレイヤー${playerNumber}`;
        }
        
        // フォールバック：Firebase IDの一部を表示
        return `プレイヤー${playerId.substring(0,8)}...`;
    };

    // === 初期化処理 ===
    useEffect(() => {
        // ローカルストレージからゲーム情報を取得
        const storedGameId = localStorage.getItem('labyrinthGameId');
        const storedGameType = localStorage.getItem('labyrinthGameType') || 'standard';
        setGameType(storedGameType);
        
        // 拡張モードの場合、作成時間制限を設定
        if (storedGameType === 'extra') {
            setCreationTimeLeft(5 * 60); // 5分
        } else {
            setCreationTimeLeft(null);
        }
        if (storedGameId) {
            setGameId(storedGameId);
        } else {
            setMessage("ゲームIDが見つかりません。ロビーに戻ってください。");
        }
    }, []);
    
    useEffect(() => {
        // Re-initialize walls when gameType changes, which implies currentGridSize might change
        setMyMazeWalls(createInitialWallStates(gameType === 'extra' ? EXTRA_GRID_SIZE : STANDARD_GRID_SIZE));
    }, [gameType]);

    useEffect(() => { // Timer for extra mode creation phase
        if (gameType === 'extra' && creationTimeLeft !== null && creationTimeLeft > 0 && gameData?.status === 'creating' && (!gameData.mazes || !gameData.mazes[userId])) { // Timer only if maze not submitted
            const timer = setTimeout(() => setCreationTimeLeft(creationTimeLeft - 1), 1000);
            return () => clearTimeout(timer);
        } else if (gameType === 'extra' && creationTimeLeft === 0 && gameData?.status === 'creating' && (!gameData.mazes || !gameData.mazes[userId])) {
            setMessage("時間切れです！迷路を自動送信します（または現在の状態で確定）。");
            // TODO: Auto-submit logic (e.g. with random valid maze or current state)
            // For now, just a message. Player would need to manually submit if possible.
            // handleSubmitMaze(); // Attempt to auto-submit with potentially incomplete data if rules allow
        }
    }, [creationTimeLeft, gameType, gameData, userId]);


    useEffect(() => {
        if (!gameId || !userId) return;
        
        console.log("🔗 [CourseCreation] Setting up enhanced real-time listener for game:", gameId);
        
        const gameDocRef = doc(db, `artifacts/${appId}/public/data/labyrinthGames`, gameId);
        
        // 強化されたリアルタイムリスナー（メタデータ変更も含む）
        const unsubscribe = onSnapshot(gameDocRef, 
            {
                includeMetadataChanges: true, // サーバーとローカルキャッシュの両方の変更を監視
            },
            (docSnap) => {
                const now = Date.now();
                const source = docSnap.metadata.fromCache ? "cache" : "server";
                const hasPendingWrites = docSnap.metadata.hasPendingWrites;
                
                console.log(`📱 [CourseCreation] Game data updated from ${source}:`, {
                    gameId: gameId.substring(0, 8),
                    userId: userId.substring(0, 8),
                    timestamp: new Date().toISOString(),
                    source,
                    hasPendingWrites,
                    exists: docSnap.exists()
                });
                
                // 接続状態を更新
                if (source === "server") {
                    setConnectionStatus('connected');
                    setLastSyncTime(now);
                    // 同期タイムアウトをクリア
                    if (syncTimeoutRef.current) {
                        clearTimeout(syncTimeoutRef.current);
                        syncTimeoutRef.current = null;
                    }
                } else if (source === "cache") {
                    setConnectionStatus('cached');
                    // サーバーからの応答を一定時間待つ
                    if (syncTimeoutRef.current) clearTimeout(syncTimeoutRef.current);
                    syncTimeoutRef.current = setTimeout(() => {
                        if (Date.now() - lastSyncTime > 10000) { // 10秒以上サーバーからの更新がない
                            setConnectionStatus('disconnected');
                        }
                    }, 10000);
                }
                
                if (docSnap.exists()) {
                    const data = docSnap.data();
                    
                    // より詳細なログ出力
                    console.log("� [CourseCreation] Detailed game state:", {
                        status: data.status,
                        players: data.players,
                        playerCount: data.players?.length || 0,
                        currentUserIncluded: data.players?.includes(userId),
                        mazesCount: Object.keys(data.mazes || {}).length,
                        mazeOwners: Object.keys(data.mazes || {}),
                        lastUpdated: data.lastUpdated?.toDate()?.toISOString(),
                        source,
                        hasPendingWrites
                    });
                    
                    // サーバーからのデータのみを状態に反映（ローカルキャッシュは無視）
                    if (source === "server" || !hasPendingWrites) {
                        setGameData(data);
                        const newGameType = data.gameType || 'standard';
                        if (gameType !== newGameType) setGameType(newGameType);

                        // ゲーム状態が無効な場合はロビーに戻る
                        if (data.status === 'abandoned' || data.status === 'disbanded') {
                            console.log("⚠️ [CourseCreation] Game was abandoned/disbanded, returning to lobby");
                            setMessage("ゲームが解散されました。ロビーに戻ります。");
                            localStorage.removeItem('labyrinthGameId');
                            localStorage.removeItem('labyrinthGameType');
                            setTimeout(() => setScreen('lobby'), 2000);
                            return;
                        }

                        // 現在のユーザーがプレイヤーリストに含まれていない場合
                        if (!data.players || !data.players.includes(userId)) {
                            console.log("⚠️ [CourseCreation] Current user not in players list, returning to lobby");
                            setMessage("プレイヤーリストから除外されました。ロビーに戻ります。");
                            localStorage.removeItem('labyrinthGameId');
                            localStorage.removeItem('labyrinthGameType');
                            setTimeout(() => setScreen('lobby'), 2000);
                            return;
                        }

                        if (data.status === "playing" || (newGameType === 'extra' && data.currentExtraModePhase && data.currentExtraModePhase !== "mazeCreation")) {
                            setScreen('play');
                        }
                        
                        if (data.mazes && data.mazes[userId]) {
                            setMessage("迷路送信済。他プレイヤー待機中...");
                            const submittedMaze = data.mazes[userId];
                            const mazeGridSize = submittedMaze.gridSize || (newGameType === 'extra' ? EXTRA_GRID_SIZE : STANDARD_GRID_SIZE);
                            if(submittedMaze.allWallsConfiguration) setMyMazeWalls(submittedMaze.allWallsConfiguration);
                            else setMyMazeWalls(createInitialWallStates(mazeGridSize));
                            if(submittedMaze.start) setStartPos(submittedMaze.start);
                            if(submittedMaze.goal) setGoalPos(submittedMaze.goal);
                        } else if (data.status === 'creating') {
                            updateMessage(myMazeWalls, startPos, goalPos, newGameType === 'extra' ? EXTRA_GRID_SIZE : STANDARD_GRID_SIZE);
                        }
                    }
                } else {
                    console.log("❌ [CourseCreation] Game document does not exist");
                    setMessage("ゲームデータが見つかりません。ロビーに戻ります。");
                    localStorage.removeItem('labyrinthGameId');
                    localStorage.removeItem('labyrinthGameType');
                    setTimeout(() => setScreen('lobby'), 2000);
                }
            },
            (error) => {
                console.error("❌ [CourseCreation] Error in real-time listener:", error);
                setConnectionStatus('error');
                setMessage("接続エラーが発生しました。ページをリロードしてください。");
            }
        );
        
        listenerRef.current = unsubscribe;
        
        return () => {
            console.log("🔌 [CourseCreation] Unsubscribing from real-time listener");
            if (listenerRef.current) {
                listenerRef.current();
                listenerRef.current = null;
            }
            if (syncTimeoutRef.current) {
                clearTimeout(syncTimeoutRef.current);
                syncTimeoutRef.current = null;
            }
        };
    }, [gameId, userId, setScreen]); // 依存関係を最小限に減らす

    const updateMessage = (newWalls = myMazeWalls, newStart = startPos, newGoal = goalPos, gridSizeToUse = currentGridSize) => {
        const activeWallsCount = newWalls.filter(w => w.active).length;
        let msg = `壁: ${activeWallsCount}/${WALL_COUNT}本。`;
        msg += newStart ? `S(${newStart.r},${newStart.c})。` : 'S未設定。';
        msg += newGoal ? `G(${newGoal.r},${newGoal.c})。` : 'G未設定。';
        if (newStart && newGoal && !isPathPossible(newStart, newGoal, newWalls, gridSizeToUse)) {
            msg += " <span class='text-red-500 font-semibold'>警告: SからGへの経路がありません！</span>";
        }
        setMessage(msg);
    };
    
    const handleWallClick = (r, c, type) => {
        if (settingMode !== 'wall' || (gameData?.mazes?.[userId])) {
             if(gameData?.mazes?.[userId]) setMessage("迷路は送信済みのため変更できません。");
             return;
        }
        const wallIndex = myMazeWalls.findIndex(w => w.r === r && w.c === c && w.type === type);
        if (wallIndex === -1) return; // Should not happen with createInitialWallStates
        const newWalls = myMazeWalls.map(w => ({...w})); // Create a new array of new wall objects
        const activeWallsCount = newWalls.filter(w => w.active).length;

        if (newWalls[wallIndex].active) { // Deactivating a wall
            newWalls[wallIndex].active = false;
        } else { // Activating a wall
            if (activeWallsCount >= WALL_COUNT) {
                updateMessage(newWalls, startPos, goalPos, currentGridSize); // Update count display
                setMessage(`壁は${WALL_COUNT}本までです。 <span class='text-red-500 font-semibold'>SからGへの経路を確認してください。</span>`);
                return;
            }
            newWalls[wallIndex].active = true;
        }

        // Check path after potential change
        if (startPos && goalPos && !isPathPossible(startPos, goalPos, newWalls, currentGridSize)) {
            // Revert wall change if path is blocked, unless it's removing a wall that might open a path
            if (newWalls[wallIndex].active) { // If we just added a wall that blocked the path
                 setMessage(`この壁を設置するとSからGへの経路がなくなります。 <span class='text-red-500 font-semibold'>SからGへの経路を確認してください。</span>`);
                 return; // Do not update state
            }
        }
        setMyMazeWalls(newWalls);
        updateMessage(newWalls, startPos, goalPos, currentGridSize);
    };
    
    const handleCellClick = (r, c) => {
        if (gameData?.mazes?.[userId]) {
             setMessage("迷路は送信済みのため変更できません。"); return;
        }
        let newStart = startPos, newGoal = goalPos;
        if (settingMode === 'start') {
            if (goalPos && goalPos.r === r && goalPos.c === c) {
                setMessage("SとGは異なるマスに。 <span class='text-red-500 font-semibold'>SからGへの経路を確認してください。</span>"); return;
            }
            newStart = { r, c };
        } else if (settingMode === 'goal') {
             if (startPos && startPos.r === r && startPos.c === c) {
                setMessage("SとGは異なるマスに。 <span class='text-red-500 font-semibold'>SからGへの経路を確認してください。</span>"); return;
            }
            newGoal = { r, c };
        }

        if (newStart && newGoal && !isPathPossible(newStart, newGoal, myMazeWalls, currentGridSize)) {
             setMessage(`現在の壁では、その${settingMode === 'start' ? 'S' : 'G'}位置だと経路が確保できません。 <span class='text-red-500 font-semibold'>SからGへの経路を確認してください。</span>`);
            return; // Do not set if path is not possible
        }
        
        if (settingMode === 'start') setStartPos(newStart);
        if (settingMode === 'goal') setGoalPos(newGoal);
        updateMessage(myMazeWalls, newStart, newGoal, currentGridSize);
    };

    // デバッグモード用の自動迷路生成関数
    const generateRandomMaze = () => {
        const walls = createInitialWallStates(currentGridSize);
        const activeWallPositions = [];
        
        // ランダムに壁を配置
        while (activeWallPositions.length < WALL_COUNT) {
            const randomIndex = Math.floor(Math.random() * walls.length);
            if (!walls[randomIndex].active) {
                walls[randomIndex].active = true;
                activeWallPositions.push(randomIndex);
            }
        }
        
        // スタートとゴール位置をランダムに設定
        let start, goal;
        do {
            start = {
                r: Math.floor(Math.random() * currentGridSize),
                c: Math.floor(Math.random() * currentGridSize)
            };
            goal = {
                r: Math.floor(Math.random() * currentGridSize),
                c: Math.floor(Math.random() * currentGridSize)
            };
        } while (
            (start.r === goal.r && start.c === goal.c) ||
            !isPathPossible(start, goal, walls, currentGridSize)
        );
        
        return {
            start,
            goal,
            walls: walls.filter(w => w.active),
            allWallsConfiguration: walls,
            gridSize: currentGridSize
        };
    };

    const handleSubmitMaze = async () => {
        if (!startPos || !goalPos) { setMessage("SとGを設定してください。 <span class='text-red-500 font-semibold'>SからGへの経路を確認してください。</span>"); return; }
        if (myMazeWalls.filter(w => w.active).length !== WALL_COUNT) { setMessage(`壁を正確に${WALL_COUNT}本設定してください。 <span class='text-red-500 font-semibold'>SからGへの経路を確認してください。</span>`); return; }
        if (!isPathPossible(startPos, goalPos, myMazeWalls, currentGridSize)) { setMessage("SからGへの経路がありません。壁やS/Gを調整してください。"); return; }
        if (!gameId || !userId || !gameData) { setMessage("ゲーム/ユーザー情報がありません。"); return; }

        const mazePayload = {
            start: startPos, goal: goalPos,
            walls: myMazeWalls.filter(w => w.active), // Only active walls for game logic
            allWallsConfiguration: myMazeWalls, // Save full config for potential re-edit or display
            ownerId: userId,
            gridSize: currentGridSize, // Store grid size with maze
        };

        try {
            const gameDocRef = doc(db, `artifacts/${appId}/public/data/labyrinthGames`, gameId);
            const currentDoc = await getDoc(gameDocRef);
            if (!currentDoc.exists()) { setMessage("ゲームが見つかりません。"); return; }
            const currentData = currentDoc.data();
            let updatedMazes = { ...(currentData.mazes || {}), [userId]: mazePayload };

            // デバッグモード時は他のプレイヤー分も自動生成
            if (debugMode && currentData.players) {
                const requiredPlayers = currentData.mode === '2player' ? 2 : 4;
                if (currentData.players.length === requiredPlayers) {
                    console.log(`🔧 [DEBUG] Auto-generating mazes for other ${requiredPlayers - 1} players`);
                    setMessage("デバッグモード: 他プレイヤー分の迷路を自動生成中...");
                    
                    const otherPlayers = currentData.players.filter(pid => pid !== userId);
                    otherPlayers.forEach(playerId => {
                        if (!updatedMazes[playerId]) {
                            const autoMaze = generateRandomMaze();
                            updatedMazes[playerId] = {
                                ...autoMaze,
                                ownerId: playerId,
                                isAutoGenerated: true // デバッグフラグ
                            };
                            console.log(`🔧 [DEBUG] Auto-generated maze for player ${playerId.substring(0,8)}...`);
                        }
                    });
                }
            }

            await updateDoc(gameDocRef, { mazes: updatedMazes });
            setMessage(debugMode ? "迷路送信完了（デバッグモード: 全員分自動生成）" : "迷路送信。他プレイヤー待機中...");

            const requiredPlayers = currentData.mode === '2player' ? 2 : 4; // Extra mode is always 4 players
            if (Object.keys(updatedMazes).length === currentData.players.length && currentData.players.length === requiredPlayers) {
                let playerIds = [...currentData.players];
                playerIds = shuffleArray(playerIds); // This will be the turnOrder
                const newPlayerStates = {};
                let assignedMazeOwners = shuffleArray([...currentData.players]); // Mazes to be assigned
                
                let availableObjectives = gameType === 'extra' ? shuffleArray([...SECRET_OBJECTIVES]) : [];

                playerIds.forEach((pid, index) => {
                    let assignedMazeOwnerId = assignedMazeOwners[index];
                    let attempts = 0;
                    // Ensure player doesn't get their own maze if possible
                    while(assignedMazeOwnerId === pid && attempts < requiredPlayers && requiredPlayers > 1) {
                        assignedMazeOwnerId = assignedMazeOwners[(index + attempts + 1) % requiredPlayers];
                        attempts++;
                    }
                     if (assignedMazeOwnerId === pid && requiredPlayers > 1) { // Fallback for simple 2 player or rare 4 player case
                        assignedMazeOwnerId = assignedMazeOwners[(index + 1) % requiredPlayers]; // Assign next in shuffled list
                     }


                    let secretObjective = null;
                    if (gameType === 'extra' && availableObjectives.length > 0) {
                        secretObjective = {...availableObjectives.pop()}; // Clone objective
                        if (secretObjective.requiresTarget) {
                            let targetOptions = playerIds.filter(targetPid => targetPid !== pid);
                            secretObjective.targetPlayerId = targetOptions.length > 0 ? targetOptions[Math.floor(Math.random() * targetOptions.length)] : null;
                            secretObjective.text = secretObjective.text.replace("特定のプレイヤー", secretObjective.targetPlayerId ? secretObjective.targetPlayerId.substring(0,5)+"..." : "誰か");
                        }
                        secretObjective.achieved = false;
                        secretObjective.progress = 0; // Initialize progress for counter objectives
                    }

                    // プレイヤー名を確実に取得
                    let playerName;
                    if (pid === userId) {
                        playerName = currentUserName;
                    } else if (currentData.playerNames && currentData.playerNames[pid]) {
                        playerName = currentData.playerNames[pid];
                    } else if (pid.startsWith('debug_player')) {
                        const playerNumber = pid.charAt(12) || pid.split('_')[2];
                        playerName = `デバッグプレイヤー${playerNumber}`;
                    } else {
                        playerName = `プレイヤー${pid.substring(0,8)}...`;
                    }

                    newPlayerStates[pid] = {
                        assignedMazeOwnerId: assignedMazeOwnerId,
                        myOriginalMazeOwnerId: pid, // For displaying their own maze later
                        position: updatedMazes[assignedMazeOwnerId].start, // Start on assigned maze
                        score: 0, revealedCells: {}, revealedWalls: [], isTurnSkipped: false,
                        goalTime: null, rank: null,
                        battledOpponents: [], inBattleWith: null, battleBet: null, // Standard battle fields
                        secretObjective: secretObjective, // Extra mode
                        personalTimerEnd: gameType === 'extra' ? Timestamp.fromMillis(Date.now() + EXTRA_MODE_PERSONAL_TIME_LIMIT * 1000) : null,
                        personalTimeUsed: 0,
                        declaredAction: null, allianceId: null, hasDeclaredThisTurn: false, // Extra mode
                        privateLog: [], sabotageEffects: [], negotiationOffers: [], // Extra mode
                        sharedDataFromAllies: { walls: [], scoutLogs: [] }, // Extra mode
                        temporaryPriorityBoost: 0, // Extra mode
                        betrayedAllies: [], // Extra mode for SAB_BETRAY_AND_WIN
                        playerName: playerName // プレイヤー名を保存
                    };
                });

                const gameUpdates = {
                    playerStates: newPlayerStates,
                    turnOrder: playerIds, // Store the shuffled turn order
                    currentTurnPlayerId: playerIds[0], // First player in shuffled order
                    goalCount: 0,
                    playerGoalOrder: [],
                };

                if (gameType === 'extra') {
                    gameUpdates.status = "playing"; // Or "extraModeStarting"
                    gameUpdates.currentExtraModePhase = "declaration"; // Start with declaration phase
                    gameUpdates.declarations = {}; // Initialize for new round
                    playerIds.forEach(pid => { gameUpdates.declarations[pid] = { type: null, submittedAt: null}; });
                    gameUpdates.phaseTimerEnd = Timestamp.fromMillis(Date.now() + DECLARATION_PHASE_DURATION * 1000);
                    console.log("Extra mode starting, declaration phase.");
                } else { // Standard mode
                     gameUpdates.status = "playing";
                }
                
                await updateDoc(gameDocRef, gameUpdates);
            }
        } catch (error) {
            console.error("Error submitting maze:", error);
            setMessage("迷路の送信に失敗しました: " + error.message);
        }
    };
    
    const activeWallsCount = myMazeWalls.filter(w => w.active).length;
    const pathExists = startPos && goalPos && isPathPossible(startPos, goalPos, myMazeWalls, currentGridSize);
    const canSubmit = startPos && goalPos && activeWallsCount === WALL_COUNT && pathExists && gameData && (!gameData.mazes || !gameData.mazes[userId]);

    return (
        <div className="flex flex-col items-center justify-start min-h-screen bg-slate-100 p-4 pt-8">
            {/* ヘッダー部分 */}
            <div className="w-full max-w-2xl flex justify-between items-center mb-4">
                <h1 className="text-3xl font-bold text-slate-800">コース作成 {gameType === 'extra' && "(エクストラモード)"}</h1>
                <button
                    onClick={() => setScreen('lobby')}
                    className="bg-red-500 hover:bg-red-600 text-white px-4 py-2 rounded font-semibold"
                >
                    ホームに戻る
                </button>
            </div>
            {gameId && <p className="text-sm text-slate-600 mb-1">ゲームID: {gameId.substring(0,8)}...</p>}
            {userId && <p className="text-sm text-slate-600 mb-1">あなた: {currentUserName} ({gameMode})</p>}
            
            {/* 接続状態表示 */}
            <div className="mb-2 flex items-center justify-center space-x-2">
                <div className={`w-3 h-3 rounded-full ${
                    connectionStatus === 'connected' ? 'bg-green-500' :
                    connectionStatus === 'cached' ? 'bg-yellow-500' :
                    connectionStatus === 'disconnected' ? 'bg-red-500' :
                    'bg-gray-500'
                }`}></div>
                <span className="text-xs text-slate-600">
                    {connectionStatus === 'connected' ? 'リアルタイム同期中' :
                     connectionStatus === 'cached' ? 'キャッシュから表示中' :
                     connectionStatus === 'disconnected' ? '接続に問題があります' :
                     '接続エラー'}
                </span>
                <span className="text-xs text-slate-400">
                    (最終同期: {new Date(lastSyncTime).toLocaleTimeString()})
                </span>
            </div>
            
            {gameType === 'extra' && creationTimeLeft !== null && 
                <p className="text-lg font-semibold text-red-600 mb-2">
                    <Clock size={20} className="inline mr-1"/> 残り時間: {formatTime(creationTimeLeft)}
                </p>
            }
            
            <div className={`bg-white p-6 rounded-lg shadow-xl mb-6 w-full ${currentGridSize > 6 ? 'max-w-2xl' : 'max-w-lg'}`}>
                <div className="flex justify-center space-x-1 sm:space-x-2 mb-4">
                    <button onClick={() => setSettingMode('wall')} className={`px-2 sm:px-4 py-2 rounded-md font-semibold text-xs sm:text-sm ${settingMode === 'wall' ? 'bg-blue-500 text-white' : 'bg-gray-200 text-gray-700 hover:bg-gray-300'}`}>壁 ({activeWallsCount}/{WALL_COUNT})</button>
                    <button onClick={() => setSettingMode('start')} className={`px-2 sm:px-4 py-2 rounded-md font-semibold text-xs sm:text-sm ${settingMode === 'start' ? 'bg-green-500 text-white' : 'bg-gray-200 text-gray-700 hover:bg-gray-300'}`}>S {startPos ? <CheckCircle size={14} className="inline"/> : <XCircle size={14} className="inline"/>}</button>
                    <button onClick={() => setSettingMode('goal')} className={`px-2 sm:px-4 py-2 rounded-md font-semibold text-xs sm:text-sm ${settingMode === 'goal' ? 'bg-red-500 text-white' : 'bg-gray-200 text-gray-700 hover:bg-gray-300'}`}>G {goalPos ? <CheckCircle size={14} className="inline"/> : <XCircle size={14} className="inline"/>}</button>
                </div>
                <p className="text-center text-sm text-slate-700 mb-4 h-12 overflow-y-auto" dangerouslySetInnerHTML={{ __html: message }}></p>
                <div className="flex justify-center">
                     <MazeGrid
                        isCreating={true}
                        wallSettings={myMazeWalls}
                        onWallClick={handleWallClick}
                        onCellClick={handleCellClick}
                        startPos={startPos}
                        goalPos={goalPos}
                        gridSize={currentGridSize}
                    />
                </div>
                <button
                    onClick={handleSubmitMaze}
                    disabled={!canSubmit}
                    className="mt-6 w-full bg-green-600 hover:bg-green-700 text-white font-bold py-3 px-4 rounded-lg text-lg transition-colors disabled:bg-gray-400 disabled:cursor-not-allowed"
                >
                    迷路を確定
                </button>
            </div>
            {gameData && gameData.players && (
                <div className={`bg-white p-4 rounded-lg shadow-md w-full ${currentGridSize > 6 ? 'max-w-2xl' : 'max-w-lg'} mb-4`}>
                    <h3 className="text-lg font-semibold mb-2">参加プレイヤー ({gameData.players.length}/{gameData.mode === '2player' ? 2 : 4}人):</h3>
                    <ul className="list-disc list-inside text-sm">
                        {gameData.players.map(pid => (
                            <li key={pid} className={pid === userId ? 'font-bold' : ''}>
                                {getUserNameById(pid)} {gameData.mazes && gameData.mazes[pid] ? <CheckCircle size={16} className="inline text-green-500 ml-1"/> : <span className="text-xs text-gray-500">(作成中)</span>}
                            </li>
                        ))}
                    </ul>
                </div>
            )}
        </div>
    );
};

export default CourseCreationScreen;
