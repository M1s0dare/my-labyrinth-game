/**
 * 他プレイヤーの迷路表示コンポーネント
 */

import React from 'react';
import { Users, Eye, EyeOff, User, Trophy, MapPin, Target } from 'lucide-react';
import MazeGrid from './MazeGrid';

const PlayerMazeView = ({ 
    gameData,
    effectiveUserId,
    selectedViewPlayerId,
    setSelectedViewPlayerId,
    currentGridSize,
    debugMode = false,
    showOpponentWallsDebug = false,
    setShowOpponentWallsDebug
}) => {
    const otherPlayers = gameData?.players?.filter(pid => pid !== effectiveUserId) || [];

    return (
        <div className="bg-white rounded-lg shadow-md p-4">
            <h2 className="text-lg font-semibold mb-4 text-center flex items-center justify-center">
                <Users className="mr-2" size={20} />
                他のプレイヤーの迷宮
            </h2>
            
            {/* プレイヤー選択ボタン */}
            <div className="mb-4 space-y-2">
                {otherPlayers.map((playerId) => {
                    const playerState = gameData?.playerStates?.[playerId];
                    const isSelected = selectedViewPlayerId === playerId;
                    
                    return (
                        <button
                            key={playerId}
                            onClick={() => setSelectedViewPlayerId(isSelected ? null : playerId)}
                            className={`w-full p-3 rounded-lg border-2 transition-all duration-200 text-left ${
                                isSelected
                                    ? 'border-blue-500 bg-blue-50'
                                    : 'border-gray-200 hover:border-blue-300 hover:bg-blue-50'
                            }`}
                        >
                            <div className="flex items-center justify-between">
                                <div className="flex items-center">
                                    <User className="mr-2" size={16} />
                                    <span className="font-medium">
                                        {gameData?.playerNames?.[playerId] || playerId.substring(0, 8) + '...'}
                                    </span>
                                </div>
                                
                                <div className="flex items-center space-x-2 text-sm">
                                    {playerState?.goalTime && (
                                        <div className="flex items-center text-green-600">
                                            <Target className="mr-1" size={12} />
                                            <span>ゴール</span>
                                        </div>
                                    )}
                                    
                                    {playerState?.inBattleWith && (
                                        <div className="text-red-600">⚔️</div>
                                    )}
                                    
                                    {gameData?.currentTurnPlayerId === playerId && (
                                        <div className="text-green-600">🟢</div>
                                    )}
                                </div>
                            </div>
                            
                            <div className="mt-1 text-xs text-gray-600 space-y-1">
                                <div className="flex items-center">
                                    <MapPin className="mr-1" size={10} />
                                    <span>
                                        位置: ({playerState?.position?.r || 0}, {playerState?.position?.c || 0})
                                    </span>
                                </div>
                                
                                {/* デバッグモードでのみポイント表示（4人対戦では他プレイヤーのポイントは非表示） */}
                                {debugMode && gameData?.mode !== '4player' && (
                                    <div className="flex items-center">
                                        <Trophy className="mr-1" size={10} />
                                        <span>
                                            ポイント: {playerState?.score || 0}pt
                                        </span>
                                    </div>
                                )}
                            </div>
                        </button>
                    );
                })}
            </div>
            
            {/* 選択されたプレイヤーの迷路表示 */}
            {selectedViewPlayerId && gameData?.mazes?.[selectedViewPlayerId] ? (
                <div className="space-y-3">
                    <div className="flex items-center justify-between">
                        <h4 className="font-medium">
                            {gameData?.playerNames?.[selectedViewPlayerId] || selectedViewPlayerId.substring(0, 8) + '...'}の迷路
                        </h4>
                        
                        {/* 詳細情報表示 */}
                        <div className="flex items-center space-x-2 text-sm">
                            {gameData.playerStates?.[selectedViewPlayerId]?.goalTime && (
                                <span className="text-green-600 font-medium">ゴール達成</span>
                            )}
                            
                            {gameData.playerStates?.[selectedViewPlayerId]?.inBattleWith && (
                                <span className="text-red-600">バトル中</span>
                            )}
                        </div>
                    </div>
                    
                    <div className="border rounded-lg p-2 bg-gray-50">
                        <MazeGrid
                            mazeData={gameData.mazes[selectedViewPlayerId]}
                            playerPosition={gameData?.mode === '4player' ? null : gameData.playerStates?.[selectedViewPlayerId]?.position} // 4人対戦時は他プレイヤーの位置を非表示
                            showAllWalls={debugMode ? showOpponentWallsDebug : false}
                            onCellClick={() => {}} // 他プレイヤーの迷路はクリック無効
                            gridSize={currentGridSize}
                            highlightPlayer={gameData?.mode !== '4player'} // 4人対戦時はプレイヤーハイライト無効
                            smallView={false}
                            playerRevealedCells={gameData.playerStates?.[selectedViewPlayerId]?.revealedCells || {}}
                            isOtherPlayerView={true}
                            hitWalls={debugMode && showOpponentWallsDebug ? (gameData.playerStates?.[selectedViewPlayerId]?.hitWalls || []) : []} // デバッグ時は壁表示
                            playerNames={gameData.playerNames || {}} // デバッグ表示用
                            currentUserId={selectedViewPlayerId} // デバッグ表示用
                        />
                    </div>
                    
                    {/* プレイヤー詳細情報 */}
                    <div className="p-2 bg-gray-50 rounded text-xs space-y-1">
                        {/* 4人対戦時は他プレイヤーの位置を非表示 */}
                        {gameData?.mode !== '4player' && (
                            <div>現在位置: ({gameData.playerStates?.[selectedViewPlayerId]?.position?.r || 0}, {gameData.playerStates?.[selectedViewPlayerId]?.position?.c || 0})</div>
                        )}
                        
                        {debugMode && (
                            <>
                                <div>探索済みセル: {Object.keys(gameData.playerStates?.[selectedViewPlayerId]?.revealedCells || {}).length}個</div>
                                <div>最終移動: {gameData.playerStates?.[selectedViewPlayerId]?.lastMoveTime ? '最近' : '未移動'}</div>
                                {/* デバッグモード時のみ4人対戦でも位置表示 */}
                                {gameData?.mode === '4player' && (
                                    <div className="text-orange-600">
                                        [DEBUG] 位置: ({gameData.playerStates?.[selectedViewPlayerId]?.position?.r || 0}, {gameData.playerStates?.[selectedViewPlayerId]?.position?.c || 0})
                                    </div>
                                )}
                                {gameData.playerStates?.[selectedViewPlayerId]?.sabotageEffects?.length > 0 && (
                                    <div className="text-red-600">
                                        妨害効果: {gameData.playerStates[selectedViewPlayerId].sabotageEffects.length}個
                                    </div>
                                )}
                            </>
                        )}
                    </div>
                </div>
            ) : (
                <div className="flex items-center justify-center h-64 bg-gray-50 rounded">
                    <div className="text-center">
                        <p className="text-gray-500">
                            {otherPlayers.length > 0 
                                ? "プレイヤーを選択してください" 
                                : "他のプレイヤーがいません"
                            }
                        </p>
                    </div>
                </div>
            )}
            
            {/* 表示切り替えボタン（デバッグモード時） */}
            {debugMode && setShowOpponentWallsDebug && (
                <div className="mt-4 pt-2 border-t">
                    <button
                        onClick={() => setShowOpponentWallsDebug(!showOpponentWallsDebug)}
                        className={`flex items-center px-3 py-1 rounded text-xs transition-colors ${
                            showOpponentWallsDebug 
                                ? 'bg-blue-500 text-white' 
                                : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
                        }`}
                    >
                        {showOpponentWallsDebug ? (
                            <><Eye className="mr-1" size={12} />壁表示ON</>
                        ) : (
                            <><EyeOff className="mr-1" size={12} />壁表示OFF</>
                        )}
                    </button>
                </div>
            )}
        </div>
    );
};

export default PlayerMazeView;
