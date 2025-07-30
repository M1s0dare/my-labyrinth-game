/**
 * スタンダードモード用のレイアウトコンポーネント
 */

import React from 'react';
import MazeGrid from './MazeGrid';
import ChatSection from './ChatSection';
import MovementControls from './MovementControls';
import PlayerMazeView from './PlayerMazeView';
import PlayerInfo from './PlayerInfo';
import DebugControls from './DebugControls';

const StandardModeLayout = ({
    // 迷路データ
    mazeToPlayData,
    currentGridSize,
    
    // プレイヤー状態
    effectivePlayerState,
    effectiveUserId,
    gameData,
    
    // 移動関連
    isMyStandardTurn,
    isMoving,
    message,
    onMove,
    onCellClick,
    hitWalls,
    
    // チャット関連
    chatMessages,
    chatInput,
    setChatInput,
    onSendChatMessage,
    onShowChatHelp,
    chatLogRef,
    inStandardBattleBetting,
    
    // 他プレイヤー迷路表示
    selectedViewPlayerId,
    setSelectedViewPlayerId,
    
    // デバッグ関連
    debugMode = false,
    debugCurrentPlayerId,
    setDebugCurrentPlayerId,
    showOpponentWallsDebug,
    setShowOpponentWallsDebug,
    debugPlayerStates,
    userId
}) => {
    return (
        <>
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 min-h-[600px]">
            {/* 左側：自分が攻略する迷路 + 自分の情報 */}
            <div className="bg-white rounded-lg shadow-md p-4">
                <h2 className="text-lg font-semibold mb-4 text-center">
                    🎮 攻略する迷宮
                </h2>
                
                {mazeToPlayData ? (
                    <div>
                        {/* 攻略する迷宮グリッド */}
                        <MazeGrid
                            mazeData={mazeToPlayData}
                            playerPosition={effectivePlayerState?.position}
                            onCellClick={onCellClick}
                            revealedCells={effectivePlayerState?.revealedCells || {}}
                            gridSize={currentGridSize}
                            hitWalls={hitWalls}
                            otherPlayers={gameData?.playerStates ? 
                                Object.entries(gameData.playerStates)
                                    .filter(([pid]) => pid !== effectiveUserId)
                                    .map(([pid, pState]) => ({ id: pid, position: pState.position })) 
                                : []
                            }
                            highlightPlayer={true}
                            smallView={false}
                        />
                        
                        {/* 自分の情報表示 */}
                        <PlayerInfo 
                            playerState={effectivePlayerState}
                            gameData={gameData}
                            effectiveUserId={effectiveUserId}
                            isMyTurn={isMyStandardTurn}
                        />
                    </div>
                ) : (
                    <div className="flex items-center justify-center h-64 bg-gray-50 rounded">
                        <div className="text-center">
                            <p className="text-gray-500">迷宮データを読み込み中...</p>
                        </div>
                    </div>
                )}
            </div>

            {/* 中央：チャット + 移動ボタン（バトル時はクローズチャット） */}
            <div className="space-y-4">
                {/* チャットセクション */}
                <ChatSection 
                    chatMessages={chatMessages}
                    chatInput={chatInput}
                    setChatInput={setChatInput}
                    handleSendChatMessage={onSendChatMessage}
                    onShowHelp={onShowChatHelp}
                    chatLogRef={chatLogRef}
                    isInBattle={inStandardBattleBetting}
                    title="オープンチャット"
                />

                {/* 移動操作（バトル中でない場合のみ表示） */}
                {!inStandardBattleBetting && (
                    <MovementControls 
                        isMyTurn={isMyStandardTurn}
                        isMoving={isMoving}
                        message={message}
                        onMove={onMove}
                    />
                )}
            </div>

            {/* 右側：他のユーザーの迷路表示 */}
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
        </div>
        
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
        </>
    );
};

export default StandardModeLayout;
