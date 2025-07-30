import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
    doc, updateDoc, serverTimestamp, increment, collection, addDoc, query, onSnapshot, orderBy, limit
} from 'firebase/firestore';
import { db, appId } from '../firebase';

// Components
import GameLayout from './GameLayout';
import GameInfo from './GameInfo';
import PlayerInfo from './PlayerInfo';
import MovementControls from './MovementControls';
import ActionSelection from './ActionSelection';
import PlayerMazeView from './PlayerMazeView';
import ChatSection from './ChatSection';
import DebugControls from './DebugControls';
import MazeGrid from './MazeGrid';
import BattleModal from './BattleModal';
import GameOverModal from './GameOverModal';
import { HelpOverlay } from './HelpOverlay';
import ReviewModeScreen from './ReviewModeScreen';

// Hooks
import { useGameState } from '../hooks/useGameState';
import { useGameLogic } from '../hooks/useGameLogic';
import { useChat } from '../hooks/useChat';

// Constants and utilities
import { STANDARD_GRID_SIZE, EXTRA_GRID_SIZE } from '../constants';
import { formatTime } from '../utils';

const PlayScreen = ({ userId, setScreen, gameMode, debugMode }) => {
    // カスタムフックから状態とメソッドを取得
    const gameState = useGameState(userId, setScreen, gameMode, debugMode);
    const {
        gameId, gameData, myPlayerState, mazeToPlayData, myCreatedMazeData,
        playerSolvingMyMaze, message, setMessage, gameType, setGameType,
        showOpponentWallsDebug, setShowOpponentWallsDebug,
        showHelpOverlay, setShowHelpOverlay,
        showReviewMode, setShowReviewMode,
        showExitConfirmDialog, setShowExitConfirmDialog,
        isBattleModalOpen, setIsBattleModalOpen,
        battleOpponentId, setBattleOpponentId,
        isMoving, setIsMoving, hitWalls, setHitWalls,
        isGameOverModalOpen, setIsGameOverModalOpen,
        debugCurrentPlayerId, setDebugCurrentPlayerId,
        debugPlayerStates, debugMazeData,
        effectiveUserId, effectivePlayerState,
        isMyStandardTurn, inStandardBattleBetting,
        sendSystemChatMessage, handleGameExit
    } = gameState;

    // ゲームロジック用フック
    const gameLogic = useGameLogic(
        gameId, gameData, gameType, userId, 
        mazeToPlayData, sendSystemChatMessage
    );

    // チャット用フック
    const chat = useChat(gameId, userId);

    // ローカル状態（エクストラモード用）
    const [selectedAction, setSelectedAction] = useState(null);
    const [actionTarget, setActionTarget] = useState(null);
    const [sabotageType, setSabotageType] = useState(null);
    const [negotiationDetails, setNegotiationDetails] = useState({ 
        type: null, duration: null, conditions: ""
    });
    const [showActionDetails, setShowActionDetails] = useState(false);
    const [selectedMoveTarget, setSelectedMoveTarget] = useState(null);
    const [isSelectingMoveTarget, setIsSelectingMoveTarget] = useState(false);
    const [trapPlacementCoord, setTrapPlacementCoord] = useState(null);
    const [isPlacingTrap, setIsPlacingTrap] = useState(false);
    
    // その他のローカル状態
    const [phaseTimeLeft, setPhaseTimeLeft] = useState(null);
    const [overallTimeLeft, setOverallTimeLeft] = useState(null);
    const [selectedViewPlayerId, setSelectedViewPlayerId] = useState(null);

    const currentGridSize = gameType === 'extra' ? EXTRA_GRID_SIZE : STANDARD_GRID_SIZE;

    // 移動処理
    const handleMove = useCallback((direction) => {
        if (gameType === 'standard') {
            const canMove = debugMode ? true : (isMyStandardTurn && !inStandardBattleBetting);
            if (!canMove || isMoving) return;

            gameLogic.handleStandardMove(
                direction, setIsMoving, setMessage, setHitWalls,
                debugMode, effectiveUserId, effectivePlayerState
            );
        }
    }, [gameType, debugMode, isMyStandardTurn, inStandardBattleBetting, isMoving, 
        gameLogic, effectiveUserId, effectivePlayerState]);

    // セルクリック処理
    const handleCellClick = (r, c) => {
        if (gameType === 'extra') {
            if (isSelectingMoveTarget && selectedAction === 'move') {
                const { r: currentR, c: currentC } = effectivePlayerState?.position || { r: 0, c: 0 };
                const isAdjacent = (Math.abs(r - currentR) === 1 && c === currentC) || 
                                  (Math.abs(c - currentC) === 1 && r === currentR);
                
                if (isAdjacent && r >= 0 && r < currentGridSize && c >= 0 && c < currentGridSize) {
                    setSelectedMoveTarget({ r, c });
                    setIsSelectingMoveTarget(false);
                    setMessage(`移動先 (${r}, ${c}) を選択しました。`);
                } else {
                    setMessage("隣接するセルにのみ移動できます。");
                }
            } else if (isPlacingTrap && selectedAction === 'sabotage' && sabotageType === 'trap') {
                setTrapPlacementCoord({ r, c });
                setIsPlacingTrap(false);
                setMessage(`トラップ設置座標 (${r}, ${c}) を選択しました。`);
            }
        } else if (gameType === 'standard') {
            const canMove = debugMode ? true : (isMyStandardTurn && !inStandardBattleBetting);
            if (canMove) {
                const { r: currentR, c: currentC } = effectivePlayerState?.position || { r: 0, c: 0 };
                const isAdjacent = (Math.abs(r - currentR) === 1 && c === currentC) || 
                                  (Math.abs(c - currentC) === 1 && r === currentR);
                
                if (isAdjacent) {
                    if (r < currentR) handleMove('up');
                    else if (r > currentR) handleMove('down');
                    else if (c < currentC) handleMove('left');
                    else if (c > currentC) handleMove('right');
                } else {
                    setMessage("隣接するセルにのみ移動できます。");
                }
            }
        }
    };

    // アクション宣言処理
    const handleDeclareAction = useCallback(() => {
        if (!selectedAction) return;
        
        let actionDetails = { type: selectedAction };
        
        switch(selectedAction) {
            case 'move':
                if (!selectedMoveTarget) {
                    setMessage("移動先を選択してください。");
                    return;
                }
                actionDetails.details = { targetCell: selectedMoveTarget };
                break;
                
            case 'scout':
                if (!actionTarget) {
                    setMessage("偵察対象を選択してください。");
                    return;
                }
                actionDetails.targetId = actionTarget;
                break;
                
            case 'sabotage':
                if (!sabotageType || !actionTarget) {
                    setMessage("妨害の種類と対象を選択してください。");
                    return;
                }
                actionDetails.details = { sabotageType };
                actionDetails.targetId = actionTarget;
                if (sabotageType === 'trap' && trapPlacementCoord) {
                    actionDetails.details.coordinate = trapPlacementCoord;
                }
                break;
                
            case 'negotiate':
                if (!negotiationDetails.type || !actionTarget) {
                    setMessage("交渉の種類と対象を選択してください。");
                    return;
                }
                actionDetails.details = { negotiation: negotiationDetails };
                actionDetails.targetId = actionTarget;
                break;
                
            case 'wait':
                // 待機は追加データ不要
                break;
                
            default:
                setMessage("無効なアクションです。");
                return;
        }
        
        gameLogic.declareAction(actionDetails, setMessage);
        
        // 状態をリセット
        setSelectedAction(null);
        setActionTarget(null);
        setSabotageType(null);
        setNegotiationDetails({ type: null, duration: null, conditions: "" });
        setSelectedMoveTarget(null);
        setTrapPlacementCoord(null);
        setShowActionDetails(false);
    }, [selectedAction, selectedMoveTarget, actionTarget, sabotageType, 
        negotiationDetails, trapPlacementCoord, gameLogic]);

    // 移動先選択開始
    const startMoveTargetSelection = () => {
        if (selectedAction === 'move') {
            setIsSelectingMoveTarget(true);
            setMessage("移動先のセルをクリックしてください。");
        }
    };

    // バトル処理
    const handleBattleBet = (betAmount) => {
        gameLogic.handleBattleBet(
            betAmount, battleOpponentId, setIsBattleModalOpen, 
            setMessage, effectiveUserId
        );
    };

    // キーボード操作
    useEffect(() => {
        const handleKeyPress = (event) => {
            if (gameType === 'standard' && isMyStandardTurn && !inStandardBattleBetting) {
                switch(event.key) {
                    case 'ArrowUp': 
                    case 'w': 
                    case 'W':
                        event.preventDefault();
                        handleMove('up');
                        break;
                    case 'ArrowDown': 
                    case 's': 
                    case 'S':
                        event.preventDefault();
                        handleMove('down');
                        break;
                    case 'ArrowLeft': 
                    case 'a': 
                    case 'A':
                        event.preventDefault();
                        handleMove('left');
                        break;
                    case 'ArrowRight': 
                    case 'd': 
                    case 'D':
                        event.preventDefault();
                        handleMove('right');
                        break;
                }
            }
        };

        window.addEventListener('keydown', handleKeyPress);
        return () => window.removeEventListener('keydown', handleKeyPress);
    }, [gameType, isMyStandardTurn, inStandardBattleBetting, handleMove]);

    // 感想戦モード表示
    if (showReviewMode) {
        return (
            <ReviewModeScreen
                gameData={gameData}
                mazeData={mazeToPlayData}
                allMazeData={gameData?.mazes || {}}
                userId={userId}
                gameId={gameId}
                onExit={() => setShowReviewMode(false)}
            />
        );
    }

    return (
        <GameLayout
            gameType={gameType}
            onExitClick={() => setShowExitConfirmDialog(true)}
            onHelpClick={() => setShowHelpOverlay(true)}
            onReviewModeClick={() => setShowReviewMode(true)}
            showExitConfirmDialog={showExitConfirmDialog}
            onExitConfirm={() => {
                setShowExitConfirmDialog(false);
                handleGameExit();
            }}
            onExitCancel={() => setShowExitConfirmDialog(false)}
            showReviewMode={showReviewMode}
        >
            {/* メインゲーム画面 */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                {/* 左側: 自分の迷路 + プレイヤー情報 */}
                <div className="space-y-4">
                    {/* 自分の攻略する迷路 */}
                    {mazeToPlayData && (
                        <div className="bg-white p-4 rounded-lg shadow-md">
                            <h3 className="text-lg font-semibold mb-3">攻略する迷路</h3>
                            <MazeGrid
                                maze={mazeToPlayData}
                                gridSize={currentGridSize}
                                playerPosition={effectivePlayerState?.position}
                                onCellClick={handleCellClick}
                                showWalls={true}
                                playerRevealedCells={effectivePlayerState?.revealedCells || {}}
                                hitWalls={hitWalls}
                                isSelectingTarget={isSelectingMoveTarget || isPlacingTrap}
                            />
                        </div>
                    )}

                    {/* プレイヤー情報 */}
                    <PlayerInfo
                        playerState={myPlayerState}
                        effectivePlayerState={effectivePlayerState}
                        gameData={gameData}
                        effectiveUserId={effectiveUserId}
                        gameType={gameType}
                        isMyTurn={isMyStandardTurn}
                        formatTime={formatTime}
                        debugMode={debugMode}
                    />
                </div>

                {/* 中央: チャット + 移動コントロール/アクション選択 */}
                <div className="space-y-4">
                    {/* チャット */}
                    <ChatSection
                        gameId={gameId}
                        userId={userId}
                        gameData={gameData}
                        myPlayerState={myPlayerState}
                        showHelpOverlay={showHelpOverlay}
                        setShowHelpOverlay={setShowHelpOverlay}
                        inBattle={!!effectivePlayerState?.inBattleWith}
                    />

                    {/* 移動コントロール（スタンダード）/ アクション選択（エクストラ） */}
                    {gameType === 'standard' ? (
                        <MovementControls
                            gameType={gameType}
                            isMyTurn={isMyStandardTurn}
                            isMoving={isMoving}
                            message={message}
                            onMove={handleMove}
                            disabled={false}
                            canMove={true}
                            inBattle={inStandardBattleBetting}
                        />
                    ) : (
                        <ActionSelection
                            gameType={gameType}
                            selectedAction={selectedAction}
                            setSelectedAction={setSelectedAction}
                            actionTarget={actionTarget}
                            setActionTarget={setActionTarget}
                            sabotageType={sabotageType}
                            setSabotageType={setSabotageType}
                            negotiationDetails={negotiationDetails}
                            setNegotiationDetails={setNegotiationDetails}
                            selectedMoveTarget={selectedMoveTarget}
                            setSelectedMoveTarget={setSelectedMoveTarget}
                            isSelectingMoveTarget={isSelectingMoveTarget}
                            setIsSelectingMoveTarget={setIsSelectingMoveTarget}
                            showActionDetails={showActionDetails}
                            setShowActionDetails={setShowActionDetails}
                            trapPlacementCoord={trapPlacementCoord}
                            setTrapPlacementCoord={setTrapPlacementCoord}
                            isPlacingTrap={isPlacingTrap}
                            setIsPlacingTrap={setIsPlacingTrap}
                            myPlayerState={myPlayerState}
                            gameData={gameData}
                            gameMode={gameMode}
                            onDeclareAction={handleDeclareAction}
                            onStartMoveTargetSelection={startMoveTargetSelection}
                        />
                    )}
                </div>

                {/* 右側: 他のプレイヤーの迷路 + ゲーム情報 */}
                <div className="space-y-4">
                    {/* 他のプレイヤーの迷路 */}
                    <PlayerMazeView
                        gameData={gameData}
                        effectiveUserId={effectiveUserId}
                        selectedViewPlayerId={selectedViewPlayerId}
                        setSelectedViewPlayerId={setSelectedViewPlayerId}
                        currentGridSize={currentGridSize}
                        debugMode={debugMode}
                        showOpponentWallsDebug={showOpponentWallsDebug}
                        setShowOpponentWallsDebug={setShowOpponentWallsDebug}
                    />

                    {/* ゲーム情報 */}
                    <GameInfo
                        gameData={gameData}
                        gameType={gameType}
                        phaseTimeLeft={phaseTimeLeft}
                        overallTimeLeft={overallTimeLeft}
                        formatTime={formatTime}
                        message={message}
                        debugMode={debugMode}
                    />
                </div>
            </div>

            {/* デバッグコントロール */}
            <DebugControls
                debugMode={debugMode}
                gameData={gameData}
                debugCurrentPlayerId={debugCurrentPlayerId}
                setDebugCurrentPlayerId={setDebugCurrentPlayerId}
                showOpponentWallsDebug={showOpponentWallsDebug}
                setShowOpponentWallsDebug={setShowOpponentWallsDebug}
                debugPlayerStates={debugPlayerStates}
                userId={userId}
                onPlayerSwitch={(playerId) => {
                    setDebugCurrentPlayerId(playerId);
                    console.log(`🔧 [DEBUG] Switched to player: ${playerId.substring(0,8)}...`);
                }}
            />

            {/* モーダル類 */}
            <BattleModal
                isOpen={isBattleModalOpen}
                onClose={() => setIsBattleModalOpen(false)}
                opponentId={battleOpponentId}
                myScore={effectivePlayerState?.score || 0}
                onBet={handleBattleBet}
            />

            <GameOverModal
                isOpen={isGameOverModalOpen}
                onClose={() => setIsGameOverModalOpen(false)}
                gameData={gameData}
                userId={userId}
                onBackToLobby={() => setScreen('lobby')}
            />

            <HelpOverlay
                isVisible={showHelpOverlay}
                onClose={() => setShowHelpOverlay(false)}
                gameType={gameType}
            />
        </GameLayout>
    );
};

export default PlayScreen;
