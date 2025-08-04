import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
    doc, updateDoc, serverTimestamp, arrayUnion,
    orderBy, limit, runTransaction, increment, collection, addDoc, query, onSnapshot, deleteField
} from 'firebase/firestore';
import {
    ArrowUp, ArrowDown, ArrowLeft, ArrowRight, User,
    Swords, Clock, Trophy, HelpCircle, Mic, AlertTriangle, Heart
} from 'lucide-react';

import { db, appId } from '../firebase';
import MazeGrid from './MazeGrid';
import BattleModal from './BattleModal';
import GameOverModal from './GameOverModal';
import { HelpOverlay } from './HelpOverlay';
import ReviewModeScreen from './ReviewModeScreen';
import ChatSection from './ChatSection';
import SpeechTemplateModal from './SpeechTemplateModal';
import DebugControls from './DebugControls';
import {
    STANDARD_GRID_SIZE
} from '../constants';
import { formatTime, isPathPossible, getUsername } from '../utils';

const PlayScreen = ({ userId, setScreen, gameMode, debugMode }) => {
    const [gameId, setGameId] = useState(null);
    const [gameData, setGameData] = useState(null);
    const [myPlayerState, setMyPlayerState] = useState(null);
    const [mazeToPlayData, setMazeToPlayData] = useState(null);
    const [myCreatedMazeData, setMyCreatedMazeData] = useState(null);
    const [playerSolvingMyMaze, setPlayerSolvingMyMaze] = useState(null);
    const [message, setMessage] = useState("ゲーム開始！");
    const [showOpponentWallsDebug, setShowOpponentWallsDebug] = useState(false);
    const [chatMessages, setChatMessages] = useState([]);
    const [chatInput, setChatInput] = useState("");
    const chatLogRef = useRef(null);
    const [isBattleModalOpen, setIsBattleModalOpen] = useState(false);
    const [viewingMazeOwnerId, setViewingMazeOwnerId] = useState(null); // 四人対戦で右側に表示する迷路の作成者ID
    const [gameType, setGameType] = useState('standard');
    
    // ヘルプオーバーレイ表示状態
    const [showHelpOverlay, setShowHelpOverlay] = useState(false);
    
    // 発言テンプレートモーダル表示状態
    const [showSpeechTemplate, setShowSpeechTemplate] = useState(false);
    
    // 感想戦モード状態管理
    const [showReviewMode, setShowReviewMode] = useState(false);
    
    // リザルト画面状態管理
    const [showResultModal, setShowResultModal] = useState(false);
    const [resultData, setResultData] = useState(null);
    
    // 移動中状態管理（2秒待機機能）
    const [isMoving, setIsMoving] = useState(false);
    const [hitWalls, setHitWalls] = useState([]); // プレイヤーがぶつかった壁を記録
    const [canPressButton, setCanPressButton] = useState(true); // 移動ボタンを押せる状態を管理
    
    // バトル処理中フラグ（重複実行防止）
    const [isBattleProcessing, setIsBattleProcessing] = useState(false);
    
    // バトル結果ポップアップ（当事者のみに表示）
    const [showBattleResultPopup, setShowBattleResultPopup] = useState(false);
    const [battleResultData, setBattleResultData] = useState(null);
    
    // バトル勝利画面（豪華版）
    const [showBattleVictoryScreen, setShowBattleVictoryScreen] = useState(false);
    const [victoryScreenData, setVictoryScreenData] = useState(null);
    
    // バトル待機ポップアップ（当事者用 - 相手の入力待ち）
    const [showBattleWaitingPopup, setShowBattleWaitingPopup] = useState(false);
    
    // ホームに戻る確認ダイアログ
    const [showExitConfirmDialog, setShowExitConfirmDialog] = useState(false);
    
    // ゲーム中断通知ダイアログ
    const [showGameInterruptedDialog, setShowGameInterruptedDialog] = useState(false);
    const [interruptedByPlayerName, setInterruptedByPlayerName] = useState('');

    // バトル待機ダイアログ（非当事者用）
    const [showBattleWaitDialog, setShowBattleWaitDialog] = useState(false);
    const [battleParticipants, setBattleParticipants] = useState([]);

    // ゴール通知ポップアップ（四人対戦用）
    const [showGoalNotificationPopup, setShowGoalNotificationPopup] = useState(false);
    const [goalNotificationData, setGoalNotificationData] = useState(null);

    // デバッグモード用のプレイヤー切り替え機能
    const [debugCurrentPlayerId, setDebugCurrentPlayerId] = useState(userId);
    const [debugPlayerStates, setDebugPlayerStates] = useState({});
    const [debugMazeData, setDebugMazeData] = useState({});

    // 実際に使用するplayerStateとuserIdを決定（デバッグ時は表示のみ切り替え、機能は同じ）
    const effectiveUserId = debugMode ? debugCurrentPlayerId : userId;
    const effectivePlayerState = debugMode ? debugPlayerStates[debugCurrentPlayerId] : myPlayerState;

    // プレイヤー名のマッピング
    const playerNames = gameData?.playerNames || {};

    // ユーザーIDからユーザー名を取得するヘルパー関数（デバッグ表示用も含む）
    const getUserNameById = (userId) => {
        // まずplayerStatesから取得を試行
        if (gameData?.playerStates?.[userId]?.playerName) {
            return gameData.playerStates[userId].playerName;
        }
        
        // 次にplayerNamesマップから取得を試行
        if (gameData?.playerNames && gameData.playerNames[userId]) {
            return gameData.playerNames[userId];
        }
        
        // デバッグプレイヤーの場合
        if (userId.startsWith('debug_player')) {
            const playerNumber = userId.charAt(12) || userId.split('_')[2];
            return `デバッグプレイヤー${playerNumber}`;
        }
        
        // フォールバック：Firebase IDの一部を表示
        return `プレイヤー${userId.substring(0,8)}...`;
    };

    // ユーザー名を取得（デバッグモード時は切り替えられたプレイヤーの名前を取得）
    const currentUserName = debugMode ? getUserNameById(effectiveUserId) : (getUsername() || "未設定ユーザー");

    // 追加: 不足している変数の定義（デバッグモードでは切り替えられたプレイヤーの権限で判定）
    const isMyStandardTurn = gameData?.currentTurnPlayerId === (debugMode ? effectiveUserId : userId) && 
                            gameType === 'standard' && 
                            !(debugMode ? effectivePlayerState : myPlayerState)?.goalTime; // ゴール済みの場合はターンなし
    const inStandardBattleBetting = (debugMode ? effectivePlayerState : myPlayerState)?.inBattleWith;

    // 迷路データの読み込み（デバッグモードでは表示確認のため他プレイヤーデータも読み込み）
    useEffect(() => {
        if (!gameData || !myPlayerState) return;
        
        console.log("Loading maze data for game type:", gameType);
        console.log("Game data:", gameData);
        console.log("My player state:", myPlayerState);
        
        // デバッグモード時の表示確認用：切り替えられたプレイヤーの状態も確認
        if (debugMode && effectivePlayerState) {
            console.log("Debug effective player state:", effectivePlayerState);
        }
        
        // 四人対戦モードの場合、初期表示を自分の迷路に設定
        if (gameData.mode === '4player' && !viewingMazeOwnerId) {
            setViewingMazeOwnerId(userId);
        }
        
        // 攻略する迷路の読み込み（デバッグモードでは表示確認用に切り替え対応）
        const targetPlayerState = debugMode ? effectivePlayerState : myPlayerState;
        if (targetPlayerState?.assignedMazeOwnerId && gameData.mazes) {
            const assignedMaze = gameData.mazes[targetPlayerState.assignedMazeOwnerId];
            if (assignedMaze) {
                console.log("🗺️ [Maze] Maze to play loaded:", {
                    mazeOwner: targetPlayerState.assignedMazeOwnerId,
                    goalPosition: assignedMaze.goal,
                    startPosition: assignedMaze.start,
                    gridSize: assignedMaze.gridSize,
                    wallCount: assignedMaze.walls?.length || 0,
                    debugMode,
                    effectiveUserId: effectiveUserId.substring(0, 8)
                });
                setMazeToPlayData(assignedMaze);
            } else {
                console.warn("Assigned maze not found for:", targetPlayerState.assignedMazeOwnerId);
                setMessage(`割り当てられた迷路が見つかりません: ${targetPlayerState.assignedMazeOwnerId}`);
            }
        }
        
        // 自分が作成した迷路の読み込み（スタンダードモードのみ）
        if (gameType === 'standard' && gameData.mazes?.[userId]) {
            console.log("My created maze loaded:", gameData.mazes[userId]);
            setMyCreatedMazeData(gameData.mazes[userId]);
        }
        
    }, [gameData, myPlayerState, userId, gameType, setMessage, viewingMazeOwnerId, debugMode, effectivePlayerState]);

    // hitWallsの状態をFirestoreから同期（デバッグモードでは表示確認用に切り替え対応）
    useEffect(() => {
        // デバッグモード時は表示確認のため切り替えられたプレイヤーの壁も表示
        const targetPlayerState = debugMode ? effectivePlayerState : myPlayerState;
        if (targetPlayerState?.hitWalls && Array.isArray(targetPlayerState.hitWalls)) {
            setHitWalls(targetPlayerState.hitWalls);
            console.log("🔧 [HitWalls] Synced from Firestore:", targetPlayerState.hitWalls);
            if (debugMode) {
                console.log("🔧 [DEBUG] Showing walls for player:", effectiveUserId.substring(0, 8));
            }
        }
    }, [myPlayerState?.hitWalls, debugMode, effectivePlayerState, effectiveUserId]);

    // デバッグモード時に全プレイヤーの状態を同期
    useEffect(() => {
        if (debugMode && gameData?.playerStates) {
            setDebugPlayerStates(gameData.playerStates);
            console.log("🔧 [DEBUG] Player states updated:", gameData.playerStates);
        }
    }, [debugMode, gameData?.playerStates]);

    // プレイヤー切り替え時に迷路データを更新
    useEffect(() => {
        if (debugMode && gameData?.mazes) {
            setDebugMazeData(gameData.mazes);
        }
    }, [debugMode, gameData?.mazes, debugCurrentPlayerId]);

    // Standard mode specific handlers
    const handleStandardMove = async (direction) => {
        // デバッグモードでは切り替えられたプレイヤーとして操作
        const canMove = isMyStandardTurn && !inStandardBattleBetting;
        if (!canMove || isMoving || !canPressButton) return;

        // ゴール済みプレイヤーは移動不可
        const currentPlayerState = debugMode ? effectivePlayerState : myPlayerState;
        if (currentPlayerState?.goalTime) {
            console.log("🏁 [Movement] Goal player cannot move");
            return;
        }

        console.log("🚶 [Movement] Starting move:", {
            direction,
            debugMode,
            effectiveUserId: effectiveUserId.substring(0, 8),
            actualUserId: userId.substring(0, 8),
            operatingAsUserId: debugMode ? effectiveUserId.substring(0, 8) : userId.substring(0, 8),
            currentPosition: (debugMode ? effectivePlayerState : myPlayerState)?.position,
            note: debugMode ? "Debug mode - operating as switched player" : "Normal mode"
        });

        // 移動ボタンを即座に無効化
        setCanPressButton(false);

        // デバッグモードでは切り替えられたプレイヤーの状態をチェック
        const targetPlayerState = debugMode ? effectivePlayerState : myPlayerState;
        const operatingUserId = debugMode ? effectiveUserId : userId;

        // バトル敗北による行動不能チェック
        if (targetPlayerState?.skipNextTurn) {
            setMessage("バトル敗北により1ターン行動不能です。");
            // skipNextTurnフラグをクリア
            const gameDocRef = doc(db, `artifacts/${appId}/public/data/labyrinthGames`, gameId);
            await updateDoc(gameDocRef, {
                [`playerStates.${operatingUserId}.skipNextTurn`]: null
            });
            
            // ターン進行
            if (gameType === 'standard') {
                setTimeout(() => {
                    advanceStandardTurn();
                }, 1500);
            }
            return;
        }
        
        setIsMoving(true);
        setMessage("移動中...");
        
        // 2秒待機
        await new Promise(resolve => setTimeout(resolve, 2000));
        
        const gameDocRef = doc(db, `artifacts/${appId}/public/data/labyrinthGames`, gameId);
        const { r: currentR, c: currentC } = targetPlayerState.position;
        
        let newR = currentR;
        let newC = currentC;
        
        switch(direction) {
            case 'up': newR--; break;
            case 'down': newR++; break;
            case 'left': newC--; break;
            case 'right': newC++; break;
            default: 
                setIsMoving(false);
                setCanPressButton(true); // ボタンを再度有効化
                return;
        }
        
        // デバッグモードでは切り替えられたプレイヤーの迷路データを使用
        const targetMazeData = debugMode && gameData?.mazes?.[targetPlayerState?.assignedMazeOwnerId] 
            ? gameData.mazes[targetPlayerState.assignedMazeOwnerId] 
            : mazeToPlayData;
            
        const gridSize = targetMazeData?.gridSize || STANDARD_GRID_SIZE;
        
        // 境界チェック
        if (newR < 0 || newR >= gridSize || newC < 0 || newC >= gridSize) {
            setMessage("盤外への移動はできません。ターン終了です。");
            setIsMoving(false);
            // 境界に阻まれた場合もターン終了
            if (gameType === 'standard') {
                setTimeout(() => {
                    advanceStandardTurn();
                }, 1500);
            }
            return;
        }
        
        // 壁チェック - 仕様書に基づく正確な壁判定
        // 壁は「マスとマスの間」に存在し、移動方向に応じて適切な壁座標を計算する
        const walls = targetMazeData?.walls || [];
        let hitWall = null;
        const isBlocked = walls.some(wall => {
            if (!wall.active) return false; // 非アクティブな壁は無視
            
            if (wall.type === 'horizontal') {
                // 水平壁：上下移動をブロック
                // 上に移動する場合：現在位置の上側の水平壁をチェック
                if (direction === 'up' && wall.r === currentR - 1 && wall.c === currentC) {
                    hitWall = wall;
                    return true;
                }
                // 下に移動する場合：現在位置の下側の水平壁をチェック
                if (direction === 'down' && wall.r === currentR && wall.c === currentC) {
                    hitWall = wall;
                    return true;
                }
            } else if (wall.type === 'vertical') {
                // 垂直壁：左右移動をブロック
                // 左に移動する場合：現在位置の左側の垂直壁をチェック
                if (direction === 'left' && wall.r === currentR && wall.c === currentC - 1) {
                    hitWall = wall;
                    return true;
                }
                // 右に移動する場合：現在位置の右側の垂直壁をチェック
                if (direction === 'right' && wall.r === currentR && wall.c === currentC) {
                    hitWall = wall;
                    return true;
                }
            }
            return false;
        });
        
        if (isBlocked && hitWall) {
            // 壁にぶつかった場合、その壁を記録（仕様書：壁にぶつかると壁が表示される）
            setHitWalls(prev => {
                const wallKey = `${hitWall.type}-${hitWall.r}-${hitWall.c}`;
                if (!prev.some(w => `${w.type}-${w.r}-${w.c}` === wallKey)) {
                    return [...prev, hitWall];
                }
                return prev;
            });

            // ぶつかった壁をFirestoreに保存
            try {
                const gameDocRef = doc(db, `artifacts/${appId}/public/data/labyrinthGames`, gameId);
                const wallToReveal = {
                    type: hitWall.type,
                    r: hitWall.r,
                    c: hitWall.c,
                    active: true,
                    discoveredAt: new Date().toISOString()
                };
                
                // hitWallsに追加（重複チェック付き）
                const currentHitWalls = targetPlayerState?.hitWalls || [];
                const wallKey = `${hitWall.type}-${hitWall.r}-${hitWall.c}`;
                const isAlreadyHit = currentHitWalls.some(w => `${w.type}-${w.r}-${w.c}` === wallKey);
                
                const updates = {
                    [`playerStates.${operatingUserId}.revealedWalls`]: arrayUnion(wallToReveal)
                };
                
                if (!isAlreadyHit) {
                    updates[`playerStates.${operatingUserId}.hitWalls`] = [...currentHitWalls, hitWall];
                }
                
                await updateDoc(gameDocRef, updates);
                console.log("🔧 [HitWalls] Saved to Firestore:", hitWall);
            } catch (error) {
                console.error("Error recording hit wall:", error);
            }

            setMessage(`壁に阻まれて移動できません。壁を発見しました！ ターン終了です。`);
            setIsMoving(false);
            
            // 仕様書：壁にぶつかるとターン終了
            if (gameType === 'standard') {
                setTimeout(() => {
                    advanceStandardTurn();
                }, 1500);
            }
            return;
        }
        
        try {
            // 四人対戦モードでのバトル発生チェック（ゴールマス以外でのみ発生）
            let battleOpponent = null;
            let isGoalPosition = false;
            
            // Firestore更新用のupdatesオブジェクトを先に初期化
            const updates = {
                [`playerStates.${operatingUserId}.position`]: { r: newR, c: newC },
                [`playerStates.${operatingUserId}.lastMoveTime`]: serverTimestamp(),
            };
            
            // ゴール判定を先に行う
            if (targetMazeData && newR === targetMazeData.goal.r && newC === targetMazeData.goal.c) {
                isGoalPosition = true;
            }
            
            if (gameData?.mode === '4player' && !isGoalPosition) {
                // 現在アクティブなバトルがないことを確認
                const hasActiveBattle = gameData.activeBattle && 
                                       gameData.activeBattle.status && 
                                       ['betting', 'fighting'].includes(gameData.activeBattle.status);
                
                // この位置で既にバトルが発生したかチェック（1マス1バトル制御）
                const positionKey = `${newR}-${newC}`;
                const battleHistoryKey = `battleHistory.${positionKey}`;
                const hasPositionBattleHistory = gameData[battleHistoryKey];
                
                // アクティブなバトルがなく、この位置でまだバトルが発生していない場合のみ新しいバトルをチェック
                if (!hasActiveBattle && !hasPositionBattleHistory) {
                    // 移動先に他のプレイヤーがいるかチェック（ゴール済みプレイヤーを除外）
                    const otherPlayersAtSamePosition = Object.entries(gameData.playerStates || {})
                        .filter(([pid, ps]) => {
                            // 自分以外で、位置情報があり、ゴールしていないプレイヤーのみ
                            return pid !== operatingUserId && 
                                   ps.position && 
                                   !ps.goalTime && // ゴール済みプレイヤーは除外
                                   ps.position.r === newR && 
                                   ps.position.c === newC;
                        });
                    
                    if (otherPlayersAtSamePosition.length > 0) {
                        // 複数プレイヤーがいる場合はランダムに1人を選択
                        const randomIndex = Math.floor(Math.random() * otherPlayersAtSamePosition.length);
                        const selectedOpponent = otherPlayersAtSamePosition[randomIndex];
                        battleOpponent = selectedOpponent[0]; // プレイヤーID
                        
                        console.log("🥊 [Battle] Multiple players detected, randomly selected opponent:", {
                            movingPlayer: operatingUserId.substring(0, 8),
                            availableOpponents: otherPlayersAtSamePosition.map(([pid]) => pid.substring(0, 8)),
                            selectedOpponent: battleOpponent.substring(0, 8),
                            position: { r: newR, c: newC },
                            randomIndex,
                            totalCandidates: otherPlayersAtSamePosition.length
                        });
                        
                        // バトル履歴を記録（この位置では今後バトル発生しない）
                        updates[battleHistoryKey] = {
                            participants: [operatingUserId, battleOpponent].sort(),
                            timestamp: serverTimestamp(),
                            battleInitiator: operatingUserId
                        };
                    } else {
                        // ゴール済みプレイヤーとの重複をログに記録
                        const goaledPlayerAtSamePosition = Object.entries(gameData.playerStates || {})
                            .filter(([pid, ps]) => pid !== operatingUserId && ps.position && ps.goalTime)
                            .find(([pid, ps]) => ps.position.r === newR && ps.position.c === newC);
                        
                        if (goaledPlayerAtSamePosition) {
                            console.log("🏁 [Battle] Skipped battle with goaled player:", {
                                player1: operatingUserId.substring(0, 8),
                                goaledPlayer: goaledPlayerAtSamePosition[0].substring(0, 8),
                                position: { r: newR, c: newC }
                            });
                        }
                    }
                } else if (hasPositionBattleHistory) {
                    console.log("📍 [Battle] Position already had battle, skipping:", {
                        position: { r: newR, c: newC },
                        positionKey,
                        movingPlayer: operatingUserId.substring(0, 8)
                    });
                }
            }

            // 新しいセルの発見ボーナス（四人対戦のみ、初回訪問時のみ）
            let moveMessage = "";
            const cellKey = `${newR}-${newC}`;
            const revealedCells = targetPlayerState?.revealedCells || {};
            const isFirstVisit = !revealedCells[cellKey];
            
            // 移動先の他プレイヤー情報を取得（メッセージ表示用）
            const otherPlayersAtDestination = Object.entries(gameData.playerStates || {})
                .filter(([pid, ps]) => {
                    return pid !== operatingUserId && 
                           ps.position && 
                           !ps.goalTime && 
                           ps.position.r === newR && 
                           ps.position.c === newC;
                });
            
            // 訪問したセルを記録（全モード共通）
            if (isFirstVisit) {
                updates[`playerStates.${operatingUserId}.revealedCells.${cellKey}`] = true;
            }
            
            if (gameData?.mode === '4player' && isFirstVisit) {
                updates[`playerStates.${operatingUserId}.score`] = increment(1);
                moveMessage = `(${newC +1},${newR +1})に移動！ +1pt (初回訪問)`;
                
                // 他プレイヤーがいる場合の追加情報
                if (otherPlayersAtDestination.length > 0) {
                    const otherPlayerNames = otherPlayersAtDestination.map(([pid]) => getUserNameById(pid)).join('、');
                    if (battleOpponent) {
                        moveMessage += ` | ${otherPlayerNames}と同じマス`;
                    } else {
                        moveMessage += ` | ${otherPlayerNames}と同じマス (バトル済み)`;
                    }
                }
                
                setMessage(moveMessage);
                console.log("🎯 [Points] First visit bonus awarded:", {
                    playerId: operatingUserId.substring(0, 8),
                    position: { r: newR, c: newC },
                    cellKey,
                    previouslyVisited: Object.keys(revealedCells).length,
                    otherPlayers: otherPlayersAtDestination.length
                });
            } else {
                moveMessage = `(${newC +1},${newR +1})に移動しました。`;
                if (!isFirstVisit) {
                    moveMessage += " (訪問済み)";
                } else if (gameData?.mode === '2player') {
                    moveMessage += " (初回訪問)";
                }
                
                // 他プレイヤーがいる場合の追加情報
                if (otherPlayersAtDestination.length > 0) {
                    const otherPlayerNames = otherPlayersAtDestination.map(([pid]) => getUserNameById(pid)).join('、');
                    if (battleOpponent) {
                        moveMessage += ` | ${otherPlayerNames}と同じマス`;
                    } else {
                        moveMessage += ` | ${otherPlayerNames}と同じマス (バトル済み)`;
                    }
                }
                
                setMessage(moveMessage);
                console.log("🚶 [Points] No bonus - already visited or not 4-player mode:", {
                    playerId: operatingUserId.substring(0, 8),
                    position: { r: newR, c: newC },
                    cellKey,
                    isFirstVisit,
                    mode: gameData?.mode,
                    alreadyVisited: !isFirstVisit,
                    otherPlayers: otherPlayersAtDestination.length
                });
            }
            
            // ゴール判定（デバッグ情報付き）
            console.log("🔍 [Goal Check]", {
                mazeToPlayData: !!targetMazeData,
                playerPosition: { r: newR, c: newC },
                goalPosition: targetMazeData ? { r: targetMazeData.goal.r, c: targetMazeData.goal.c } : null,
                hasGoalTime: !!targetPlayerState.goalTime,
                debugMode,
                effectiveUserId: effectiveUserId.substring(0, 8),
                operatingUserId: operatingUserId.substring(0, 8)
            });
            
            if (targetMazeData && newR === targetMazeData.goal.r && newC === targetMazeData.goal.c && !targetPlayerState.goalTime) {
                console.log("🎯 [Goal] Goal reached!", {
                    playerPosition: { r: newR, c: newC },
                    goalPosition: { r: targetMazeData.goal.r, c: targetMazeData.goal.c },
                    mazeOwner: targetPlayerState.assignedMazeOwnerId,
                    debugMode: debugMode,
                    effectiveUserId: effectiveUserId.substring(0, 8),
                    operatingUserId: operatingUserId.substring(0, 8)
                });
                
                updates[`playerStates.${operatingUserId}.goalTime`] = serverTimestamp();
                updates.goalCount = increment(1);
                
                // リザルトデータを準備
                const currentGoalCount = (gameData.goalCount || 0);
                let goalPoints = 0;
                let rankMessage = "";
                
                // 四人対戦モードでのゴール順位によるポイント付与
                if (gameData?.mode === '4player') {
                    const goalOrder = [20, 15, 10, 0]; // 1位, 2位, 3位, 4位のポイント
                    goalPoints = goalOrder[currentGoalCount] || 0;
                    if (goalPoints > 0) {
                        updates[`playerStates.${operatingUserId}.score`] = increment(goalPoints);
                    }
                    rankMessage = `${currentGoalCount + 1}位でゴール達成！`;
                    setMessage(`ゴール達成！${currentGoalCount + 1}位 +${goalPoints}pt`);
                } else if (gameData?.mode === '2player') {
                    // 二人対戦モード：先着順で勝負
                    rankMessage = "ゴール達成！勝利です！";
                    setMessage("🎉 ゴール達成！勝利です！");
                } else {
                    rankMessage = "ゴール達成！";
                    setMessage("ゴール達成！");
                }
                
                // リザルト画面のデータを設定（四人対戦では3人目がゴールするまで表示しない）
                if (gameData?.mode === '2player') {
                    // 二人対戦：ゴールしたらすぐに結果表示
                    setTimeout(() => {
                        setResultData({
                            isGoal: true,
                            rank: currentGoalCount + 1,
                            points: goalPoints,
                            message: rankMessage,
                            totalScore: (targetPlayerState.score || 0) + goalPoints,
                            goalTime: new Date()
                        });
                        setShowResultModal(true);
                    }, 1000);
                } else if (gameData?.mode === '4player') {
                    // 四人対戦：3人目がゴールした時点でゲーム終了、それまでは続行
                    console.log("🏆 [Goal] 4-player mode goal achieved:", {
                        goalOrder: currentGoalCount + 1,
                        totalGoaled: currentGoalCount + 1,
                        message: "ゲーム続行中（3人目のゴールまで待機）"
                    });
                    // 3人目がゴールするまではリザルト画面を表示しない
                    // ゲーム終了判定は別のuseEffectで行う
                }
            }

            // バトル発生処理
            if (battleOpponent && gameData?.mode === '4player') {
                // 相手プレイヤーが既にバトル中でないかを確認
                const opponentState = gameData.playerStates[battleOpponent];
                const currentPlayerState = gameData.playerStates[operatingUserId];
                
                const opponentInBattle = opponentState?.inBattleWith || 
                                       (gameData.activeBattle?.participants?.includes(battleOpponent));
                const currentPlayerInBattle = currentPlayerState?.inBattleWith || 
                                            (gameData.activeBattle?.participants?.includes(operatingUserId));
                
                // ゴール済みプレイヤーチェック
                const opponentIsGoaled = opponentState?.goalTime;
                const currentPlayerIsGoaled = currentPlayerState?.goalTime;
                
                // 重複バトル防止：この位置でのバトルが既に存在しないかチェック
                const positionKey = `${newR}-${newC}`;
                const existingBattleAtPosition = gameData.activeBattle && 
                    (gameData.activeBattle.position === positionKey || 
                     gameData.activeBattle.positionKey === positionKey);
                
                // 同じ組み合わせのプレイヤー間でのバトルが既に存在しないかチェック
                const participantPair = [operatingUserId, battleOpponent].sort();
                const existingBattleWithSameParticipants = gameData.activeBattle && 
                    gameData.activeBattle.participants && 
                    gameData.activeBattle.participants.sort().join(',') === participantPair.join(',');
                
                // バトルID重複チェック（追加保護）
                const newBattleId = `battle_${Date.now()}_${participantPair.join('-')}_${positionKey}_${Math.random().toString(36).substring(2, 8)}`;
                const existingBattleId = gameData.activeBattle?.battleId;
                
                // 処理済みバトルIDチェック（クライアントサイド重複防止）
                const alreadyProcessed = window.processedBattleIds && 
                    window.processedBattleIds.some(id => 
                        id.includes(participantPair.join('-')) && 
                        id.includes(positionKey)
                    );
                
                console.log("🥊 [Battle] Duplicate prevention check:", {
                    positionKey,
                    participantPair: participantPair.join(','),
                    existingBattleAtPosition,
                    existingBattleWithSameParticipants,
                    existingBattleId,
                    newBattleId,
                    alreadyProcessed,
                    canStartBattle: !opponentInBattle && !currentPlayerInBattle && !opponentIsGoaled && !currentPlayerIsGoaled && 
                        !existingBattleAtPosition && !existingBattleWithSameParticipants && !alreadyProcessed
                });
                
                if (!opponentInBattle && !currentPlayerInBattle && !opponentIsGoaled && !currentPlayerIsGoaled && 
                    !existingBattleAtPosition && !existingBattleWithSameParticipants && !alreadyProcessed) {
                    console.log("🥊 [Battle] Starting new battle:", {
                        player1: operatingUserId.substring(0, 8),
                        player2: battleOpponent.substring(0, 8),
                        position: { r: newR, c: newC },
                        positionKey,
                        battleId: newBattleId,
                        preventedDuplicates: {
                            existingBattleAtPosition,
                            existingBattleWithSameParticipants,
                            alreadyProcessed
                        }
                    });
                    
                    // バトル状態を設定（強化された重複防止情報を含める）
                    updates.activeBattle = {
                        participants: participantPair, // ソート済み
                        startTime: serverTimestamp(),
                        status: 'betting',
                        position: { r: newR, c: newC }, // 座標オブジェクト
                        positionKey: positionKey, // 文字列キー
                        participantPair: participantPair.join('-'), // 参加者ペア文字列
                        battleId: newBattleId, // ユニークなバトルID
                        processing: false
                    };
                    
                    // 処理済みバトルIDを記録（クライアントサイド重複防止）
                    if (!window.processedBattleIds) {
                        window.processedBattleIds = [];
                    }
                    window.processedBattleIds.push(newBattleId);
                    
                    // 古いバトルIDを削除（メモリリーク防止）
                    if (window.processedBattleIds.length > 20) {
                        window.processedBattleIds = window.processedBattleIds.slice(-10);
                    }
                    
                    // 両プレイヤーのバトル状態をリセット
                    updates[`playerStates.${operatingUserId}.battleBet`] = null;
                    updates[`playerStates.${battleOpponent}.battleBet`] = null;
                    updates[`playerStates.${operatingUserId}.inBattleWith`] = battleOpponent;
                    updates[`playerStates.${battleOpponent}.inBattleWith`] = operatingUserId;
                    
                    // オープンチャットに通知（ランダム選択されたことを明示）
                    const myName = getUserNameById(operatingUserId);
                    const opponentName = getUserNameById(battleOpponent);
                    
                    // 移動先に複数プレイヤーがいた場合の説明を追加
                    const otherPlayersAtPosition = Object.entries(gameData.playerStates || {})
                        .filter(([pid, ps]) => {
                            return pid !== operatingUserId && 
                                   ps.position && 
                                   !ps.goalTime && 
                                   ps.position.r === newR && 
                                   ps.position.c === newC;
                        });
                    
                    if (otherPlayersAtPosition.length > 1) {
                        const allOpponentNames = otherPlayersAtPosition.map(([pid]) => getUserNameById(pid)).join('、');
                        sendSystemChatMessage(`🎯 (${newC + 1},${newR + 1})に複数プレイヤー検出！ランダム選択の結果...`);
                        sendSystemChatMessage(`⚔️ ${myName} vs ${opponentName} のバトル開始！（候補: ${allOpponentNames}）`);
                    } else {
                        sendSystemChatMessage(`⚔️ ${myName}と${opponentName}でバトルが発生しました！`);
                    }
                    
                    // バトルモーダルを開く（この時点では当事者のみ）
                    setIsBattleModalOpen(true);
                    setMessage("バトル発生！ポイントを賭けてください。");
                } else {
                    console.log("⚠️ [Battle] Cannot start battle:", {
                        currentPlayerInBattle,
                        opponentInBattle,
                        currentPlayerIsGoaled,
                        opponentIsGoaled,
                        reason: opponentIsGoaled ? "opponent is goaled" : 
                               currentPlayerIsGoaled ? "current player is goaled" :
                               "one or both players already in battle"
                    });
                }
            }
            
            // 移動成功時はターンを継続（壁にぶつかるまで連続移動可能）
            // デバッグモードでも通常モードと同様に、壁にぶつかるまでターンを継続
            // 自動ターン切り替えは行わない
            
            // Firebaseのデータを更新
            try {
                await updateDoc(gameDocRef, updates);
                console.log("✅ [Movement] Successfully updated game data:", {
                    playerId: operatingUserId.substring(0, 8),
                    newPosition: { r: newR, c: newC },
                    hasBattle: !!battleOpponent,
                    updatesKeys: Object.keys(updates),
                    debugMode
                });
            } catch (error) {
                console.error("❌ [Movement] Failed to update game data:", error);
                setMessage("移動の更新に失敗しました。");
                return;
            }
            
            // 移動成功時は連続移動を許可（ゴール到達時以外）
            // 壁にぶつかるまで自分のターンを継続
            if (!(targetMazeData && newR === targetMazeData.goal.r && newC === targetMazeData.goal.c)) {
                setCanPressButton(true);
                // 連続移動可能のメッセージを表示
                if (gameType === 'standard') {
                    setMessage(`${moveMessage} 連続移動可能です。`);
                }
            } else {
                // ゴール到達時は自動的にターンを次のプレイヤーに移す
                if (gameType === 'standard') {
                    console.log("🏁 [Goal] Auto-advancing turn after goal achievement");
                    setTimeout(() => {
                        advanceStandardTurn();
                    }, 1500); // 1.5秒後にターン進行
                }
            }
            
        } catch (error) {
            console.error("Error moving:", error);
            setMessage("移動に失敗しました。");
            setCanPressButton(true); // エラー時もボタンを再度有効化
        } finally {
            setIsMoving(false);
        }
    };

    const handleStandardBattleBet = async (betAmount) => {
        if (!gameData?.activeBattle) return;
        
        try {
            const gameDocRef = doc(db, `artifacts/${appId}/public/data/labyrinthGames`, gameId);
            
            // デバッグモード時は切り替えられたプレイヤーとして賭ける
            const bettingUserId = debugMode ? effectiveUserId : userId;
            
            // 自分の賭けポイントを記録
            const updates = {
                [`playerStates.${bettingUserId}.battleBet`]: betAmount,
                [`playerStates.${bettingUserId}.score`]: increment(-betAmount) // 賭けたポイントを減らす
            };
            
            await updateDoc(gameDocRef, updates);
            
            setIsBattleModalOpen(false);
            setMessage("ポイントを賭けました。相手の入力を待っています...");
            
        } catch (error) {
            console.error("Error placing battle bet:", error);
            setMessage("賭けに失敗しました。");
        }
    };

    // バトル結果処理
    const processBattleResult = async (battle) => {
        if (!battle || !battle.participants || battle.participants.length !== 2) return;
        
        // 既に処理中のバトルかチェック（重複実行防止）
        if (battle.status === 'completed' || battle.processing || isBattleProcessing) return;
        
        // 追加の重複防止：バトルIDチェック
        const battleId = battle.battleId;
        if (!battleId) {
            console.warn("🥊 [Battle] No battleId found, skipping processing");
            return;
        }
        
        // 既に処理済みのバトルIDかチェック（ローカル状態での重複防止）
        if (window.processedBattleIds && window.processedBattleIds.includes(battleId)) {
            console.log("🥊 [Battle] Battle already processed:", battleId);
            return;
        }
        
        console.log("🥊 [Battle] Starting battle result processing for battleId:", battleId);
        setIsBattleProcessing(true);
        
        // 処理済みバトルIDを記録
        if (!window.processedBattleIds) {
            window.processedBattleIds = [];
        }
        window.processedBattleIds.push(battleId);
        
        // 古いバトルIDを削除（メモリリーク防止）
        if (window.processedBattleIds.length > 20) {
            window.processedBattleIds = window.processedBattleIds.slice(-10);
        }
        
        try {
            const gameDocRef = doc(db, `artifacts/${appId}/public/data/labyrinthGames`, gameId);
            
            // トランザクションを使用して重複実行を防止
            await runTransaction(db, async (transaction) => {
                const gameDoc = await transaction.get(gameDocRef);
                if (!gameDoc.exists()) {
                    throw new Error("Game document does not exist");
                }
                
                const currentData = gameDoc.data();
                const currentBattle = currentData.activeBattle;
                
                // 再度チェック：既に処理済みかまたは異なるバトルか確認
                if (!currentBattle || 
                    currentBattle.battleId !== battleId || 
                    currentBattle.status === 'completed' || 
                    currentBattle.processing) {
                    console.log("🥊 [Battle] Battle already processed or changed, skipping");
                    return;
                }
                
                // 処理中フラグを設定
                transaction.update(gameDocRef, {
                    'activeBattle.processing': true
                });
                
                const [player1, player2] = battle.participants;
                const player1State = currentData.playerStates[player1];
                const player2State = currentData.playerStates[player2];
                
                const player1Bet = player1State?.battleBet || 0;
                const player2Bet = player2State?.battleBet || 0;
                
                console.log("🥊 [Battle] Processing battle result:", {
                    player1: player1.substring(0, 8),
                    player2: player2.substring(0, 8),
                    player1Bet,
                    player2Bet
                });
                
                let winner = null;
                let loser = null;
                
                if (player1Bet > player2Bet) {
                    winner = player1;
                    loser = player2;
                } else if (player2Bet > player1Bet) {
                    winner = player2;
                    loser = player1;
                } // 同じ場合は引き分け
                
                const updates = {
                    // バトル状態をクリア
                    [`playerStates.${player1}.inBattleWith`]: null,
                    [`playerStates.${player2}.inBattleWith`]: null,
                    [`playerStates.${player1}.battleBet`]: null,
                    [`playerStates.${player2}.battleBet`]: null,
                    activeBattle: null
                };
                
                if (winner) {
                    // 勝者に5ポイント付与
                    updates[`playerStates.${winner}.score`] = increment(5);
                    // 敗者に1ターン行動不能状態を付与
                    updates[`playerStates.${loser}.skipNextTurn`] = true;
                }
                
                // トランザクション内でアップデート
                transaction.update(gameDocRef, updates);
            });
            
            // トランザクション完了後のUI更新
            const [player1, player2] = battle.participants;
            const player1State = gameData.playerStates[player1];
            const player2State = gameData.playerStates[player2];
            const player1Bet = player1State?.battleBet || 0;
            const player2Bet = player2State?.battleBet || 0;
            
            let winner = null;
            let loser = null;
            
            if (player1Bet > player2Bet) {
                winner = player1;
                loser = player2;
            } else if (player2Bet > player1Bet) {
                winner = player2;
                loser = player1;
            }
            
            if (winner) {
                const winnerName = getUserNameById(winner);
                const loserName = getUserNameById(loser);
                
                // 当事者にバトル結果ポップアップを表示
                if (winner === userId || loser === userId) {
                    setShowBattleWaitingPopup(false); // 待機ポップアップを閉じる
                    
                    // 勝利時は豪華な勝利画面を表示
                    if (winner === userId) {
                        setVictoryScreenData({
                            opponentName: loserName,
                            myBet: player1 === userId ? player1Bet : player2Bet,
                            opponentBet: player1 === userId ? player2Bet : player1Bet,
                            pointsGained: 5
                        });
                        
                        // 勝利画面を少し遅らせて表示（演出効果）
                        setTimeout(() => {
                            setShowBattleVictoryScreen(true);
                        }, 500);
                        
                        console.log("🎉 [Victory] Battle victory screen will be displayed for user:", userId.substring(0, 8));
                    } else {
                        // 敗北時は通常のポップアップ
                        setBattleResultData({
                            isWinner: false,
                            myBet: player1 === userId ? player1Bet : player2Bet,
                            opponentBet: player1 === userId ? player2Bet : player1Bet,
                            opponentName: winnerName,
                            isDraw: false
                        });
                        setShowBattleResultPopup(true);
                    }
                }
                
                // 全員にバトル結果を通知（ポイント数は非表示）
                await sendSystemChatMessage(`🏆 バトル結果: ${winnerName}の勝利！`);
                await sendSystemChatMessage(`💀 ${loserName}は次のターン行動不能になります。`);
                
                // 個人メッセージ（当事者にはポイント数を表示）
                if (winner === userId) {
                    setMessage(`🏆 バトル勝利！ +5pt`);
                } else if (loser === userId) {
                    setMessage(`💀 バトル敗北... 次のターン行動不能`);
                } else {
                    setMessage(`⚔️ バトル終了: ${winnerName}の勝利`);
                }
            } else {
                // 当事者に引き分け結果ポップアップを表示
                if (battle.participants.includes(userId)) {
                    setShowBattleWaitingPopup(false); // 待機ポップアップを閉じる
                    setBattleResultData({
                        isWinner: false,
                        myBet: player1 === userId ? player1Bet : player2Bet,
                        opponentBet: player1 === userId ? player2Bet : player1Bet,
                        opponentName: getUserNameById(player1 === userId ? player2 : player1),
                        isDraw: true
                    });
                    setShowBattleResultPopup(true);
                }
                
                await sendSystemChatMessage(`🤝 バトル結果: 引き分け`);
                setMessage(`🤝 バトル引き分け`);
            }
            
            // バトル関連状態をリセット
            setIsBattleModalOpen(false);
            
            console.log("🥊 [Battle] Battle result processed successfully");
            
        } catch (error) {
            console.error("Error processing battle result:", error);
            setMessage("バトル結果の処理に失敗しました。");
        } finally {
            setIsBattleProcessing(false);
        }
    };

    // ゲーム解散処理（完全リセット機能付き）
    const handleGameExit = async () => {
        try {
            const gameDocRef = doc(db, `artifacts/${appId}/public/data/labyrinthGames`, gameId);
            
            // プレイヤー名を取得（保存されたユーザー名を使用）
            const playerName = currentUserName;
            
            console.log("🔥 [GameExit] Starting comprehensive cleanup for user:", userId);
            
            // 1. ゲームデータからプレイヤー情報を削除
            await runTransaction(db, async (transaction) => {
                const gameSnap = await transaction.get(gameDocRef);
                if (gameSnap.exists()) {
                    const currentGameData = gameSnap.data();
                    const remainingPlayers = (currentGameData.players || []).filter(pid => pid !== userId);
                    
                    const updates = {
                        // プレイヤー状態を完全削除
                        [`playerStates.${userId}`]: deleteField(),
                        players: remainingPlayers,
                        // 関連データも削除
                        [`mazes.${userId}`]: deleteField(), // 作成した迷路も削除
                        [`declarations.${userId}`]: deleteField(), // 宣言データも削除
                        lastActivity: serverTimestamp() // 最終活動時刻を更新
                    };
                    
                    // 残りプレイヤーが0人または1人の場合はゲームを解散
                    if (remainingPlayers.length <= 1) {
                        updates.status = 'disbanded';
                        updates.disbandReason = `${playerName}が退出したため`;
                        updates.disbandedAt = serverTimestamp();
                        updates.disbandedBy = userId;
                        updates.exitVote = deleteField(); // 退出投票をクリア
                        
                        // 解散時は残りプレイヤーの状態もクリア
                        remainingPlayers.forEach(playerId => {
                            updates[`playerStates.${playerId}`] = deleteField();
                        });
                        
                        // チャットに解散メッセージを送信
                        await sendSystemChatMessage(`${playerName}が抜けたのでこのゲームは解散です。`);
                    } else {
                        // 残りプレイヤーがいる場合は退出メッセージのみ
                        await sendSystemChatMessage(`${playerName}がゲームから退出しました。`);
                        
                        // 退出投票をクリア（誰かが抜けた場合は投票無効）
                        updates.exitVote = deleteField();
                        
                        // 現在のターンプレイヤーが退出した場合、次のプレイヤーにターンを移す
                        if (currentGameData.currentTurnPlayerId === userId && remainingPlayers.length > 0) {
                            const currentIndex = currentGameData.players.indexOf(userId);
                            const nextIndex = currentIndex < remainingPlayers.length ? currentIndex : 0;
                            updates.currentTurnPlayerId = remainingPlayers[nextIndex];
                        }
                    }
                    
                    transaction.update(gameDocRef, updates);
                }
            });
            
            console.log("✅ [GameExit] Game data updated, player removed");
            
            // 2. 完全な状態リセット（ローカル状態とストレージを完全クリア）
            performCompleteStateReset();
            
            console.log("✅ [GameExit] Complete state reset performed");
            
            // 3. ロビーに戻る
            setScreen('lobby');
            
        } catch (error) {
            console.error("❌ [GameExit] Error during game exit:", error);
            setMessage("ゲーム退出処理に失敗しました。");
            // エラーが発生してもリセットは実行
            performCompleteStateReset();
            setScreen('lobby');
        }
    };

    // 完全な状態リセット処理
    const performCompleteStateReset = () => {
        console.log("🧹 [StateReset] Performing complete state reset");
        
        // 1. クリーンアップフラグを設定
        setIsCleaningUp(true);
        
        // 2. 全てのタイマーを確実にクリア
        // 各種タイマーのクリーンアップは個別に行う
        
        // 3. ローカルストレージを完全クリア
        const keysToRemove = [
            'labyrinthGameId',
            'labyrinthGameType',
            'currentUserName',
            'userId',
            'gameState',
            'playerPosition',
            'lastActivity'
        ];
        keysToRemove.forEach(key => localStorage.removeItem(key));
        
        // 4. すべての状態を初期化
        setGameId(null);
        setGameData(null);
        setMyPlayerState(null);
        setMazeToPlayData(null);
        setMyCreatedMazeData(null);
        setPlayerSolvingMyMaze(null);
        setMessage("ゲーム開始！");
        setShowOpponentWallsDebug(false);
        setChatMessages([]);
        setChatInput("");
        setIsBattleModalOpen(false);
        setViewingMazeOwnerId(null);
        setGameType('standard');
        setShowHelpOverlay(false);
        setShowSpeechTemplate(false);
        setShowReviewMode(false);
        setShowResultModal(false);
        setResultData(null);
        setIsMoving(false);
        setHitWalls([]);
        setCanPressButton(true);
        setShowExitConfirmDialog(false);
        
        // ゲーム中断関連のリセット
        setShowGameInterruptedDialog(false);
        setInterruptedByPlayerName('');
        
        // バトル関連のリセット
        setShowBattleWaitDialog(false);
        setBattleParticipants([]);
        setShowBattleResultPopup(false);
        setBattleResultData(null);
        setShowBattleWaitingPopup(false);
        setShowBattleVictoryScreen(false);
        setVictoryScreenData(null);
        
        // ゴール通知関連のリセット
        setShowGoalNotificationPopup(false);
        setGoalNotificationData(null);
        
        // 5. デバッグモード関連の状態をリセット
        setDebugCurrentPlayerId(userId);
        setDebugPlayerStates({});
        setDebugMazeData({});
        
        // 6. クリーンアップフラグをリセット（短時間遅延）
        setTimeout(() => {
            setIsCleaningUp(false);
        }, 500);
        
        console.log("✅ [StateReset] All states reset to initial values", {
            debugMode,
            actualUserId: userId.substring(0, 8),
            actualUserName: currentUserName,
            debugCurrentPlayerId: debugMode ? effectiveUserId.substring(0, 8) : 'N/A',
            note: debugMode ? 'Debug mode was active but exit was executed as actual user' : 'Normal mode operation'
        });
    };

    // ホームに戻るボタンのクリック処理
    const handleExitButtonClick = async () => {
        if (!gameData || !gameId) return;
        
        try {
            const gameDocRef = doc(db, `artifacts/${appId}/public/data/labyrinthGames`, gameId);
            
            // 常に実際のuserIdとcurrentUserNameを使用（デバッグモードでも通常と同じ動作）
            // デバッグモードはあくまで表示・操作の切り替えのみで、終了処理は本人として実行
            const exitingUserId = userId;
            const exitingUserName = currentUserName;
            
            console.log("🔄 [Exit] Starting game interruption process:", {
                debugMode,
                actualUserId: userId.substring(0, 8),
                currentUserName,
                debugCurrentPlayerId: debugMode ? effectiveUserId.substring(0, 8) : 'N/A',
                note: "Exit is always executed as the actual user, regardless of debug mode"
            });
            
            // ゲームを中断状態に設定し、他のプレイヤーに通知
            await updateDoc(gameDocRef, {
                status: 'interrupted',
                interruptedBy: exitingUserId,
                interruptedAt: serverTimestamp(),
                interruptedPlayerName: exitingUserName
            });
            
            // システムメッセージを送信
            await sendSystemChatMessage(`${exitingUserName}がゲームを中断しました。`);
            
            console.log("✅ [Exit] Game interrupted successfully, returning to lobby", {
                debugMode,
                actualUserId: userId.substring(0, 8),
                currentUserName
            });
            
            // 状態をリセットしてホームに戻る
            performCompleteStateReset();
            setScreen('lobby');
            
        } catch (error) {
            console.error("❌ [Exit] Error interrupting game:", error, {
                debugMode,
                actualUserId: userId.substring(0, 8),
                debugCurrentPlayerId: debugMode ? effectiveUserId.substring(0, 8) : 'N/A'
            });
            setMessage("ゲーム中断に失敗しました。");
            
            // エラーの場合でも強制的に戻る
            performCompleteStateReset();
            setScreen('lobby');
        }
    };

    // 緊急時の強制リセット処理（エラー発生時などに使用）
    const handleForceReset = () => {
        console.log("🚨 [ForceReset] Emergency reset triggered");
        performCompleteStateReset();
        setScreen('lobby');
    };

    // handleTrapCoordinateSelect関数の追加
    const handleTrapCoordinateSelect = (r, c) => {
        // トラップ設置機能は削除済み
        console.warn("Trap coordinate selection is deprecated");
    };

    // セルクリック時の処理を統合
    const handleCellClick = (r, c) => {
        // スタンダードモード時の移動処理（デバッグモードでは切り替えられたプレイヤーとして操作）
        const canMove = isMyStandardTurn && !inStandardBattleBetting && canPressButton;
        if (canMove) {
            const targetPlayerState = debugMode ? effectivePlayerState : myPlayerState;
            const { r: currentR, c: currentC } = targetPlayerState.position;
            const isAdjacent = (Math.abs(r - currentR) === 1 && c === currentC) || 
                              (Math.abs(c - currentC) === 1 && r === currentR);
            
            if (isAdjacent) {
                if (r < currentR) handleStandardMove('up');
                else if (r > currentR) handleStandardMove('down');
                else if (c < currentC) handleStandardMove('left');
                else if (c > currentC) handleStandardMove('right');
            } else {
                setMessage("隣接するセルにのみ移動できます。");
            }
        }
    };

    // キーボード操作の追加
    useEffect(() => {
        const handleKeyPress = (event) => {
            // デバッグモードでは切り替えられたプレイヤーとして操作
            if (isMyStandardTurn && !inStandardBattleBetting && canPressButton) {
                switch(event.key) {
                    case 'ArrowUp': 
                    case 'w': 
                    case 'W':
                        event.preventDefault();
                        handleStandardMove('up');
                        break;
                    case 'ArrowDown': 
                    case 's': 
                    case 'S':
                        event.preventDefault();
                        handleStandardMove('down');
                        break;
                    case 'ArrowLeft': 
                    case 'a': 
                    case 'A':
                        event.preventDefault();
                        handleStandardMove('left');
                        break;
                    case 'ArrowRight': 
                    case 'd': 
                    case 'D':
                        event.preventDefault();
                        handleStandardMove('right');
                        break;
                }
            }
        };

        window.addEventListener('keydown', handleKeyPress);
        return () => window.removeEventListener('keydown', handleKeyPress);
    }, [isMyStandardTurn, inStandardBattleBetting, handleStandardMove, canPressButton]);

    // ターン変更時に移動ボタンの押せる状態をリセット
    useEffect(() => {
        if (isMyStandardTurn) {
            setCanPressButton(true);
        }
    }, [isMyStandardTurn]);

    // クリーンアップフラグを追加
    const [isCleaningUp, setIsCleaningUp] = useState(false);

    // ゲームデータを読み込む useEffect を修正
    useEffect(() => {
        if (!gameId || isCleaningUp) {
            const savedGameId = localStorage.getItem('labyrinthGameId');
            const savedGameType = localStorage.getItem('labyrinthGameType');
            if (savedGameId && savedGameType && !isCleaningUp) {
                setGameId(savedGameId);
                setGameType(savedGameType);
                return;
            } else {
                performCompleteStateReset();
                setScreen('lobby');
                return;
            }
        }

        const gameDocRef = doc(db, `artifacts/${appId}/public/data/labyrinthGames`, gameId);
        const unsubscribe = onSnapshot(gameDocRef,
            (docSnap) => {
                if (isCleaningUp) return; // クリーンアップ中は処理しない
                
                if (docSnap.exists()) {
                    const data = docSnap.data();
                    console.log("Game data loaded:", data);
                    setGameData(data);
                    
                    const myState = data.playerStates?.[userId];
                    console.log("My player state:", myState);
                    setMyPlayerState(myState);
                    
                    // デバッグモード時は全プレイヤーの状態を保存
                    if (debugMode && data.playerStates) {
                        setDebugPlayerStates(data.playerStates);
                        console.log("🔧 [DEBUG] All player states updated:", data.playerStates);
                    }
                    
                    if (data.status === 'finished') {
                        // ゲーム終了時のリザルト表示
                        if (!showResultModal) {
                            const myState = data.playerStates?.[userId];
                            const allPlayers = data.players || [];
                            const goaledPlayers = allPlayers.filter(pid => data.playerStates[pid]?.goalTime);
                            const myRank = myState?.rank || (goaledPlayers.length + 1);
                            
                            setResultData({
                                isGoal: !!myState?.goalTime,
                                rank: myRank,
                                points: 0,
                                message: myState?.goalTime ? "ゴール達成！" : "ゲーム終了",
                                totalScore: myState?.score || 0,
                                goalTime: myState?.goalTime ? new Date(myState.goalTime.seconds * 1000) : new Date()
                            });
                            setShowResultModal(true);
                        }
                        return;
                    }
                    
                    // 迷路データの読み込みを修正
                    if (myState?.assignedMazeOwnerId && data.mazes) {
                        console.log("Assigned maze owner:", myState.assignedMazeOwnerId);
                        console.log("Available mazes:", Object.keys(data.mazes));
                        
                        const assignedMaze = data.mazes[myState.assignedMazeOwnerId];
                        if (assignedMaze) {
                            console.log("Maze to play loaded:", assignedMaze);
                            setMazeToPlayData(assignedMaze);
                        } else {
                            console.warn("Assigned maze not found for:", myState.assignedMazeOwnerId);
                            setMessage(`割り当てられた迷路が見つかりません: ${myState.assignedMazeOwnerId}`);
                        }
                    }
                    
                    // 自分が作成した迷路の読み込み
                    if (data.mazes?.[userId]) {
                        console.log("My created maze loaded:", data.mazes[userId]);
                        setMyCreatedMazeData(data.mazes[userId]);
                        
                        // 自分の迷路を攻略している相手プレイヤーを探す
                        const challenger = Object.entries(data.playerStates || {})
                            .find(([pid, ps]) => ps.assignedMazeOwnerId === userId && pid !== userId);
                        
                        if (challenger) {
                            setPlayerSolvingMyMaze({ id: challenger[0], ...challenger[1] });
                            console.log("Player solving my maze:", challenger[0]);
                        } else {
                            setPlayerSolvingMyMaze(null);
                        }
                    } else {
                        console.warn("My created maze not found for userId:", userId);
                    }
                } else {
                    console.error("Game document does not exist");
                    if (!isCleaningUp) {
                        setMessage("ゲームが見つかりません。ロビーに戻ります。");
                        setTimeout(() => {
                            performCompleteStateReset();
                            setScreen('lobby');
                        }, 3000);
                    }
                }
            },
            (error) => {
                console.error("Error loading game data:", error);
                if (!isCleaningUp) {
                    setMessage("ゲームデータの読み込みに失敗しました。ロビーに戻ります。");
                    setTimeout(() => {
                        performCompleteStateReset();
                        setScreen('lobby');
                    }, 3000);
                }
            }
        );
        
        return () => {
            console.log("🔄 [Cleanup] Unsubscribing game data listener");
            unsubscribe();
        };
    }, [gameId, userId, setScreen, isCleaningUp]); // isCleaningUpを依存関係に追加

    // チャットメッセージを読み込む useEffect を追加
    useEffect(() => {
        if (!gameId || !appId || isCleaningUp) return;
        
        const chatCollRef = collection(db, `artifacts/${appId}/public/data/labyrinthGames/${gameId}/chatMessages`);
        const chatQuery = query(chatCollRef, orderBy('timestamp', 'asc'), limit(50));
        
        const unsubscribe = onSnapshot(chatQuery, (snapshot) => {
            if (isCleaningUp) return; // クリーンアップ中は処理しない
            
            const messages = snapshot.docs.map(doc => ({
                id: doc.id,
                ...doc.data()
            }));
            setChatMessages(messages);
        }, (error) => {
            if (!isCleaningUp) {
                console.error("Error loading chat messages:", error);
            }
        });
        
        return () => {
            console.log("🔄 [Cleanup] Unsubscribing chat listener");
            unsubscribe();
        };
    }, [gameId, appId, isCleaningUp]);

    // ゲーム終了・ゴール達成監視
    useEffect(() => {
        if (!gameData || !gameData.players || showResultModal) return;
        
        // 他のプレイヤーのゴール達成チェック
        const goaledPlayers = gameData.players.filter(pid => 
            gameData.playerStates[pid]?.goalTime
        );
        
        console.log("🏁 [GameEnd] Monitoring game end conditions:", {
            mode: gameData.mode,
            totalPlayers: gameData.players.length,
            goaledPlayers: goaledPlayers.length,
            goaledPlayerIds: goaledPlayers.map(pid => pid.substring(0, 8)),
            myGoalTime: !!myPlayerState?.goalTime,
            debugMode
        });
        
        // 四人対戦でのゲーム終了条件チェック（ゴール済みプレイヤーも含む）
        if (gameData.mode === '4player' && goaledPlayers.length >= 3) {
            // 3人以上がゴールした時点でゲーム終了
            console.log("🏁 [GameEnd] 4-player game ended: 3 or more players reached goal");
            
            // 自分がゴール済みの場合
            if (myPlayerState?.goalTime) {
                // 自分の順位を計算
                const myGoalTime = myPlayerState.goalTime.seconds || myPlayerState.goalTime;
                const myRank = goaledPlayers.filter(pid => {
                    const otherGoalTime = gameData.playerStates[pid]?.goalTime?.seconds || gameData.playerStates[pid]?.goalTime;
                    return otherGoalTime < myGoalTime;
                }).length + 1;
                
                // ゴール順位によるポイント付与の確認
                const goalOrder = [20, 15, 10, 0]; // 1位, 2位, 3位, 4位のポイント
                const goalPoints = goalOrder[myRank - 1] || 0;
                
                setTimeout(() => {
                    setResultData({
                        isGoal: true,
                        rank: myRank,
                        points: goalPoints,
                        message: `${myRank}位でゴール達成！`,
                        totalScore: myPlayerState?.score || 0,
                        goalTime: new Date(myGoalTime * 1000)
                    });
                    setShowResultModal(true);
                }, 1000);
            } else {
                // 自分がゴールしていない場合
                const myRank = goaledPlayers.length + 1;
                
                setTimeout(() => {
                    setResultData({
                        isGoal: false,
                        rank: myRank,
                        points: 0,
                        message: "ゲーム終了",
                        totalScore: myPlayerState?.score || 0,
                        goalTime: new Date()
                    });
                    setShowResultModal(true);
                }, 2000);
            }
        }
        // 二人対戦でのゲーム終了条件チェック（未ゴールプレイヤーのみ）
        else if (!myPlayerState?.goalTime) {
            // 終了条件の判定
            let shouldShowResult = false;
            let resultMessage = "ゲーム終了";
            
            if (gameData.mode === '2player' && goaledPlayers.length >= 1) {
                // 二人対戦：1人がゴールしたら終了
                shouldShowResult = true;
                resultMessage = "相手がゴールしました";
                console.log("🏁 [GameEnd] 2-player game ended: opponent reached goal");
            }
            
            if (shouldShowResult) {
                // 自分の順位を計算（ゴールしていないプレイヤーは最下位扱い）
                const myRank = goaledPlayers.length + 1;
                
                console.log("🏁 [GameEnd] Showing result modal:", {
                    myRank,
                    resultMessage,
                    goaledCount: goaledPlayers.length
                });
                
                setTimeout(() => {
                    setResultData({
                        isGoal: false,
                        rank: myRank,
                        points: 0,
                        message: resultMessage,
                        totalScore: myPlayerState?.score || 0,
                        goalTime: new Date()
                    });
                    setShowResultModal(true);
                }, 2000); // 2秒待ってから表示
            }
        }
    }, [gameData?.playerStates, gameData?.players, gameData?.mode, myPlayerState?.goalTime, showResultModal, myPlayerState?.score]);

    // 四人対戦モード：ゴール通知監視
    useEffect(() => {
        if (!gameData || gameData.mode !== '4player' || !gameData.players || !gameData.playerStates) return;
        
        // ゴール済みプレイヤーのリストを取得
        const goaledPlayers = gameData.players.filter(pid => 
            gameData.playerStates[pid]?.goalTime
        ).sort((a, b) => {
            // ゴール時刻順でソート
            const timeA = gameData.playerStates[a]?.goalTime?.seconds || gameData.playerStates[a]?.goalTime;
            const timeB = gameData.playerStates[b]?.goalTime?.seconds || gameData.playerStates[b]?.goalTime;
            return timeA - timeB;
        });
        
        const goaledCount = goaledPlayers.length;
        
        // 1人目、2人目、3人目のゴール時に通知を表示
        if (goaledCount >= 1 && goaledCount <= 3) {
            // 最新のゴール達成者を取得
            const latestGoaledPlayer = goaledPlayers[goaledCount - 1];
            const goalerName = getUserNameById(latestGoaledPlayer);
            const isMyself = latestGoaledPlayer === (debugMode ? effectiveUserId : userId);
            
            // 既に同じ人数でのゴール通知を表示済みかチェック
            if (!goalNotificationData || goalNotificationData.goaledCount !== goaledCount) {
                console.log("🎉 [GoalNotification] Showing goal notification:", {
                    goaledCount,
                    latestGoaler: latestGoaledPlayer.substring(0, 8),
                    goalerName,
                    isMyself,
                    debugMode
                });
                
                setGoalNotificationData({
                    goaledCount,
                    goalerName,
                    isMyself,
                    rank: goaledCount,
                    totalPlayers: gameData.players.length,
                    remainingPlayers: gameData.players.length - goaledCount
                });
                setShowGoalNotificationPopup(true);
            }
        }
    }, [gameData?.playerStates, gameData?.players, gameData?.mode, getUserNameById, debugMode, effectiveUserId, userId, goalNotificationData]);

    const currentGridSize = STANDARD_GRID_SIZE;

    const sendSystemChatMessage = useCallback(async (text) => {
        if (!gameId) return;
        const chatCollRef = collection(db, `artifacts/${appId}/public/data/labyrinthGames/${gameId}/chatMessages`);
        try {
            await addDoc(chatCollRef, { senderId: "system", senderName: "システム", text: text, timestamp: serverTimestamp() });
        } catch (error) { console.error("Error sending system chat message:", error); }
    }, [gameId]);

    // 不足している関数の実装
    const handleStandardMoveImproved = async (direction) => {
        if (!isMyStandardTurn || inStandardBattleBetting || !canPressButton) return;
        
        const gameDocRef = doc(db, `artifacts/${appId}/public/data/labyrinthGames`, gameId);
        const { r: currentR, c: currentC } = myPlayerState.position;
        
        let newR = currentR;
        let newC = currentC;
        
        switch(direction) {
            case 'up': newR--; break;
            case 'down': newR++; break;
            case 'left': newC--; break;
            case 'right': newC++; break;
            default: return;
        }
        
        const gridSize = mazeToPlayData?.gridSize || STANDARD_GRID_SIZE;
        
        // 境界チェック
        if (newR < 0 || newR >= gridSize || newC < 0 || newC >= gridSize) {
            setMessage("盤外への移動はできません。");
            return;
        }
        
        // 壁チェック - 仕様書に基づく正確な壁判定
        const walls = mazeToPlayData?.walls || [];
        const isBlocked = walls.some(wall => {
            if (!wall.active) return false; // 非アクティブな壁は無視
            
            if (wall.type === 'horizontal') {
                // 水平壁：上下移動をブロック
                if (direction === 'up' && wall.r === currentR - 1 && wall.c === currentC) return true;
                if (direction === 'down' && wall.r === currentR && wall.c === currentC) return true;
            } else if (wall.type === 'vertical') {
                // 垂直壁：左右移動をブロック
                if (direction === 'left' && wall.r === currentR && wall.c === currentC - 1) return true;
                if (direction === 'right' && wall.r === currentR && wall.c === currentC) return true;
            }
            return false;
        });
        
        if (isBlocked) {
            setMessage("壁に阻まれて移動できません。");
            return;
        }
        
        try {
            const updates = {
                [`playerStates.${userId}.position`]: { r: newR, c: newC },
                [`playerStates.${userId}.lastMoveTime`]: serverTimestamp(),
            };
            
            // 新しいセルの発見ボーナス（四人対戦のみ、初回訪問時のみ）
            const cellKey = `${newR}-${newC}`;
            const revealedCells = myPlayerState?.revealedCells || {};
            const isFirstVisit = !revealedCells[cellKey];
            
            // 訪問したセルを記録（全モード共通）
            if (isFirstVisit) {
                updates[`playerStates.${userId}.revealedCells.${cellKey}`] = true;
            }
            
            if (gameData?.mode === '4player' && isFirstVisit) {
                updates[`playerStates.${userId}.score`] = increment(1);
                setMessage(`(${newC +1},${newR +1})に移動！ +1pt (初回訪問)`);
                console.log("🎯 [Points] First visit bonus awarded:", {
                    playerId: userId.substring(0, 8),
                    position: { r: newR, c: newC },
                    cellKey,
                    previouslyVisited: Object.keys(revealedCells).length
                });
            } else {
                let moveMsg = `(${newC +1},${newR +1})に移動しました。`;
                if (!isFirstVisit) {
                    moveMsg += " (訪問済み)";
                } else if (gameData?.mode === '2player') {
                    moveMsg += " (初回訪問)";
                }
                setMessage(moveMsg);
                console.log("🚶 [Points] No bonus - already visited or not 4-player mode:", {
                    playerId: userId.substring(0, 8),
                    position: { r: newR, c: newC },
                    cellKey,
                    isFirstVisit,
                    mode: gameData?.mode,
                    alreadyVisited: !isFirstVisit
                });
            }
            
            // ゴール判定
            if (mazeToPlayData && newR === mazeToPlayData.goal.r && newC === mazeToPlayData.goal.c && !myPlayerState.goalTime) {
                updates[`playerStates.${userId}.goalTime`] = serverTimestamp();
                updates.goalCount = increment(1);
                setMessage("ゴール達成！");
                
                // リザルト表示（二人対戦のみ即座に表示、四人対戦は3人目まで待機）
                if (gameData?.mode === '2player') {
                    setTimeout(() => {
                        setResultData({
                            isGoal: true,
                            rank: (gameData.goalCount || 0) + 1,
                            points: 0,
                            message: "ゴール達成！",
                            totalScore: (myPlayerState.score || 0) + 1,
                            goalTime: new Date()
                        });
                        setShowResultModal(true);
                    }, 1000);
                } else if (gameData?.mode === '4player') {
                    // 四人対戦：3人目がゴールするまでゲーム続行
                    console.log("🏆 [Goal] 4-player mode goal achieved, game continues until 3 players finish");
                }
            }
            
            await updateDoc(gameDocRef, updates);
            
            // 仕様書：移動成功の場合、連続移動が可能
            // ただし、ゴール到達時は例外
            if (mazeToPlayData && newR === mazeToPlayData.goal.r && newC === mazeToPlayData.goal.c) {
                // ゴール到達時はゲーム終了処理
                if (gameType === 'standard') {
                    setTimeout(() => {
                        advanceStandardTurn();
                    }, 1500);
                }
            } else {
                // 移動成功時は連続移動可能状態を維持
                // プレイヤーは次の移動を選択できる
                setIsMoving(false);
                // ターンは継続（壁にぶつかるまで移動可能）
            }
            
        } catch (error) {
            console.error("Error moving:", error);
            setMessage("移動に失敗しました。");
            setIsMoving(false);
        }
    };

    // スタンダードモード専用：ターン進行の実装
    const advanceStandardTurn = useCallback(async () => {
        if (gameType !== 'standard' || !gameData || !gameId) return;
        
        const gameDocRef = doc(db, `artifacts/${appId}/public/data/labyrinthGames`, gameId);
        
        try {
            await runTransaction(db, async (transaction) => {
                const freshGameSnap = await transaction.get(gameDocRef);
                if (!freshGameSnap.exists()) return;
                
                const freshData = freshGameSnap.data();
                const currentPlayerIndex = freshData.players.indexOf(freshData.currentTurnPlayerId);
                
                // ゴール済みプレイヤーをスキップして次のプレイヤーを探す
                let nextPlayerIndex = (currentPlayerIndex + 1) % freshData.players.length;
                let attempts = 0;
                const maxAttempts = freshData.players.length;
                
                // ゴールしていないプレイヤーを見つけるまでループ
                while (attempts < maxAttempts) {
                    const candidatePlayerId = freshData.players[nextPlayerIndex];
                    const candidatePlayerState = freshData.playerStates[candidatePlayerId];
                    
                    // ゴールしていないプレイヤーが見つかった場合
                    if (!candidatePlayerState?.goalTime) {
                        break;
                    }
                    
                    // 次のプレイヤーを試す
                    nextPlayerIndex = (nextPlayerIndex + 1) % freshData.players.length;
                    attempts++;
                }
                
                const nextPlayerId = freshData.players[nextPlayerIndex];
                
                const updates = {
                    currentTurnPlayerId: nextPlayerId,
                    turnNumber: increment(1)
                };
                
                // ターン切り替えメッセージ
                const nextPlayerName = getUserNameById(nextPlayerId);
                console.log(`🔄 Turn switched to: ${nextPlayerName} (skipped ${attempts} goaled players)`);
                
                // ゴール判定とゲーム終了チェック
                const goaledPlayers = freshData.players.filter(pid => 
                    freshData.playerStates[pid]?.goalTime
                );
                
                // 四人対戦の場合、3人目がゴールしたら終了（ポイント勝負）
                // 2人対戦の場合、1人がゴールしたら終了（先着順）
                let shouldFinishGame = false;
                if (freshData.mode === '4player' && goaledPlayers.length >= 3) {
                    shouldFinishGame = true;
                } else if (freshData.mode === '2player' && goaledPlayers.length >= 1) {
                    shouldFinishGame = true;
                }
                
                if (shouldFinishGame) {
                    updates.status = 'finished';
                    
                    // ランキング計算
                    if (freshData.mode === '4player') {
                        // 四人対戦：最終的なポイント数でランキング決定
                        const rankedPlayers = freshData.players.map(pid => ({
                            id: pid,
                            score: freshData.playerStates[pid]?.score || 0,
                            goalTime: freshData.playerStates[pid]?.goalTime?.toMillis() || Infinity
                        })).sort((a, b) => b.score - a.score); // ポイント数で降順ソート
                        
                        rankedPlayers.forEach((player, index) => {
                            updates[`playerStates.${player.id}.rank`] = index + 1;
                        });
                    } else {
                        // 2人対戦：ゴール到着順でランキング決定
                        const rankedPlayers = freshData.players.map(pid => ({
                            id: pid,
                            goalTime: freshData.playerStates[pid]?.goalTime?.toMillis() || Infinity,
                            score: freshData.playerStates[pid]?.score || 0
                        })).sort((a, b) => {
                            if (a.goalTime !== b.goalTime) return a.goalTime - b.goalTime;
                            return b.score - a.score;
                        });
                        
                        rankedPlayers.forEach((player, index) => {
                            updates[`playerStates.${player.id}.rank`] = index + 1;
                        });
                    }
                }
                
                transaction.update(gameDocRef, updates);
            });
            
        } catch (error) {
            console.error("Error advancing standard turn:", error);
        }
    }, [gameType, gameData, gameId]);

    // バトル状態監視
    useEffect(() => {
        if (gameData?.activeBattle && gameData?.mode === '4player') {
            const battle = gameData.activeBattle;
            // デバッグモードでは切り替えられたプレイヤーのIDで判定
            const currentUserId = debugMode ? effectiveUserId : userId;
            const isParticipant = battle.participants?.includes(currentUserId);
            
            console.log("🥊 [Battle] Battle state monitoring:", {
                battleExists: !!battle,
                battleStatus: battle.status,
                participants: battle.participants,
                currentUser: currentUserId.substring(0, 8),
                actualUser: userId.substring(0, 8),
                isParticipant,
                modalOpen: isBattleModalOpen,
                waitDialogOpen: showBattleWaitDialog,
                debugMode
            });
            
            // 当事者の場合：バトルモーダルを表示、待機ダイアログを非表示
            if (isParticipant && !isBattleModalOpen && battle.status === 'betting') {
                // 自分がまだポイント選択していない場合：バトルモーダルを表示
                const myBetStatus = gameData.playerStates[currentUserId]?.battleBet;
                const hasMyBet = myBetStatus !== undefined && myBetStatus !== null;
                
                if (!hasMyBet) {
                    console.log("🥊 [Battle] Opening battle modal for participant");
                    setIsBattleModalOpen(true);
                    setShowBattleWaitDialog(false); // 念のため待機ダイアログを閉じる
                    setShowBattleWaitingPopup(false); // 待機ポップアップも閉じる
                } else {
                    // 自分はポイント選択済みだが、相手がまだの場合：待機ポップアップを表示
                    const allParticipantsBetted = battle.participants?.every(pid => 
                        gameData.playerStates[pid]?.battleBet !== undefined && 
                        gameData.playerStates[pid]?.battleBet !== null
                    );
                    
                    if (!allParticipantsBetted && !showBattleWaitingPopup) {
                        console.log("🥊 [Battle] Showing waiting popup for participant who already bet");
                        setShowBattleWaitingPopup(true);
                        setIsBattleModalOpen(false);
                        setShowBattleWaitDialog(false);
                    }
                }
            }
            
            // 非当事者の場合：バトルモーダルを閉じ、待機ダイアログを表示
            if (!isParticipant) {
                if (isBattleModalOpen) {
                    console.log("🥊 [Battle] Closing battle modal for non-participant");
                    setIsBattleModalOpen(false);
                }
                
                if (!showBattleWaitDialog && battle.status === 'betting') {
                    console.log("🥊 [Battle] Showing battle wait dialog for non-participant");
                    setShowBattleWaitDialog(true);
                    setBattleParticipants(battle.participants || []);
                }
            }
            
            // 全当事者が賭けを完了した場合、結果を処理
            if (battle.status === 'betting' && !battle.processing && !isBattleProcessing) {
                const allParticipantsBetted = battle.participants?.every(pid => 
                    gameData.playerStates[pid]?.battleBet !== undefined && 
                    gameData.playerStates[pid]?.battleBet !== null
                );

                if (allParticipantsBetted) {
                    // 処理権限の判定：参加者のうち、より小さいuserIdを持つクライアントのみが処理を実行
                    const sortedParticipants = [...battle.participants].sort();
                    const currentUserId = debugMode ? effectiveUserId : userId;
                    const shouldProcess = sortedParticipants[0] === currentUserId;

                    if (shouldProcess) {
                        setIsBattleProcessing(true); // ここでローカルフラグを即時立てる
                        console.log("🥊 [Battle] All participants have placed bets, processing result (authorized client)");
                        processBattleResult(battle);
                    } else {
                        console.log("🥊 [Battle] All participants have placed bets, but this client is not authorized to process");
                    }
                }
            }
        } else if (!gameData?.activeBattle) {
            // バトルが終了した場合は全てのダイアログを閉じる
            if (isBattleModalOpen) {
                console.log("🥊 [Battle] Closing battle modal - no active battle");
                setIsBattleModalOpen(false);
            }
            if (showBattleWaitDialog) {
                console.log("🥊 [Battle] Closing battle wait dialog - no active battle");
                setShowBattleWaitDialog(false);
                setBattleParticipants([]);
            }
            if (showBattleWaitingPopup) {
                console.log("🥊 [Battle] Closing battle waiting popup - no active battle");
                setShowBattleWaitingPopup(false);
            }
        }
    }, [gameData?.activeBattle, gameData?.playerStates, gameData?.mode, userId, isBattleModalOpen, showBattleWaitDialog, showBattleWaitingPopup, debugMode, effectiveUserId]);

    // ゲーム中断状態監視
    useEffect(() => {
        if (gameData?.status === 'interrupted' && gameData?.interruptedBy) {
            // デバッグモードでも通常モードでも、実際のuserIdで判定
            const actualUserId = userId; // デバッグモードでも実際のuserIdを使用
            
            if (gameData.interruptedBy !== actualUserId) {
                // 他のプレイヤーがゲームを中断した場合
                const interruptedPlayerName = gameData.interruptedPlayerName || 'プレイヤー';
                
                console.log("🚨 [GameInterrupted] Game was interrupted by another player:", {
                    interruptedBy: gameData.interruptedBy.substring(0, 8),
                    interruptedPlayerName,
                    actualUserId: actualUserId.substring(0, 8),
                    debugMode,
                    debugCurrentPlayerId: debugMode ? effectiveUserId.substring(0, 8) : 'N/A'
                });
                
                // 中断通知ダイアログを表示
                setShowGameInterruptedDialog(true);
                setInterruptedByPlayerName(interruptedPlayerName);
            } else {
                // 自分が中断した場合はダイアログを表示せずに直接ホームに戻る
                console.log("🔄 [GameInterrupted] Game was interrupted by self, going to lobby immediately:", {
                    actualUserId: actualUserId.substring(0, 8),
                    debugMode
                });
            }
        }
    }, [gameData?.status, gameData?.interruptedBy, gameData?.interruptedPlayerName, userId, debugMode, effectiveUserId]);
    
    // バトル勝利画面の自動閉じ機能
    useEffect(() => {
        if (showBattleVictoryScreen) {
            const timer = setTimeout(() => {
                setShowBattleVictoryScreen(false);
                setVictoryScreenData(null);
                console.log("🎉 [Victory] Victory screen auto-closed after 10 seconds");
            }, 10000); // 10秒後に自動閉じ
            
            return () => clearTimeout(timer);
        }
    }, [showBattleVictoryScreen]);
    
    // handleSendChatMessage関数の実装
    const handleSendChatMessage = async () => {
        if (!chatInput.trim() || !gameId) return;
        
        // デバッグモードでは切り替えられたプレイヤーとしてチャットを送信
        const sendingUserId = debugMode ? effectiveUserId : userId;
        const sendingUserName = debugMode ? getUserNameById(effectiveUserId) : currentUserName;
        
        console.log("💬 [Chat] Sending message:", {
            debugMode,
            sendingUserId: sendingUserId.substring(0, 8),
            sendingUserName,
            actualUserId: userId.substring(0, 8),
            message: chatInput.substring(0, 20) + (chatInput.length > 20 ? "..." : "")
        });
        
        // 通信妨害チェック（デバッグモードでは切り替えられたプレイヤーの状態をチェック）
        const targetPlayerState = debugMode ? effectivePlayerState : myPlayerState;
        if (gameData?.specialEventActive?.type === 'communication_jam' ||
            targetPlayerState?.sabotageEffects?.some(eff => eff.type === 'info_jam' && eff.expiryRound >= gameData?.roundNumber)) {
            setMessage("通信が妨害されています。");
            return;
        }
        
        const chatCollRef = collection(db, `artifacts/${appId}/public/data/labyrinthGames/${gameId}/chatMessages`);
        
        try {
            await addDoc(chatCollRef, {
                senderId: sendingUserId,
                senderName: sendingUserName,
                text: chatInput,
                timestamp: serverTimestamp()
            });
            setChatInput("");
        } catch (error) {
            console.error("Error sending chat message:", error);
            setMessage("メッセージ送信に失敗しました。");
        }
    };

    // 発言テンプレート選択時のハンドラー
    const handleTemplateSelect = (template) => {
        setChatInput(template);
    };

    // デバッグモード用のプレイヤー切り替えコンポーネント
    const DebugPlayerSwitcher = () => {
        if (!debugMode || !gameData?.players) return null;
        
        return (
            <div className="bg-yellow-100 border-l-4 border-yellow-500 p-3 mb-4">
                <div className="flex flex-col space-y-2">
                    <div className="flex items-center space-x-2">
                        <span className="text-yellow-800 font-semibold">🔧 DEBUG MODE:</span>
                        <span className="text-yellow-700">プレイヤー切り替え:</span>
                        <div className="flex space-x-1">
                            {gameData.players.map((playerId, index) => (
                                <button
                                    key={playerId}
                                    onClick={() => {
                                        setDebugCurrentPlayerId(playerId);
                                        console.log(`🔧 [DEBUG] Switched to player ${index + 1}: ${playerId.substring(0,8)}...`);
                                    }}
                                    className={`px-3 py-1 rounded text-sm font-medium ${
                                        debugCurrentPlayerId === playerId
                                            ? 'bg-blue-500 text-white'
                                            : 'bg-white text-gray-700 hover:bg-gray-100'
                                    }`}
                                >
                                    P{index + 1}
                                </button>
                            ))}
                        </div>
                        <span className="text-yellow-700 text-sm">
                            現在: {debugCurrentPlayerId?.substring(0,8)}...
                        </span>
                    </div>
                    <div className="flex items-center space-x-4">
                        <label className="flex items-center space-x-1 text-sm text-yellow-700">
                            <input
                                type="checkbox"
                                checked={showOpponentWallsDebug}
                                onChange={(e) => setShowOpponentWallsDebug(e.target.checked)}
                                className="rounded"
                            />
                            <span>相手の壁表示確認</span>
                        </label>
                    </div>
                    <div className="text-xs text-yellow-600 bg-yellow-50 p-2 rounded border">
                        📝 デバッグ機能: 
                        • 完全プレイヤー視点切り替え：選択したプレイヤーとして完全に操作<br/>
                        • チャット送信時も切り替えたプレイヤー名で送信される<br/>
                        • ターン表示、ポイント表示なども切り替えたプレイヤー視点<br/>
                        • 移動、バトル、ゲーム終了すべて切り替えたプレイヤーとして実行<br/>
                        • 一人で複数プレイヤーの完全なマルチプレイ体験が可能
                    </div>
                </div>
            </div>
        );
    };

    // 感想戦モードが表示されている場合
    if (showReviewMode) {
        return (
            <ReviewModeScreen
                gameData={gameData}
                mazeData={mazeToPlayData}
                allMazeData={gameData?.mazes || {}}
                userId={userId}
                gameId={gameId}
                onExit={() => {
                    setShowReviewMode(false);
                    setScreen('lobby');
                }}
            />
        );
    }

    return (
        <div className="w-full max-w-full mx-auto p-2 sm:p-4 bg-gray-100 min-h-screen">
            {/* デバッグモード時のプレイヤー切り替えUI */}
            <DebugPlayerSwitcher />
            
            {/* ヘッダー部分を簡素化 */}
            <div className="bg-white rounded-lg shadow-md p-3 sm:p-4 mb-4">
                <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2">
                    <h1 className="text-xl sm:text-2xl font-bold text-gray-800">
                        {gameData?.mode === '4player' ? '四人対戦モード' : '二人対戦モード'}
                        {debugMode && <span className="text-yellow-600 ml-2 text-base sm:text-lg">🔧 DEBUG ({currentUserName})</span>}
                    </h1>
                    <button
                        onClick={handleExitButtonClick}
                        className="bg-red-500 hover:bg-red-600 text-white px-3 py-2 sm:px-4 rounded text-sm sm:text-base"
                        title={debugMode ? `デバッグモードでも実際のユーザー(${currentUserName})として終了処理を実行` : ''}
                    >
                        ホームに戻る
                    </button>
                </div>
            </div>

            {/* メインコンテンツ：スタンダードモード（二人対戦） */}
            {/* スタンダードモード（二人対戦）レスポンシブレイアウト: 左（攻略中迷路・相手作成）・中央（操作・チャット）・右（自分作成・相手攻略） */}
            <div className="grid grid-cols-1 lg:grid-cols-3 xl:grid-cols-12 gap-2 sm:gap-4 h-full min-h-[calc(100vh-200px)]">{/* レスポンシブ対応: lg以上で3列、xl以上で詳細レイアウト */}
                    {/* 左側：自分が攻略する迷路（相手が作ったもの） */}
                    <div className="lg:col-span-1 xl:col-span-4 bg-white rounded-lg shadow-md p-2 sm:p-4 h-fit">
                        <h2 className="text-base sm:text-lg font-semibold mb-2 sm:mb-4 text-center">
                            🎮 攻略中の迷宮（相手作成）
                        </h2>
                        
                        {mazeToPlayData ? (
                            <div>
                                {/* 自分が攻略する迷路（相手作成・壁は見えない） */}
                                <div className="flex justify-center mb-4">
                                    <div className="w-fit max-w-sm mx-auto">
                                        <MazeGrid
                                            mazeData={mazeToPlayData}
                                            playerPosition={effectivePlayerState?.position}
                                            otherPlayers={[]} // 左側の迷路では他プレイヤーの位置を表示しない
                                            revealedCells={effectivePlayerState?.revealedCells || {}}
                                            revealedPlayerWalls={effectivePlayerState?.revealedWalls || []}
                                            hitWalls={debugMode ? (gameData?.playerStates?.[effectiveUserId]?.hitWalls || []) : (myPlayerState?.hitWalls || hitWalls)}
                                            onCellClick={handleCellClick}
                                            gridSize={currentGridSize}
                                            sharedWallsFromAllies={[]}
                                            highlightPlayer={true}
                                            smallView={false}
                                            showAllPlayerPositions={false}
                                            isCreating={false}
                                            showAllWalls={debugMode && showOpponentWallsDebug} // デバッグモード時の壁表示
                                            playerNames={playerNames} // デバッグ表示用
                                            currentUserId={effectiveUserId} // デバッグ表示用
                                        />
                                    </div>
                                </div>
                                <div className="mt-3 p-2 bg-blue-50 rounded text-sm">
                                    <p className="font-semibold text-blue-700">あなたの状態:</p>
                                    <p>位置: ({(effectivePlayerState?.position?.c || 0) + 1}, {(effectivePlayerState?.position?.r || 0) + 1})</p>
                                    <p>到達マス数: {Object.keys(effectivePlayerState?.revealedCells || {}).length}マス</p>
                                    <p>ぶつかった壁: {(effectivePlayerState?.hitWalls || []).length}個</p>
                                    {/* <p>スコア: {effectivePlayerState?.score || 0}pt</p> */}
                                    {effectivePlayerState?.goalTime && (
                                        <p className="text-green-600 font-semibold">ゴール達成！</p>
                                    )}
                                </div>
                            </div>
                        ) : (
                            <div className="flex items-center justify-center h-48 sm:h-64 bg-gray-50 rounded">
                                <div className="text-center">
                                    <p className="text-gray-500 mb-2">攻略迷路を読み込み中...</p>
                                    <p className="text-xs text-gray-400">割り当てられた迷路作成者: {myPlayerState?.assignedMazeOwnerId || "未割り当て"}</p>
                                    {gameData?.mazes && (
                                        <p className="text-xs text-gray-400 mt-2">
                                            利用可能な迷路: {Object.keys(gameData.mazes).join(", ") || "なし"}
                                        </p>
                                    )}
                                </div>
                            </div>
                        )}
                    </div>

                    {/* 中央：操作UI・チャット・ゲーム情報 */}
                    <div className="lg:col-span-1 xl:col-span-4 space-y-2 sm:space-y-4 h-fit">
                        {/* 現在のターン表示 */}
                        <div className="bg-white rounded-lg shadow-md p-2 sm:p-4 mb-2 sm:mb-4">
                            <div className="p-2 sm:p-3 bg-blue-50 rounded-lg">
                                <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2">
                                    <div>
                                        <h4 className="font-semibold text-blue-700 text-sm sm:text-base">現在のターン</h4>
                                        <p className="text-xs sm:text-sm text-blue-600">
                                            {gameData?.currentTurnPlayerId === effectiveUserId ? 
                                                <span className="font-bold text-green-600">{currentUserName}</span> : 
                                                <span className="font-bold text-orange-600">相手</span>
                                            } (ターン数: {gameData?.turnNumber || 1})
                                        </p>
                                        {/* 四人対戦モード：ポイント情報をここに統合 */}
                                        {gameData?.mode === '4player' && (
                                            <p className="text-xs sm:text-sm text-yellow-600 font-semibold mt-1">
                                                🏆 {effectivePlayerState?.score || 0}pt
                                            </p>
                                        )}
                                    </div>
                                    <div className="text-left sm:text-right text-xs sm:text-sm">
                                        <p className="text-blue-700">
                                            {currentUserName}の状態
                                        </p>
                                        <p className="text-blue-600">
                                            位置: ({(effectivePlayerState?.position?.c || 0) + 1}, {(effectivePlayerState?.position?.r || 0) + 1})
                                        </p>
                                    </div>
                                </div>
                            </div>
                        </div>

                        {/* 移動方法説明・移動操作 */}
                        <div className="bg-white rounded-lg shadow-md p-2 sm:p-4 mb-2 sm:mb-4">
                            {/* メッセージエリア */}
                            {message && (
                                <div className="mb-3 p-3 bg-yellow-50 rounded border-l-4 border-yellow-400">
                                    <p className="text-yellow-800 text-sm">{message}</p>
                                </div>
                            )}
                            
                            <h4 className="text-base sm:text-lg font-semibold mb-2 sm:mb-3">移動操作</h4>
                            
                            {/* バトル待機状態の表示 */}
                            {gameData?.activeBattle && gameData?.mode === '4player' && !gameData.activeBattle.participants?.includes(debugMode ? effectiveUserId : userId) ? (
                                <div className="text-center p-4 bg-orange-50 rounded-lg">
                                    <div className="flex items-center justify-center mb-2">
                                        <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-orange-600"></div>
                                    </div>
                                    <p className="text-orange-600 font-semibold">⚔️ バトルが発生したのでしばらくお待ちください。</p>
                                    <p className="text-sm text-orange-500">
                                        {(() => {
                                            const participants = gameData.activeBattle.participants || [];
                                            const names = participants.map(pid => getUserNameById(pid)).join(" vs ");
                                            return `${names}のバトル中です`;
                                        })()}
                                    </p>
                                    <div className="mt-2 text-xs text-orange-400">
                                        バトル結果をお待ちください
                                    </div>
                                </div>
                            ) : isMyStandardTurn && !inStandardBattleBetting ? (
                                <div className="space-y-3">
                                    {/* ターン状態表示 */}
                                    <div className="p-3 bg-green-50 rounded-lg text-center">
                                        <p className="text-green-600 font-semibold">🟢 {currentUserName}のターン</p>
                                        <p className="text-sm text-green-500">移動を選択してください</p>
                                    </div>
                                    
                                    {/* 移動方法説明 */}
                                    <div className="p-3 bg-blue-50 rounded-lg">
                                        <h5 className="font-semibold text-blue-700 mb-2">🎮 移動方法</h5>
                                        <div className="text-sm text-blue-600 space-y-1">
                                            <p><strong>方法1:</strong> 下の移動ボタンを使用</p>
                                            <p><strong>方法2:</strong> 左の迷路上の隣接セルを直接クリック</p>
                                            <p><strong>方法3:</strong> キーボードの矢印キー または WASD</p>
                                            <p className="text-green-600 font-semibold">💡 連続移動可能！壁にぶつかるまで移動し続けられます</p>
                                        </div>
                                    </div>
                                    
                                    {/* 方向ボタン */}
                                    <div className="grid grid-cols-3 gap-1 sm:gap-2 max-w-36 sm:max-w-48 mx-auto">
                                        <div></div>
                                        <button 
                                            onClick={() => handleStandardMove('up')}
                                            disabled={isMoving || !canPressButton}
                                            className="bg-blue-500 hover:bg-blue-600 disabled:bg-gray-300 text-white p-2 sm:p-3 rounded-lg flex items-center justify-center transition-colors shadow-md"
                                            title="上に移動 (W キー)"
                                        >
                                            <ArrowUp size={16} className="sm:w-5 sm:h-5"/>
                                        </button>
                                        <div></div>
                                        
                                        <button 
                                            onClick={() => handleStandardMove('left')}
                                            disabled={isMoving || !canPressButton}
                                            className="bg-blue-500 hover:bg-blue-600 disabled:bg-gray-300 text-white p-2 sm:p-3 rounded-lg flex items-center justify-center transition-colors shadow-md"
                                            title="左に移動 (A キー)"
                                        >
                                            <ArrowLeft size={16} className="sm:w-5 sm:h-5"/>
                                        </button>
                                        <div className="bg-gray-200 rounded-lg p-2 sm:p-3 flex items-center justify-center">
                                            <User size={16} className="sm:w-5 sm:h-5 text-gray-500"/>
                                        </div>
                                        <button 
                                            onClick={() => handleStandardMove('right')}
                                            disabled={isMoving || !canPressButton}
                                            className="bg-blue-500 hover:bg-blue-600 disabled:bg-gray-300 text-white p-2 sm:p-3 rounded-lg flex items-center justify-center transition-colors shadow-md"
                                            title="右に移動 (D キー)"
                                        >
                                            <ArrowRight size={16} className="sm:w-5 sm:h-5"/>
                                        </button>
                                        
                                        <div></div>
                                        <button 
                                            onClick={() => handleStandardMove('down')}
                                            disabled={isMoving || !canPressButton}
                                            className="bg-blue-500 hover:bg-blue-600 disabled:bg-gray-300 text-white p-2 sm:p-3 rounded-lg flex items-center justify-center transition-colors shadow-md"
                                            title="下に移動 (S キー)"
                                        >
                                            <ArrowDown size={16} className="sm:w-5 sm:h-5"/>
                                        </button>
                                        <div></div>
                                    </div>
                                    
                                    {/* キーボードヒント */}
                                    <div className="text-center text-xs text-gray-500 bg-gray-50 p-2 rounded">
                                        💡 キーボード: ↑↓←→ または WASD でも移動可能
                                    </div>
                                </div>
                            ) : inStandardBattleBetting ? (
                                <div className="text-center p-4 bg-red-50 rounded-lg">
                                    <Swords className="mx-auto mb-2 text-red-600" size={24}/>
                                    <p className="text-red-600 font-semibold">バトル中</p>
                                    <p className="text-sm text-red-500">移動はできません</p>
                                </div>
                            ) : (
                                <div className="text-center p-4 bg-gray-50 rounded-lg">
                                    <Clock className="mx-auto mb-2 text-gray-500" size={24}/>
                                    <p className="text-gray-600 font-semibold">相手のターン</p>
                                    <p className="text-sm text-gray-500">相手の移動を待っています...</p>
                                    {isMoving && (
                                        <p className="text-blue-600 mt-2">移動中...</p>
                                    )}
                                </div>
                            )}
                        </div>

                        {/* チャットエリア */}
                        <ChatSection 
                            chatMessages={chatMessages}
                            chatInput={chatInput}
                            setChatInput={setChatInput}
                            handleSendChatMessage={handleSendChatMessage}
                            onShowHelp={() => setShowHelpOverlay(true)}
                            onShowTemplate={() => setShowSpeechTemplate(true)}
                            chatLogRef={chatLogRef}
                            title="チャット"
                        />
                    </div>

                    {/* 右側：自分が作った迷路（相手が攻略中・壁が全て見える） */}
                    <div className="lg:col-span-1 xl:col-span-4 bg-white rounded-lg shadow-md p-2 sm:p-4 h-fit">
                        {gameData?.mode === '4player' ? (
                            // 四人対戦モード：切り替え可能な迷路表示
                            <div>
                                <h2 className="text-base sm:text-lg font-semibold mb-2 sm:mb-4 text-center">
                                    🏗️ 迷宮ビューアー
                                </h2>
                                
                                {/* 迷路切り替えボタン */}
                                <div className="mb-4">
                                    <div className="flex flex-wrap gap-1 justify-center">
                                        {gameData.players?.map((playerId, index) => {
                                            const isCurrentPlayer = playerId === effectiveUserId;
                                            const isViewing = viewingMazeOwnerId === playerId;
                                            const playerName = isCurrentPlayer ? '自分' : getUserNameById(playerId);
                                            
                                            return (
                                                <button
                                                    key={playerId}
                                                    onClick={() => setViewingMazeOwnerId(playerId)}
                                                    className={`px-2 py-1 text-xs rounded ${
                                                        isViewing
                                                            ? 'bg-blue-500 text-white'
                                                            : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
                                                    }`}
                                                >
                                                    {playerName}がプレイ中の迷路
                                                </button>
                                            );
                                        })}
                                    </div>
                                </div>
                                
                                {gameData?.mazes && viewingMazeOwnerId ? (
                                    <div>
                                        <div className="flex justify-center mb-4">
                                            <div className="w-fit max-w-sm mx-auto">
                                                <MazeGrid
                                                    mazeData={{
                                                        // プレイヤーが攻略している迷路を表示（assignedMazeOwnerIdから取得）
                                                        ...(() => {
                                                            const playerState = gameData.playerStates?.[viewingMazeOwnerId];
                                                            const assignedMazeOwnerId = playerState?.assignedMazeOwnerId;
                                                            const targetMaze = assignedMazeOwnerId ? gameData.mazes[assignedMazeOwnerId] : null;
                                                            return targetMaze || {};
                                                        })(),
                                                        // 自分が作った迷路をプレイしている人の場合のみ全ての壁を表示
                                                        walls: (() => {
                                                            const playerState = gameData.playerStates?.[viewingMazeOwnerId];
                                                            const assignedMazeOwnerId = playerState?.assignedMazeOwnerId;
                                                            
                                                            // 自分が作った迷路をプレイしている人かどうかをチェック
                                                            const isPlayingMyMaze = assignedMazeOwnerId === effectiveUserId;
                                                            
                                                            if (isPlayingMyMaze) {
                                                                // 自分が作った迷路をプレイしている人：全ての壁を表示
                                                                const targetMaze = gameData.mazes[assignedMazeOwnerId];
                                                                return (targetMaze?.walls || []).filter(w => w.active === true);
                                                            } else {
                                                                // その他：壁を表示しない
                                                                return [];
                                                            }
                                                        })()
                                                    }}
                                                    playerPosition={(() => {
                                                        // 四人対戦モードでは、プレイヤーの位置情報を完全に非表示
                                                        if (gameData?.mode === '4player') {
                                                            // 自分自身の場合のみ位置を表示
                                                            return viewingMazeOwnerId === effectiveUserId
                                                                ? (gameData.playerStates?.[viewingMazeOwnerId]?.position || null)
                                                                : null;
                                                        } else {
                                                            // 二人対戦モードでは従来通り
                                                            const playerState = gameData.playerStates?.[viewingMazeOwnerId];
                                                            const assignedMazeOwnerId = playerState?.assignedMazeOwnerId;
                                                            const isPlayingMyMaze = assignedMazeOwnerId === effectiveUserId;
                                                            
                                                            return (isPlayingMyMaze || viewingMazeOwnerId === effectiveUserId) 
                                                                ? (gameData.playerStates?.[viewingMazeOwnerId]?.position || null)
                                                                : null;
                                                        }
                                                    })()} // 4人対戦時は相手の位置情報を完全に非表示（自分が作った迷路でも）
                                                    otherPlayers={[]} // 右側の迷路では他プレイヤーの現在地を表示しない
                                                    showAllWalls={(() => {
                                                        const playerState = gameData.playerStates?.[viewingMazeOwnerId];
                                                        const assignedMazeOwnerId = playerState?.assignedMazeOwnerId;
                                                        return assignedMazeOwnerId === effectiveUserId; // 自分が作った迷路をプレイしている人のみ壁表示
                                                    })()}
                                                    onCellClick={() => {}}
                                                    gridSize={currentGridSize}
                                                    sharedWalls={[]}
                                                    highlightPlayer={(() => {
                                                        // 四人対戦モードでは、プレイヤーのハイライトを完全に非表示
                                                        if (gameData?.mode === '4player') {
                                                            // 自分自身の場合のみハイライト
                                                            return viewingMazeOwnerId === effectiveUserId;
                                                        } else {
                                                            // 二人対戦モードでは従来通り
                                                            const playerState = gameData.playerStates?.[viewingMazeOwnerId];
                                                            const assignedMazeOwnerId = playerState?.assignedMazeOwnerId;
                                                            const isPlayingMyMaze = assignedMazeOwnerId === effectiveUserId;
                                                            
                                                            return isPlayingMyMaze || viewingMazeOwnerId === effectiveUserId;
                                                        }
                                                    })()}
                                                    smallView={false}
                                                    revealedCells={gameData.playerStates?.[viewingMazeOwnerId]?.revealedCells || {}}
                                                    hitWalls={gameData.playerStates?.[viewingMazeOwnerId]?.hitWalls || []}
                                                />
                                            </div>
                                        </div>
                                        
                                        <div className="mt-3 p-2 bg-blue-50 rounded text-sm">
                                            <p className="font-semibold text-blue-700">
                                                {viewingMazeOwnerId === effectiveUserId ? '自分が攻略中の迷路' : `${getUserNameById(viewingMazeOwnerId)}が攻略中の迷路`}
                                            </p>
                                            {(() => {
                                                const playerState = gameData.playerStates?.[viewingMazeOwnerId];
                                                const assignedMazeOwnerId = playerState?.assignedMazeOwnerId;
                                                const isPlayingMyMaze = assignedMazeOwnerId === effectiveUserId;
                                                
                                                if (gameData?.mode === '4player') {
                                                    // 四人対戦モードの説明
                                                    if (viewingMazeOwnerId === effectiveUserId) {
                                                        return <p className="text-blue-600">あなたの探索状況と発見した壁が表示されています</p>;
                                                    } else if (isPlayingMyMaze) {
                                                        return <p className="text-blue-600">あなたが作った迷路です（壁のみ表示、プレイヤー位置は非表示）</p>;
                                                    } else {
                                                        return <p className="text-blue-600">他プレイヤーの迷路です（スタート・ゴールのみ表示、位置・壁は非表示）</p>;
                                                    }
                                                } else {
                                                    // 二人対戦モードの説明（従来通り）
                                                    if (viewingMazeOwnerId === effectiveUserId) {
                                                        return <p className="text-blue-600">あなたの探索状況と発見した壁が表示されています</p>;
                                                    } else if (isPlayingMyMaze) {
                                                        return <p className="text-blue-600">あなたが作った迷路をプレイ中です（全ての壁が見えます）</p>;
                                                    } else {
                                                        return <p className="text-blue-600">他プレイヤーの現在位置とスタート・ゴールが表示されています（壁は非表示）</p>;
                                                    }
                                                }
                                            })()}
                                        </div>
                                    </div>
                                ) : (
                                    <div className="flex items-center justify-center h-48 sm:h-64 bg-gray-50 rounded">
                                        <div className="text-center">
                                            <p className="text-gray-500 mb-2">迷路データを読み込み中...</p>
                                        </div>
                                    </div>
                                )}
                            </div>
                        ) : (
                            // 二人対戦モード：自分が作った迷路を表示
                            <div>
                                <h2 className="text-base sm:text-lg font-semibold mb-2 sm:mb-4 text-center">
                                    🏗️ 自分の迷宮（相手攻略中）
                                </h2>
                                
                                {(debugMode ? gameData?.mazes?.[effectiveUserId] : myCreatedMazeData) ? (
                                    <div>
                                        {/* 自分が作成した迷路（壁が全て見える） */}
                                        <div className="flex justify-center mb-4">
                                            <div className="w-fit max-w-sm mx-auto">
                                                <MazeGrid
                                                    mazeData={{
                                                        ...(debugMode ? gameData?.mazes?.[effectiveUserId] : myCreatedMazeData),
                                                        walls: ((debugMode ? gameData?.mazes?.[effectiveUserId] : myCreatedMazeData)?.walls || []).filter(w => w.active === true)
                                                    }}
                                                    playerPosition={null} // 自分の迷路なので自分の位置は表示しない
                                                    otherPlayers={(() => {
                                                        // 二人対戦モードで、相手が自分の迷路を攻略している場合の位置を表示
                                                        if (gameData?.mode === '2player' && gameData?.players && gameData?.playerStates) {
                                                            // 自分以外のプレイヤー（相手）を探す
                                                            const opponentId = gameData.players.find(playerId => playerId !== (debugMode ? effectiveUserId : userId));
                                                            if (opponentId) {
                                                                const opponentState = gameData.playerStates[opponentId];
                                                                // 相手が自分の迷路を攻略している場合
                                                                if (opponentState?.assignedMazeOwnerId === (debugMode ? effectiveUserId : userId) && opponentState?.position) {
                                                                    console.log("🎯 [RightMaze] Showing opponent position on my maze:", {
                                                                        opponentId: opponentId.substring(0, 8),
                                                                        opponentPosition: opponentState.position,
                                                                        assignedMazeOwner: opponentState.assignedMazeOwnerId.substring(0, 8),
                                                                        myUserId: (debugMode ? effectiveUserId : userId).substring(0, 8)
                                                                    });
                                                                    return [{
                                                                        id: opponentId,
                                                                        position: opponentState.position,
                                                                        name: getUserNameById(opponentId)
                                                                    }];
                                                                } else {
                                                                    console.log("🔍 [RightMaze] Opponent not on my maze:", {
                                                                        opponentId: opponentId.substring(0, 8),
                                                                        opponentAssignedMazeOwner: opponentState?.assignedMazeOwnerId?.substring(0, 8),
                                                                        myUserId: (debugMode ? effectiveUserId : userId).substring(0, 8),
                                                                        opponentHasPosition: !!opponentState?.position
                                                                    });
                                                                }
                                                            }
                                                        }
                                                        return []; // その他の場合は表示しない
                                                    })()}
                                                    showAllWalls={true}
                                                    onCellClick={() => {}}
                                                    gridSize={currentGridSize}
                                                    sharedWalls={[]}
                                                    highlightPlayer={false}
                                                    smallView={false}
                                                />
                                            </div>
                                        </div>
                                        
                                        <div className="mt-3 p-2 bg-blue-50 rounded text-sm">
                                            <p className="font-semibold text-blue-700">あなたの作った迷路:</p>
                                            <p>相手が攻略中です（相手の現在位置を表示）</p>
                                            <p>全ての壁が見えています</p>
                                        </div>
                                    </div>
                                ) : (
                                    <div className="flex items-center justify-center h-48 sm:h-64 bg-gray-50 rounded">
                                        <div className="text-center">
                                            <p className="text-gray-500 mb-2">自分の迷路を読み込み中...</p>
                                        </div>
                                    </div>
                                )}
                            </div>
                        )}
                    </div>

                </div>

            {/* バトルモーダル（当事者のみ） */}
            {isBattleModalOpen && gameData?.activeBattle && gameData.activeBattle.participants?.includes(debugMode ? effectiveUserId : userId) && (
                <BattleModal
                    isOpen={isBattleModalOpen}
                    onClose={() => setIsBattleModalOpen(false)}
                    onBet={handleStandardBattleBet}
                    maxBet={effectivePlayerState?.score || 0}
                    opponentName={gameData?.activeBattle?.participants?.filter(id => id !== (debugMode ? effectiveUserId : userId)).map(id => getUserNameById(id)).join(', ') || "相手"}
                    myName={effectiveUserId}
                    myCurrentScore={effectivePlayerState?.score || 0}
                />
            )}

            {/* ゲーム終了モーダル（感想戦開始用） */}
            {gameData?.status === 'finished' && (
                <GameOverModal
                    isOpen={gameData?.status === 'finished'}
                    onClose={() => {
                        // ゲーム終了モーダルは自動で表示されるため、明示的な閉じる操作は不要
                    }}
                    gameData={gameData}
                    userId={userId}
                    onReturnToLobby={() => {
                        performCompleteStateReset();
                        setScreen('lobby');
                    }}
                    onStartReview={() => setShowReviewMode(true)}
                />
            )}

            {/* リザルトモーダル */}
            {showResultModal && resultData && (
                <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
                    <div className="bg-white rounded-lg p-8 max-w-md w-11/12">
                        <div className="text-center">
                            <Trophy className="mx-auto mb-4 text-yellow-500" size={48} />
                            <h2 className="text-2xl font-bold mb-4 text-gray-800">
                                {resultData.message}
                            </h2>
                            
                            <div className="mb-6 space-y-2">
                                {resultData.rank && (
                                    <p className="text-lg text-gray-700">
                                        順位: {resultData.rank}位
                                    </p>
                                )}
                                {resultData.points > 0 && (
                                    <p className="text-lg text-green-600">
                                        獲得ポイント: +{resultData.points}pt
                                    </p>
                                )}
                            </div>
                            
                            <div className="flex flex-col space-y-3">
                                <button
                                    onClick={() => {
                                        setShowResultModal(false);
                                        setShowReviewMode(true);
                                    }}
                                    className="w-full bg-blue-500 text-white py-2 px-4 rounded-lg hover:bg-blue-600 transition-colors"
                                >
                                    感想戦モードへ
                                </button>
                                <button
                                    onClick={() => {
                                        setShowResultModal(false);
                                        performCompleteStateReset();
                                        setScreen('lobby');
                                    }}
                                    className="w-full bg-gray-500 text-white py-2 px-4 rounded-lg hover:bg-gray-600 transition-colors"
                                >
                                    ロビーに戻る
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* 感想戦モード */}
            {showReviewMode && (
                <ReviewModeScreen
                    gameData={gameData}
                    mazeData={mazeToPlayData}
                    allMazeData={gameData?.mazes || {}}
                    userId={userId}
                    gameId={gameId}
                    onExit={() => {
                        setShowReviewMode(false);
                        performCompleteStateReset();
                        setScreen('lobby');
                    }}
                />
            )}

            {/* ヘルプオーバーレイ ポップアップ */}
            {showHelpOverlay && (
                <HelpOverlay page={1} onClose={() => setShowHelpOverlay(false)} />
            )}

            {/* 発言テンプレートモーダル */}
            {showSpeechTemplate && (
                <SpeechTemplateModal
                    isOpen={showSpeechTemplate}
                    onClose={() => setShowSpeechTemplate(false)}
                    onSelectTemplate={handleTemplateSelect}
                />
            )}

            {/* ゲーム中断通知ダイアログ */}
            {showGameInterruptedDialog && (
                <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
                    <div className="bg-white rounded-lg p-6 max-w-md w-11/12">
                        <h2 className="text-xl font-bold mb-4 text-gray-800">ゲームが中断されました</h2>
                        <p className="text-gray-600 mb-6">
                            {interruptedByPlayerName}がゲームを中断しました。<br />
                            ホームに戻ります。
                        </p>
                        <div className="flex justify-center">
                            <button
                                onClick={() => {
                                    console.log("🏠 [GameInterrupted] User confirmed game interruption, returning to lobby:", {
                                        interruptedBy: interruptedByPlayerName,
                                        debugMode,
                                        actualUserId: userId.substring(0, 8)
                                    });
                                    
                                    setShowGameInterruptedDialog(false);
                                    setInterruptedByPlayerName('');
                                    performCompleteStateReset();
                                    setScreen('lobby');
                                }}
                                className="px-6 py-3 bg-blue-500 hover:bg-blue-600 text-white rounded-lg font-semibold"
                            >
                                確認
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* バトル待機ダイアログ（非当事者用） */}
            {showBattleWaitDialog && (
                <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
                    <div className="bg-white rounded-lg p-6 max-w-md w-11/12">
                        <h2 className="text-xl font-bold mb-4 text-gray-800 text-center">
                            ⚔️ バトルが発生しました
                        </h2>
                        <div className="text-center mb-6">
                            <div className="mb-4">
                                <div className="flex items-center justify-center mb-2">
                                    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-orange-600"></div>
                                </div>
                                <p className="text-gray-600 mb-2">
                                    以下のプレイヤー間でバトルが発生しています：
                                </p>
                                <div className="flex justify-center space-x-2 mb-4">
                                    {battleParticipants.map((participantId, index) => (
                                        <span key={participantId} className="font-semibold text-blue-600">
                                            {getUserNameById(participantId)}
                                            {index < battleParticipants.length - 1 && " vs "}
                                        </span>
                                    ))}
                                </div>
                                <p className="text-orange-600 font-semibold">
                                    バトル終了までお待ちください
                                </p>
                                <p className="text-sm text-gray-500 mt-2">
                                    両プレイヤーがポイントを賭け、結果が決まるまでゲームは一時停止されます
                                </p>
                            </div>
                        </div>
                        <div className="text-center text-xs text-gray-400">
                            このダイアログは自動的に閉じられます
                        </div>
                    </div>
                </div>
            )}

            {/* バトル待機ポップアップ（当事者用 - 相手の入力待ち） */}
            {showBattleWaitingPopup && (
                <div className="fixed inset-0 bg-black bg-opacity-75 flex items-center justify-center z-50 p-4">
                    <div className="bg-white p-6 rounded-lg shadow-xl w-full max-w-sm text-center">
                        <h2 className="text-2xl font-bold mb-4 flex items-center justify-center">
                            <Clock size={28} className="mr-2"/>
                            お待ちください
                        </h2>
                        
                        <div className="mb-4">
                            <p className="text-lg font-medium mb-2">相手のポイント選択待ちです</p>
                            <p className="text-sm text-gray-600">
                                相手がポイントを選択すると、自動的にバトル結果が表示されます
                            </p>
                        </div>
                        
                        <div className="flex justify-center mb-4">
                            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500"></div>
                        </div>
                        
                        <p className="text-xs text-gray-400">
                            このダイアログは自動的に閉じられます
                        </p>
                    </div>
                </div>
            )}

            {/* バトル結果ポップアップ（当事者のみ表示） */}
            {showBattleResultPopup && battleResultData && (
                <div className="fixed inset-0 bg-black bg-opacity-75 flex items-center justify-center z-50 p-4">
                    <div className="bg-white p-6 rounded-lg shadow-xl w-full max-w-sm text-center">
                        <h2 className="text-2xl font-bold mb-4 flex items-center justify-center">
                            <Swords size={28} className="mr-2"/>
                            {battleResultData.isDraw ? '🤝 引き分け' : 
                             battleResultData.isWinner ? '🏆 勝利！' : '💀 敗北...'}
                        </h2>
                        
                        <div className="mb-4 p-4 bg-gray-50 rounded-lg">
                            <p className="text-lg font-semibold mb-2">バトル結果</p>
                            <div className="flex justify-between items-center mb-2">
                                <span className="font-medium">あなた:</span>
                                <span className="text-lg font-bold">{battleResultData.myBet}pt</span>
                            </div>
                            <div className="flex justify-between items-center">
                                <span className="font-medium">{battleResultData.opponentName}:</span>
                                <span className="text-lg font-bold">{battleResultData.opponentBet}pt</span>
                            </div>
                        </div>
                        
                        {!battleResultData.isDraw && (
                            <p className="text-sm text-gray-600 mb-4">
                                {battleResultData.isWinner ? 
                                    "勝利ボーナス: +5pt" : 
                                    "次のターンは行動不能になります"}
                            </p>
                        )}
                        
                        <button 
                            onClick={() => setShowBattleResultPopup(false)}
                            className="w-full bg-blue-500 hover:bg-blue-600 text-white font-bold py-3 px-4 rounded-lg transition-colors"
                        >
                            確認
                        </button>
                    </div>
                </div>
            )}

            {/* ゴール通知ポップアップ（四人対戦用） */}
            {showGoalNotificationPopup && goalNotificationData && (
                <div className="fixed inset-0 bg-black bg-opacity-75 flex items-center justify-center z-50 p-4">
                    <div className="bg-white p-6 rounded-lg shadow-xl w-full max-w-md text-center">
                        <h2 className="text-2xl font-bold mb-4 flex items-center justify-center">
                            🎉 {goalNotificationData.rank}位ゴール達成！
                        </h2>
                        
                        <div className="mb-4 p-4 bg-yellow-50 rounded-lg">
                            <div className="text-lg font-semibold text-yellow-800 mb-2">
                                {goalNotificationData.isMyself ? (
                                    <span className="text-green-600">🏆 あなたがゴールしました！</span>
                                ) : (
                                    <span>🏃 {goalNotificationData.goalerName}がゴールしました</span>
                                )}
                            </div>
                            <div className="text-sm text-gray-600 space-y-1">
                                <p>順位: {goalNotificationData.rank}位 / {goalNotificationData.totalPlayers}人</p>
                                <p>残り: {goalNotificationData.remainingPlayers}人</p>
                                {goalNotificationData.goaledCount >= 3 ? (
                                    <p className="text-red-600 font-semibold">ゲーム終了！</p>
                                ) : (
                                    <p className="text-blue-600">ゲーム続行中...</p>
                                )}
                            </div>
                        </div>
                        
                        <button 
                            onClick={() => {
                                setShowGoalNotificationPopup(false);
                                // 3人目のゴール時は少し遅れてリザルト画面を表示
                                if (goalNotificationData.goaledCount >= 3) {
                                    setTimeout(() => {
                                        // ゲーム終了処理は既存のuseEffectに委任
                                    }, 2000);
                                }
                            }}
                            className="w-full bg-blue-500 hover:bg-blue-600 text-white font-bold py-3 px-4 rounded-lg transition-colors"
                        >
                            確認
                        </button>
                    </div>
                </div>
            )}

            {/* バトル勝利画面（豪華版） */}
            {showBattleVictoryScreen && victoryScreenData && (
                <div className="fixed inset-0 bg-gradient-to-br from-purple-900 via-blue-900 to-indigo-900 flex items-center justify-center z-50 p-4">
                    {/* 背景アニメーション - 輝く星々 */}
                    <div className="absolute inset-0 overflow-hidden">
                        <div className="absolute top-10 left-10 w-4 h-4 bg-yellow-400 rounded-full sparkle"></div>
                        <div className="absolute top-32 right-20 w-3 h-3 bg-yellow-300 rounded-full sparkle" style={{animationDelay: '0.2s'}}></div>
                        <div className="absolute bottom-20 left-1/4 w-2 h-2 bg-yellow-500 rounded-full sparkle" style={{animationDelay: '0.4s'}}></div>
                        <div className="absolute bottom-32 right-1/3 w-3 h-3 bg-yellow-400 rounded-full sparkle" style={{animationDelay: '0.6s'}}></div>
                        <div className="absolute top-1/2 left-12 w-2 h-2 bg-yellow-300 rounded-full sparkle" style={{animationDelay: '0.8s'}}></div>
                        <div className="absolute top-20 right-1/2 w-4 h-4 bg-yellow-500 rounded-full sparkle" style={{animationDelay: '1s'}}></div>
                        <div className="absolute top-1/4 left-1/3 w-3 h-3 bg-orange-400 rounded-full sparkle" style={{animationDelay: '1.2s'}}></div>
                        <div className="absolute bottom-1/4 right-1/4 w-2 h-2 bg-orange-300 rounded-full sparkle" style={{animationDelay: '1.4s'}}></div>
                    </div>
                    
                    <div className="bg-white p-8 rounded-2xl shadow-2xl w-full max-w-lg text-center relative overflow-hidden victory-glow">
                        {/* 上部の装飾光線 */}
                        <div className="absolute top-0 left-0 right-0 h-2 bg-gradient-to-r from-yellow-400 via-orange-500 to-red-500 victory-shine"></div>
                        
                        {/* メインタイトル */}
                        <div className="mb-6 victory-float">
                            <div className="text-6xl mb-2 animate-bounce">🏆</div>
                            <h1 className="text-4xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-yellow-600 via-orange-600 to-red-600 mb-2">
                                VICTORY!
                            </h1>
                            <div className="text-2xl font-bold text-gray-800 mb-1">バトル勝利！</div>
                            <div className="text-lg text-gray-600">
                                {victoryScreenData.opponentName}を撃破！
                            </div>
                        </div>
                        
                        {/* 勝敗詳細 */}
                        <div className="mb-6 p-6 bg-gradient-to-r from-yellow-50 to-orange-50 rounded-xl border-2 border-yellow-200 shadow-inner">
                            <div className="text-lg font-semibold text-gray-800 mb-4 flex items-center justify-center">
                                <Swords className="mr-2" size={20} />
                                バトル結果
                            </div>
                            <div className="grid grid-cols-2 gap-4 mb-4">
                                <div className="text-center p-3 bg-green-100 rounded-lg border-2 border-green-300 transform hover:scale-105 transition-transform">
                                    <div className="text-sm text-green-700 font-medium">あなた</div>
                                    <div className="text-2xl font-bold text-green-800">{victoryScreenData.myBet}pt</div>
                                    <div className="text-xs text-green-600 font-semibold">🏆 勝者</div>
                                </div>
                                <div className="text-center p-3 bg-red-100 rounded-lg border-2 border-red-300 opacity-75">
                                    <div className="text-sm text-red-700 font-medium">{victoryScreenData.opponentName}</div>
                                    <div className="text-2xl font-bold text-red-800">{victoryScreenData.opponentBet}pt</div>
                                    <div className="text-xs text-red-600">💀 敗者</div>
                                </div>
                            </div>
                        </div>
                        
                        {/* 獲得ポイント */}
                        <div className="mb-6 p-4 bg-gradient-to-r from-green-100 to-emerald-100 rounded-xl border-2 border-green-300 shadow-lg">
                            <div className="text-lg font-semibold text-green-800 mb-2 flex items-center justify-center">
                                🎁 勝利ボーナス
                            </div>
                            <div className="text-3xl font-bold text-green-600 animate-pulse">+{victoryScreenData.pointsGained}pt</div>
                            <div className="text-sm text-green-700 mt-1">スコアに加算されました！</div>
                        </div>
                        
                        {/* 特殊効果メッセージ */}
                        <div className="mb-6 p-3 bg-orange-100 rounded-lg border border-orange-300 shadow-inner">
                            <div className="text-sm text-orange-800 flex items-center justify-center">
                                <AlertTriangle className="mr-2" size={16} />
                                💀 {victoryScreenData.opponentName}は次のターン行動不能になります
                            </div>
                        </div>
                        
                        {/* 閉じるボタン */}
                        <button 
                            onClick={() => {
                                setShowBattleVictoryScreen(false);
                                setVictoryScreenData(null);
                            }}
                            className="w-full bg-gradient-to-r from-yellow-500 to-orange-500 hover:from-yellow-600 hover:to-orange-600 text-white font-bold py-4 px-6 rounded-xl text-lg transition-all duration-300 transform hover:scale-105 shadow-lg hover:shadow-xl"
                        >
                            🎉 続行する
                        </button>
                        
                        {/* 自動閉じタイマー表示 */}
                        <div className="mt-3 text-xs text-gray-500">
                            10秒後に自動的に閉じます
                        </div>
                        
                        {/* 下部の装飾光線 */}
                        <div className="absolute bottom-0 left-0 right-0 h-2 bg-gradient-to-r from-red-500 via-orange-500 to-yellow-400"></div>
                        
                        {/* 光の効果 */}
                        <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 w-full h-full">
                            <div className="absolute top-4 right-4 w-8 h-8 bg-yellow-300 rounded-full opacity-30 animate-ping"></div>
                            <div className="absolute bottom-4 left-4 w-6 h-6 bg-orange-300 rounded-full opacity-30 animate-ping" style={{animationDelay: '0.5s'}}></div>
                        </div>
                    </div>
                </div>
            )}

            
            {/* デバッグコントロール */}
            {debugMode && (
                <DebugControls
                    debugMode={debugMode}
                    gameData={gameData}
                    debugCurrentPlayerId={debugCurrentPlayerId}
                    setDebugCurrentPlayerId={setDebugCurrentPlayerId}
                    showOpponentWallsDebug={showOpponentWallsDebug}
                    setShowOpponentWallsDebug={setShowOpponentWallsDebug}
                    debugPlayerStates={debugPlayerStates}
                    userId={userId}
                />
            )}
        </div>
    );
};

export default PlayScreen;
