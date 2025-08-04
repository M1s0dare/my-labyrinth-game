import { useCallback } from 'react';
import { 
    doc, updateDoc, serverTimestamp, increment, 
    runTransaction, Timestamp, arrayUnion 
} from 'firebase/firestore';
import { db, appId } from '../firebase';
import { STANDARD_GRID_SIZE, EXTRA_GRID_SIZE } from '../constants';

export const useGameLogic = (gameId, gameData, gameType, userId, mazeToPlayData, sendSystemChatMessage) => {
    // スタンダードモード用の移動処理
    const handleStandardMove = useCallback(async (direction, setIsMoving, setMessage, setHitWalls, debugMode = false, effectiveUserId = null, effectivePlayerState = null) => {
        const actualUserId = effectiveUserId || userId;
        const playerState = effectivePlayerState || gameData?.playerStates?.[userId];
        
        if (!playerState || !gameId) return;
        
        setIsMoving(true);
        setMessage("移動中...");
        
        // 2秒待機
        await new Promise(resolve => setTimeout(resolve, 2000));
        
        const gameDocRef = doc(db, `artifacts/${appId}/public/data/labyrinthGames`, gameId);
        const { r: currentR, c: currentC } = playerState.position;
        
        let newR = currentR;
        let newC = currentC;
        
        switch(direction) {
            case 'up': newR--; break;
            case 'down': newR++; break;
            case 'left': newC--; break;
            case 'right': newC++; break;
            default: 
                setIsMoving(false);
                return;
        }
        
        const gridSize = mazeToPlayData?.gridSize || STANDARD_GRID_SIZE;
        
        // 境界チェック
        if (newR < 0 || newR >= gridSize || newC < 0 || newC >= gridSize) {
            setMessage("盤外への移動はできません。");
            setIsMoving(false);
            return;
        }
        
        // 壁チェック
        const walls = mazeToPlayData?.walls || [];
        let hitWall = null;
        const isBlocked = walls.some(wall => {
            if (wall.type === 'horizontal') {
                if (direction === 'up' && wall.r === currentR && wall.c === currentC) {
                    hitWall = wall;
                    return true;
                }
                if (direction === 'down' && wall.r === newR && wall.c === newC) {
                    hitWall = wall;
                    return true;
                }
            } else if (wall.type === 'vertical') {
                if (direction === 'left' && wall.r === currentR && wall.c === currentC) {
                    hitWall = wall;
                    return true;
                }
                if (direction === 'right' && wall.r === currentR && wall.c === newC) {
                    hitWall = wall;
                    return true;
                }
            }
            return false;
        });
        
        if (isBlocked && hitWall) {
            setHitWalls(prev => {
                const wallKey = `${hitWall.type}-${hitWall.r}-${hitWall.c}`;
                if (!prev.some(w => `${w.type}-${w.r}-${w.c}` === wallKey)) {
                    return [...prev, hitWall];
                }
                return prev;
            });
            
            // hitWallsをFirestoreに保存
            try {
                const gameDocRef = doc(db, `artifacts/${appId}/public/data/labyrinthGames`, gameId);
                const wallKey = `${hitWall.type}-${hitWall.r}-${hitWall.c}`;
                
                // 現在のhitWallsを取得して新しい壁を追加
                const currentHitWalls = gameData?.playerStates?.[actualUserId]?.hitWalls || [];
                const isAlreadyHit = currentHitWalls.some(w => `${w.type}-${w.r}-${w.c}` === wallKey);
                
                if (!isAlreadyHit) {
                    const updatedHitWalls = [...currentHitWalls, hitWall];
                    await updateDoc(gameDocRef, {
                        [`playerStates.${actualUserId}.hitWalls`]: updatedHitWalls
                    });
                }
            } catch (error) {
                console.error("Error saving hit wall:", error);
            }
            
            setMessage("壁に阻まれて移動できません。");
            setIsMoving(false);
            return;
        }
        
        try {
            // 四人対戦モードでのバトル発生チェック
            let battleOpponent = null;
            if (gameData?.mode === '4player') {
                const otherPlayers = Object.entries(gameData.playerStates || {})
                    .filter(([pid, ps]) => pid !== actualUserId && ps.position)
                    .find(([pid, ps]) => ps.position.r === newR && ps.position.c === newC);
                
                if (otherPlayers) {
                    battleOpponent = otherPlayers[0];
                }
            }

            const updates = {
                [`playerStates.${actualUserId}.position`]: { r: newR, c: newC },
                [`playerStates.${actualUserId}.lastMoveTime`]: serverTimestamp(),
            };
            
            // 新しいセルの発見ボーナス
            if (!playerState.revealedCells[`${newR}-${newC}`]) {
                updates[`playerStates.${actualUserId}.score`] = increment(1);
                updates[`playerStates.${actualUserId}.revealedCells.${newR}-${newC}`] = true;
                setMessage(`(${newR},${newC})に移動！ +1pt`);
            } else {
                setMessage(`(${newR},${newC})に移動しました。`);
            }
            
            // ゴール判定
            if (mazeToPlayData && newR === mazeToPlayData.goal.r && newC === mazeToPlayData.goal.c && !playerState.goalTime) {
                updates[`playerStates.${actualUserId}.goalTime`] = serverTimestamp();
                updates.goalCount = increment(1);
                
                if (gameData?.mode === '4player') {
                    const goalOrder = [20, 15, 10, 0];
                    const currentGoalCount = (gameData.goalCount || 0);
                    const goalPoints = goalOrder[currentGoalCount] || 0;
                    if (goalPoints > 0) {
                        updates[`playerStates.${actualUserId}.score`] = increment(goalPoints);
                    }
                    setMessage(`ゴール達成！${currentGoalCount + 1}位 +${goalPoints}pt`);
                } else {
                    setMessage("ゴール達成！");
                }
            }

            // バトル発生処理
            if (battleOpponent && gameData?.mode === '4player') {
                updates[`playerStates.${actualUserId}.inBattleWith`] = battleOpponent;
                updates[`playerStates.${battleOpponent}.inBattleWith`] = actualUserId;
                updates.activeBattle = {
                    battleId: `battle_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
                    player1: actualUserId,
                    player2: battleOpponent,
                    startTime: serverTimestamp(),
                    status: 'betting',
                    participants: [actualUserId, battleOpponent]
                };
                
                // 全員への通知メッセージ
                const player1Name = actualUserId === userId ? "あなた" : `プレイヤー${actualUserId.substring(0,8)}...`;
                const player2Name = battleOpponent === userId ? "あなた" : `プレイヤー${battleOpponent.substring(0,8)}...`;
                await sendSystemChatMessage(`🔥 バトル発生！ ${player1Name} vs ${player2Name}`);
                
                // 当事者の場合のメッセージ
                if (actualUserId === userId || battleOpponent === userId) {
                    setMessage("🔥 バトル発生！ポイントを賭けてください。");
                } else {
                    setMessage("⚔️ バトルが発生しました。結果をお待ちください。");
                }
            }
            
            // デバッグモード時は自動的にターン切り替え
            if (debugMode && gameData?.turnOrder) {
                const currentTurnIndex = gameData.turnOrder.indexOf(gameData.currentTurnPlayerId);
                const nextTurnIndex = (currentTurnIndex + 1) % gameData.turnOrder.length;
                const nextPlayerId = gameData.turnOrder[nextTurnIndex];
                
                updates.currentTurnPlayerId = nextPlayerId;
                updates.turnNumber = increment(1);
            }
            
            await updateDoc(gameDocRef, updates);
            
        } catch (error) {
            console.error("Error moving:", error);
            setMessage("移動に失敗しました。");
        } finally {
            setIsMoving(false);
        }
    }, [gameId, gameData, userId, mazeToPlayData, sendSystemChatMessage]);

    // バトル関連の処理
    const handleBattleBet = useCallback(async (betAmount, battleOpponentId, setIsBattleModalOpen, setMessage, effectiveUserId = null) => {
        if (!gameData?.activeBattle || !battleOpponentId) return;
        
        const actualUserId = effectiveUserId || userId;
        
        try {
            const gameDocRef = doc(db, `artifacts/${appId}/public/data/labyrinthGames`, gameId);
            
            const updates = {
                [`playerStates.${actualUserId}.battleBet`]: betAmount,
                [`playerStates.${actualUserId}.score`]: increment(-betAmount)
            };
            
            await updateDoc(gameDocRef, updates);
            
            setIsBattleModalOpen(false);
            setMessage("ポイントを賭けました。相手の入力を待っています...");
            
        } catch (error) {
            console.error("Error placing battle bet:", error);
            setMessage("賭けに失敗しました。");
        }
    }, [gameId, gameData, userId]);

    // エクストラモード用のアクション宣言
    const declareAction = useCallback(async (actionDetails, setMessage) => {
        if (!gameId || gameData?.currentExtraModePhase !== 'declaration') return;
        
        try {
            const gameDocRef = doc(db, `artifacts/${appId}/public/data/labyrinthGames`, gameId);
            
            const updates = {
                [`playerStates.${userId}.declaredAction`]: actionDetails,
                [`playerStates.${userId}.hasDeclaredThisTurn`]: true
            };
            
            await updateDoc(gameDocRef, updates);
            setMessage("アクションを宣言しました。");
            
        } catch (error) {
            console.error("Error declaring action:", error);
            setMessage("アクション宣言に失敗しました。");
        }
    }, [gameId, gameData, userId]);

    // アクション実行
    const executeAction = useCallback(async (action, setMessage) => {
        if (!gameId || !action) return;
        
        const gameDocRef = doc(db, `artifacts/${appId}/public/data/labyrinthGames`, gameId);
        
        try {
            let updates = {
                [`playerStates.${userId}.actionExecutedThisTurn`]: true
            };
            
            switch (action.type) {
                case 'move':
                    if (action.details?.targetCell) {
                        const { r, c } = action.details.targetCell;
                        updates[`playerStates.${userId}.position`] = { r, c };
                        updates[`playerStates.${userId}.lastMoveTime`] = serverTimestamp();
                        
                        const playerState = gameData?.playerStates?.[userId];
                        if (playerState && !playerState.revealedCells[`${r}-${c}`]) {
                            updates[`playerStates.${userId}.score`] = increment(2);
                            updates[`playerStates.${userId}.revealedCells.${r}-${c}`] = true;
                        }
                        
                        // ゴール判定
                        if (mazeToPlayData && r === mazeToPlayData.goal.r && c === mazeToPlayData.goal.c && !playerState?.goalTime) {
                            updates[`playerStates.${userId}.goalTime`] = serverTimestamp();
                            updates.goalCount = increment(1);
                        }
                        
                        setMessage(`(${r},${c})に移動しました！`);
                    }
                    break;
                    
                case 'scout':
                    if (action.targetId && gameData?.playerStates?.[action.targetId]) {
                        const targetPos = gameData.playerStates[action.targetId].position;
                        updates[`playerStates.${userId}.scoutLogs`] = arrayUnion({
                            targetId: action.targetId,
                            position: targetPos,
                            round: gameData.roundNumber
                        });
                        setMessage(`${action.targetId.substring(0,8)}...の位置を偵察しました。`);
                    }
                    break;
                    
                case 'sabotage':
                    if (action.details?.sabotageType && action.targetId) {
                        const sabotageEffect = {
                            type: action.details.sabotageType,
                            sourceId: userId,
                            expiryRound: (gameData.roundNumber || 1) + 2
                        };
                        
                        updates[`playerStates.${action.targetId}.sabotageEffects`] = arrayUnion(sabotageEffect);
                        setMessage(`${action.targetId.substring(0,8)}...に妨害を実行しました。`);
                    }
                    break;
                    
                case 'wait':
                    setMessage("待機しました。");
                    break;
                    
                default:
                    setMessage("不明なアクションです。");
                    break;
            }
            
            await updateDoc(gameDocRef, updates);
            
        } catch (error) {
            console.error("Error executing action:", error);
            setMessage("アクション実行に失敗しました。");
        }
    }, [gameId, gameData, userId, mazeToPlayData]);

    return {
        handleStandardMove,
        handleBattleBet,
        declareAction,
        executeAction
    };
};
