/**
 * 感想戦モードコンポーネント
 * ゲーム終了後の振り返り画面：両者の迷路全体図、通った場所、ミスした場所の確認
 */

import React, { useState, useEffect, useRef, useMemo } from 'react';
import { ArrowLeft, Eye, Map, MessageSquare, RotateCcw, Send, Users } from 'lucide-react';
import { collection, addDoc, query, orderBy, limit, onSnapshot, serverTimestamp } from 'firebase/firestore';
import { db, appId } from '../firebase';
import { getUsername } from '../utils';
import MazeGrid from './MazeGrid';

/**
 * 感想戦モードコンポーネント
 * @param {Object} gameData - ゲームデータ
 * @param {Object} mazeData - 自分が攻略した迷路データ
 * @param {Object} allMazeData - 全プレイヤーの迷路データ
 * @param {string} userId - 現在のユーザーID
 * @param {string} gameId - ゲームID
 * @param {Function} onExit - 感想戦モードを終了する関数
 */
const ReviewModeScreen = ({ gameData, mazeData, allMazeData = {}, userId, gameId, onExit }) => {
    const [selectedView, setSelectedView] = useState('both'); // 'both', 'player1', 'player2'
    const [chatMessages, setChatMessages] = useState([]);
    const [chatInput, setChatInput] = useState("");
    const chatLogRef = useRef(null);
    
    const currentUserName = getUsername() || "未設定ユーザー";
    const players = gameData.players || [];
    
    // 初期表示は自分が攻略した迷路、なければ最初のプレイヤーの迷路
    const [selectedMazeOwner, setSelectedMazeOwner] = useState(() => {
        const myPlayerState = gameData.playerStates?.[userId];
        return myPlayerState?.assignedMazeOwnerId || players[0] || userId;
    });
    
    // 現在表示中の迷路データを取得
    const currentDisplayMaze = useMemo(() => {
        console.log("🔍 [ReviewMode Debug] allMazeData:", allMazeData);
        console.log("🔍 [ReviewMode Debug] selectedMazeOwner:", selectedMazeOwner);
        console.log("🔍 [ReviewMode Debug] mazeData:", mazeData);
        
        // 最初にallMazeDataから取得を試行
        let maze = allMazeData[selectedMazeOwner];
        
        // 見つからない場合は、mazeDataを使用（自分が攻略した迷路の場合）
        if (!maze && mazeData) {
            maze = mazeData;
        }
        
        // それでも見つからない場合は、gameDataから直接取得を試行
        if (!maze && gameData?.mazes) {
            maze = gameData.mazes[selectedMazeOwner];
        }
        
        console.log("🔍 [ReviewMode Debug] currentDisplayMaze:", maze);
        
        return maze;
    }, [allMazeData, selectedMazeOwner, mazeData, gameData?.mazes]);
    
    // チャットの自動スクロール
    useEffect(() => {
        if (chatLogRef.current) {
            chatLogRef.current.scrollTop = chatLogRef.current.scrollHeight;
        }
    }, [chatMessages]);

    // チャットメッセージの読み込み
    useEffect(() => {
        if (!gameId) {
            console.log("🔍 [ReviewMode] gameId is not available, chat function will be limited");
            return;
        }
        
        const chatCollRef = collection(db, `artifacts/${appId}/public/data/labyrinthGames/${gameId}/chatMessages`);
        const chatQuery = query(chatCollRef, orderBy('timestamp', 'asc'), limit(100));
        
        const unsubscribe = onSnapshot(chatQuery, (snapshot) => {
            const messages = snapshot.docs.map(doc => ({
                id: doc.id,
                ...doc.data()
            }));
            setChatMessages(messages);
        }, (error) => {
            console.error("❌ [ReviewMode] Error loading chat messages:", error);
        });
        
        return () => unsubscribe();
    }, [gameId]);

    // チャットメッセージ送信
    const handleSendChatMessage = async () => {
        if (!chatInput.trim() || !gameId) {
            console.log("🔍 [ReviewMode Chat] Cannot send message:", {
                chatInput: chatInput,
                gameId: gameId,
                isEmpty: !chatInput.trim()
            });
            return;
        }
        
        console.log("🔍 [ReviewMode Chat] Sending message:", {
            chatInput: chatInput,
            gameId: gameId,
            userId: userId,
            currentUserName: currentUserName
        });
        
        const chatCollRef = collection(db, `artifacts/${appId}/public/data/labyrinthGames/${gameId}/chatMessages`);
        
        try {
            await addDoc(chatCollRef, {
                senderId: userId,
                senderName: currentUserName,
                text: chatInput,
                timestamp: serverTimestamp()
            });
            console.log("✅ [ReviewMode Chat] Message sent successfully");
            setChatInput("");
        } catch (error) {
            console.error("❌ [ReviewMode Chat] Error sending review chat message:", error);
            // ユーザーにエラーを通知（オプション）
            alert("メッセージの送信に失敗しました。もう一度お試しください。");
        }
    };
    
    if (!gameData || !gameData.playerStates) {
        return (
            <div className="max-w-7xl mx-auto p-4 bg-gray-100 min-h-screen">
                <div className="text-center">
                    <p className="text-gray-500">データを読み込み中...</p>
                </div>
            </div>
        );
    }

    const currentPlayerState = gameData.playerStates[userId];

    return (
        <div className="max-w-7xl mx-auto p-4 bg-gray-100 min-h-screen">
            {/* ヘッダー */}
            <div className="bg-white rounded-lg shadow-md p-4 mb-4">
                <div className="flex justify-between items-center">
                    <h1 className="text-2xl font-bold text-gray-800 flex items-center">
                        <RotateCcw size={24} className="mr-2 text-blue-600"/>
                        感想戦モード - 全体振り返り
                    </h1>
                    <button
                        onClick={() => {
                            console.log("🚪 [ReviewMode] Exit button clicked");
                            if (onExit) {
                                onExit();
                            }
                        }}
                        className="bg-red-500 hover:bg-red-600 text-white px-4 py-2 rounded flex items-center"
                    >
                        <ArrowLeft size={16} className="mr-2"/>
                        終了
                    </button>
                </div>
                
                <div className="mt-4 p-3 bg-blue-50 rounded-lg">
                    <h3 className="font-semibold text-blue-800 mb-2">🎉 ゲーム結果</h3>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        {players.map((playerId, index) => {
                            const playerState = gameData.playerStates[playerId];
                            const playerName = playerId === userId ? currentUserName : `プレイヤー${index + 1}`;
                            
                            return (
                                <div key={playerId} className="bg-white p-3 rounded border">
                                    <div className="flex items-center justify-between">
                                        <span className="font-semibold">{playerName}</span>
                                        {playerState?.goalTime && (
                                            <span className="text-green-600 font-bold">ゴール達成!</span>
                                        )}
                                    </div>
                                    <div className="text-sm text-gray-600 mt-1">
                                        <p>スコア: {playerState?.score || 0}pt</p>
                                        <p>発見セル数: {Object.keys(playerState?.revealedCells || {}).length}</p>
                                        {playerState?.goalTime && (
                                            <p className="text-green-600">
                                                ゴール時刻: {new Date(playerState.goalTime.seconds * 1000).toLocaleTimeString()}
                                            </p>
                                        )}
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                {/* 迷路全体ビュー */}
                <div className="lg:col-span-2">
                    <div className="bg-white rounded-lg shadow-md p-4">
                        <div className="flex justify-between items-center mb-4">
                            <h2 className="text-lg font-semibold flex items-center">
                                <Map size={20} className="mr-2"/>
                                迷路全体図（全ての壁を表示）
                            </h2>
                            
                            {/* 迷路選択UI */}
                            <div className="flex items-center space-x-2">
                                <span className="text-sm text-gray-600">表示する迷路:</span>
                                <select
                                    value={selectedMazeOwner}
                                    onChange={(e) => setSelectedMazeOwner(e.target.value)}
                                    className="px-3 py-1 border border-gray-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                                >
                                    {players.map((playerId, index) => {
                                        const playerName = playerId === userId ? currentUserName : `プレイヤー${index + 1}`;
                                        return (
                                            <option key={playerId} value={playerId}>
                                                {playerName}の迷路
                                            </option>
                                        );
                                    })}
                                </select>
                            </div>
                        </div>
                        
                        {currentDisplayMaze && currentDisplayMaze.walls ? (
                            <div className="relative">
                                {/* デバッグ情報 */}
                                {process.env.NODE_ENV === 'development' && (
                                    <div className="mb-2 p-2 bg-yellow-50 rounded text-xs">
                                        <p>総壁数: {currentDisplayMaze.walls?.length || 0}</p>
                                        <p>アクティブ壁数: {(currentDisplayMaze.walls || []).filter(w => w.active === true).length}</p>
                                        <p>迷路サイズ: {currentDisplayMaze.gridSize || 6}x{currentDisplayMaze.gridSize || 6}</p>
                                    </div>
                                )}
                                
                                {/* 座標ラベル */}
                                <div className="mb-2">
                                    <div className="flex justify-center">
                                        <div className="grid grid-cols-6 gap-1 w-fit">
                                            {['A', 'B', 'C', 'D', 'E', 'F'].map((letter) => (
                                                <div key={letter} className="w-8 h-6 flex items-center justify-center text-sm font-semibold text-gray-600">
                                                    {letter}
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                </div>
                                
                                <div className="flex justify-center">
                                    <div className="flex flex-col mr-2">
                                        {[1, 2, 3, 4, 5, 6].map((number) => (
                                            <div key={number} className="w-6 h-8 flex items-center justify-center text-sm font-semibold text-gray-600">
                                                {number}
                                            </div>
                                        ))}
                                    </div>
                                    
                                    <MazeGrid
                                        mazeData={currentDisplayMaze}
                                        playerPosition={currentPlayerState?.position}
                                        otherPlayers={players.filter(p => p !== userId).map(p => ({
                                            id: p,
                                            position: gameData.playerStates[p]?.position,
                                            name: p === userId ? currentUserName : `プレイヤー${players.indexOf(p) + 1}`
                                        }))}
                                        revealedCells={currentPlayerState?.revealedCells || {}}
                                        revealedPlayerWalls={(currentDisplayMaze?.walls || []).filter(wall => wall.active === true)}
                                        onCellClick={() => {}}
                                        gridSize={currentDisplayMaze?.gridSize || 6}
                                        sharedWallsFromAllies={[]}
                                        highlightPlayer={true}
                                        smallView={false}
                                        showAllWalls={true}
                                    />
                                </div>
                                
                                {/* 迷路情報 */}
                                <div className="mt-4 p-3 bg-blue-50 rounded">
                                    <h4 className="font-semibold text-blue-800 mb-2">
                                        {selectedMazeOwner === userId ? currentUserName : `プレイヤー${players.indexOf(selectedMazeOwner) + 1}`}の迷路
                                    </h4>
                                    <div className="text-sm text-blue-700 space-y-1">
                                        <p>• 総壁数: {currentDisplayMaze.walls?.length || 0}個</p>
                                        <p>• アクティブ壁数: {(currentDisplayMaze.walls || []).filter(w => w.active === true).length}個</p>
                                        <p>• ゴール位置: ({currentDisplayMaze.goal?.r || 0}, {currentDisplayMaze.goal?.c || 0})</p>
                                        <p>• 作成者: {selectedMazeOwner === userId ? currentUserName : `プレイヤー${players.indexOf(selectedMazeOwner) + 1}`}</p>
                                    </div>
                                </div>
                            </div>
                        ) : (
                            <div className="text-center py-8 text-gray-500">
                                <Map size={48} className="mx-auto mb-4 opacity-50"/>
                                <p className="mb-2">選択された迷路データが見つかりません</p>
                                <p className="text-sm">別の迷路を選択してください</p>
                                {process.env.NODE_ENV === 'development' && (
                                    <div className="text-xs mt-4 p-2 bg-yellow-50 rounded">
                                        <p>デバッグ情報:</p>
                                        <p>selectedMazeOwner: {selectedMazeOwner}</p>
                                        <p>currentDisplayMaze: {currentDisplayMaze ? '存在' : 'null'}</p>
                                        <p>walls: {currentDisplayMaze?.walls ? `${currentDisplayMaze.walls.length}個` : 'null'}</p>
                                        <p>allMazeData keys: {Object.keys(allMazeData).join(', ') || 'none'}</p>
                                    </div>
                                )}
                            </div>
                        )}
                        
                        {/* プレイヤーの軌跡情報 */}
                        <div className="mt-4 p-3 bg-gray-50 rounded">
                            <h4 className="font-semibold mb-2">プレイヤーの動き</h4>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-2 text-sm">
                                {players.map((playerId, index) => {
                                    const playerState = gameData.playerStates[playerId];
                                    const playerName = playerId === userId ? currentUserName : `プレイヤー${index + 1}`;
                                    const revealedCount = Object.keys(playerState?.revealedCells || {}).length;
                                    
                                    return (
                                        <div key={playerId} className="flex justify-between">
                                            <span>{playerName}:</span>
                                            <span className="text-blue-600">{revealedCount}セル探索</span>
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                    </div>
                </div>

                {/* チャット・感想戦エリア */}
                <div className="lg:col-span-1">
                    <div className="bg-white rounded-lg shadow-md p-4">
                        <h2 className="text-lg font-semibold mb-4 flex items-center">
                            <MessageSquare size={20} className="mr-2"/>
                            感想戦チャット
                        </h2>
                        
                        {/* チャットメッセージ */}
                        <div 
                            className="h-64 overflow-y-auto border rounded-lg p-3 mb-4 bg-gray-50"
                            ref={chatLogRef}
                        >
                            {chatMessages.length === 0 ? (
                                <div className="text-center text-gray-500 py-8">
                                    <MessageSquare size={32} className="mx-auto mb-2 opacity-50"/>
                                    <p>まだメッセージがありません</p>
                                    <p className="text-sm">感想をシェアしましょう！</p>
                                </div>
                            ) : (
                                <div className="space-y-2">
                                    {chatMessages.map((msg) => (
                                        <div 
                                            key={msg.id} 
                                            className={`p-2 rounded-lg max-w-[80%] ${
                                                msg.senderId === userId 
                                                    ? 'bg-blue-100 text-blue-800 ml-auto' 
                                                    : 'bg-white border'
                                            }`}
                                        >
                                            <div className="text-xs text-gray-500 mb-1">
                                                {msg.senderName}
                                            </div>
                                            <div className="text-sm">{msg.text}</div>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                        
                        {/* チャット入力 */}
                        <div className="flex space-x-2">
                            <input
                                type="text"
                                value={chatInput}
                                onChange={(e) => setChatInput(e.target.value)}
                                onKeyPress={(e) => {
                                    if (e.key === 'Enter' && !e.shiftKey) {
                                        e.preventDefault();
                                        handleSendChatMessage();
                                    }
                                }}
                                placeholder={gameId ? "感想を入力..." : "チャット機能は利用できません（ゲームID不明）"}
                                className="flex-1 px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                                disabled={!gameId}
                            />
                            <button
                                onClick={handleSendChatMessage}
                                disabled={!chatInput.trim() || !gameId}
                                className="bg-blue-500 text-white px-3 py-2 rounded-lg hover:bg-blue-600 disabled:bg-gray-300 disabled:cursor-not-allowed"
                            >
                                <Send size={16}/>
                            </button>
                        </div>
                        
                        {/* 感想テンプレート */}
                        <div className="mt-4 space-y-2">
                            <h4 className="text-sm font-semibold text-gray-700">感想テンプレート:</h4>
                            <div className="grid grid-cols-1 gap-1">
                                {[
                                    "面白いゲームでした！",
                                    "迷路の設計が巧妙でした",
                                    "またプレイしましょう！",
                                    "良い戦略でしたね",
                                    "次回は負けません！"
                                ].map((template, index) => (
                                    <button
                                        key={index}
                                        onClick={() => setChatInput(template)}
                                        className="text-left text-xs text-blue-600 hover:text-blue-800 hover:bg-blue-50 p-1 rounded"
                                    >
                                        "{template}"
                                    </button>
                                ))}
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            {/* 振り返りエリア */}
            <div className="bg-white rounded-lg shadow-md p-4 mt-4">
                <h3 className="text-lg font-semibold mb-3 flex items-center">
                    <Eye size={18} className="mr-2"/>
                    ゲーム分析
                </h3>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div>
                        <h4 className="font-semibold text-gray-700 mb-2">迷路の特徴</h4>
                        <ul className="text-sm text-gray-600 space-y-1">
                            <li>• 総壁数: {currentDisplayMaze?.walls?.length || 0}個</li>
                            <li>• アクティブ壁数: {(currentDisplayMaze?.walls || []).filter(w => w.active === true).length}個</li>
                            <li>• ゴール到達率: {players.filter(p => gameData.playerStates[p]?.goalTime).length}/{players.length}</li>
                        </ul>
                    </div>
                    <div>
                        <h4 className="font-semibold text-gray-700 mb-2">プレイヤー分析</h4>
                        <ul className="text-sm text-gray-600 space-y-1">
                            <li>• 平均探索セル数: {Math.round(players.reduce((sum, p) => sum + Object.keys(gameData.playerStates[p]?.revealedCells || {}).length, 0) / players.length)}</li>
                            <li>• 最高スコア: {Math.max(...players.map(p => gameData.playerStates[p]?.score || 0))}</li>
                            <li>• 探索効率: 良好</li>
                        </ul>
                    </div>
                    <div>
                        <h4 className="font-semibold text-gray-700 mb-2">改善ポイント</h4>
                        <ul className="text-sm text-gray-600 space-y-1">
                            <li>• より効率的な探索ルート</li>
                            <li>• 戦略的な迷路設計</li>
                            <li>• プレイヤー間の駆け引き</li>
                        </ul>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default ReviewModeScreen;
