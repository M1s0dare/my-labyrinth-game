/**
 * ロビー画面コンポーネント
 * ゲームモードの選択、ゲームの作成・参加機能を提供
 */

import React, { useState, useEffect } from 'react';
import { getFirestore, collection, addDoc, query, where, getDocs, updateDoc, doc, serverTimestamp, arrayUnion, Timestamp } from 'firebase/firestore';
import { User, Users, Info, HelpCircle, MessageSquare } from 'lucide-react';
import { db, appId } from '../firebase';
import { EXTRA_MODE_TOTAL_TIME_LIMIT, SECRET_OBJECTIVES } from '../constants';
import { saveUsername, getUsername, isValidUsername } from '../utils';
import { HelpOverlay } from './HelpOverlay';

/**
 * ロビー画面コンポーネント
 * @param {Function} setGameMode - ゲームモードを設定する関数
 * @param {Function} setScreen - 画面を切り替える関数
 * @param {string} userId - 現在のユーザーID
 * @param {boolean} debugMode - デバッグモードのON/OFF
 */
const LobbyScreen = ({ setGameMode, setScreen, userId, debugMode }) => {
    // ユーザーネーム関連の状態
    const [username, setUsername] = useState('');
    const [showUsernameInput, setShowUsernameInput] = useState(false);
    
    // ヘルプオーバーレイ関連の状態
    const [showHelpOverlay, setShowHelpOverlay] = useState(false);
    const [helpPage, setHelpPage] = useState(1);
    
    // コンポーネント初期化時にユーザーネームを読み込み
    useEffect(() => {
        const savedUsername = getUsername();
        if (savedUsername) {
            setUsername(savedUsername);
        } else {
            setShowUsernameInput(true);
        }
    }, []);

    // ユーザーネーム保存処理
    const handleSaveUsername = () => {
        if (isValidUsername(username)) {
            saveUsername(username.trim());
            setShowUsernameInput(false);
            showNotification('ユーザーネームを保存しました！', 'success');
        } else {
            showNotification('ユーザーネームは1-20文字で入力してください。', 'error');
        }
    };

    // 通知表示ヘルパー関数
    const showNotification = (message, type = 'info') => {
        const notificationArea = document.getElementById('notification-area');
        if (notificationArea) {
            notificationArea.innerHTML = message;
            const bgColor = type === 'success' ? 'bg-green-500' : type === 'error' ? 'bg-red-500' : 'bg-blue-500';
            notificationArea.className = `fixed top-5 right-5 ${bgColor} text-white p-3 rounded-md shadow-lg z-50 text-sm`;
            setTimeout(() => { notificationArea.className += ' hidden'; }, 3000);
        }
    };
    
    /**
     * デバッグ用の4人分のプレイヤーID生成
     * @returns {Array} プレイヤーIDの配列
     */
    const generateDebugPlayerIds = () => {
        return [
            userId,
            `debug_player_2_${Date.now()}`,
            `debug_player_3_${Date.now()}`,
            `debug_player_4_${Date.now()}`
        ];
    };

    /**
     * モード選択時の処理
     * @param {string} mode - ゲームモード（2player or 4player）
     * @param {string} gameType - ゲームタイプ（standard のみ）
     */
    const handleModeSelect = async (mode, gameType = "standard") => {
        console.log("🎯 [DEBUG] Mode selected:", { mode, gameType, userId, debugMode });
        
        // ユーザーネームのチェック
        if (!username || !isValidUsername(username)) {
            setShowUsernameInput(true);
            showNotification('ゲームを開始するにはユーザーネームを設定してください。', 'error');
            return;
        }
        
        // ユーザーIDのチェック
        if (!userId) {
            console.error("❌ [DEBUG] No userId available");
            showNotification('ユーザーIDが取得できませんでした。ページをリロードしてください。', 'error');
            return;
        }
        
        // ゲームモードを設定
        setGameMode(mode);

        // Firestoreのゲームコレクションを取得
        const gamesRef = collection(db, `artifacts/${appId}/public/data/labyrinthGames`);
        let gameIdToJoin = null;
        
        // 必要なプレイヤー数を決定（エクストラモードは削除）
        const requiredPlayerCount = mode === '2player' ? 2 : 4;
        
        console.log("🔍 [DEBUG] Searching for existing games:", { mode, gameType, requiredPlayerCount });

        // デバッグモードの場合、待機中のゲームをスキップして新規作成
        if (!debugMode) {
            // 待機中のゲームを検索（standardのみ）
            const q = query(gamesRef, where("mode", "==", mode), where("gameType", "==", "standard"), where("status", "==", "waiting"));
            const querySnapshot = await getDocs(q);

            console.log("🔍 [DEBUG] Found", querySnapshot.size, "waiting games");

            if (!querySnapshot.empty) {
                // 既存の待機中ゲームがある場合の処理
                for (const gameDoc of querySnapshot.docs) {
                    const gameData = gameDoc.data();
                    console.log("🔍 [DEBUG] Checking game:", {
                        id: gameDoc.id,
                        players: gameData.players,
                        playerCount: gameData.players.length,
                        includesCurrentUser: gameData.players.includes(userId)
                    });
                    
                    if (gameData.players.length < requiredPlayerCount && !gameData.players.includes(userId)) {
                        gameIdToJoin = gameDoc.id;
                        console.log("✅ [DEBUG] Joining existing game:", gameIdToJoin);
                        
                        await updateDoc(doc(db, `artifacts/${appId}/public/data/labyrinthGames`, gameIdToJoin), {
                            players: arrayUnion(userId),
                            status: gameData.players.length + 1 === requiredPlayerCount ? "creating" : "waiting"
                        });
                        
                        console.log("✅ [DEBUG] Successfully joined game. New status:", gameData.players.length + 1 === requiredPlayerCount ? "creating" : "waiting");
                        break;
                    }
                }
            }
        } else {
            console.log("🔧 [DEBUG] Debug mode: Skipping existing games, creating new one");
        }

        if (!gameIdToJoin) {
            console.log("🆕 [DEBUG] Creating new game");
            try {
                // デバッグモードの場合、4人分のプレイヤーIDを事前に設定
                const playersArray = debugMode && (mode === '4player') ? generateDebugPlayerIds() : [userId];
                const gameStatus = debugMode && (mode === '4player') ? "creating" : "waiting";
                
                const newGameData = {
                    mode: mode,
                    gameType: "standard", // エクストラモード削除により固定
                    status: gameStatus,
                    players: playersArray,
                    hostId: userId,
                    createdAt: serverTimestamp(),
                    currentTurnPlayerId: null,
                    turnOrder: [],
                    mazes: {},
                    playerStates: {},
                    goalCount: 0,
                    playerGoalOrder: [],
                    activeBattle: null,
                    chatMessagesLastFetch: null,
                    // エクストラモード関連の項目を削除
                    debugMode: debugMode // デバッグモードフラグを追加
                };
                
                console.log("🆕 [DEBUG] New game data:", newGameData);
                
                const newGameRef = await addDoc(gamesRef, newGameData);
                gameIdToJoin = newGameRef.id;
                
                console.log("✅ [DEBUG] Successfully created new game:", gameIdToJoin);
                
                // エクストラモード関連の設定を削除
            } catch (error) {
                console.error("❌ [DEBUG] Error creating game:", error);
                showNotification('ゲームの作成に失敗しました。', 'error');
                return;
            }
        }

        console.log("💾 [DEBUG] Storing game info in localStorage:", { gameIdToJoin, gameType: "standard" });
        localStorage.setItem('labyrinthGameId', gameIdToJoin);
        localStorage.setItem('labyrinthGameType', "standard");
        
        console.log("🚀 [DEBUG] Redirecting to course creation");
        setScreen('courseCreation');
    };

    return (
        <div className="flex flex-col items-center justify-center min-h-screen bg-gradient-to-br from-slate-900 to-slate-700 text-white p-4">
            <div id="notification-area" className="fixed top-5 right-5 bg-red-500 text-white p-3 rounded-md shadow-lg hidden z-50"></div>
            
            {/* デバッグモード表示 */}
            {debugMode && (
                <div className="fixed top-5 left-5 bg-orange-500 text-white p-3 rounded-md shadow-lg z-50">
                    <div className="flex items-center space-x-2">
                        <span className="text-lg">🔧</span>
                        <span className="font-bold">DEBUG MODE</span>
                    </div>
                    <p className="text-xs mt-1">4人対戦を一人でテスト可能</p>
                </div>
            )}
            
            <header className="text-center mb-8">
                <h1 className="text-5xl font-bold tracking-tight mb-2">ラビリンス</h1>
                <p className="text-xl text-slate-300">心理戦迷路ゲーム</p>
                {userId && <p className="text-sm text-slate-400 mt-2">ユーザーID: {userId.substring(0,12)}...</p>}
                {username && <p className="text-sm text-slate-300 mt-1">プレイヤー名: {username}</p>}
            </header>

            {/* ユーザーネーム設定モーダル */}
            {showUsernameInput && (
                <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
                    <div className="bg-white text-gray-800 p-6 rounded-lg shadow-2xl max-w-md w-full mx-4">
                        <h2 className="text-2xl font-bold mb-4 text-center">プレイヤー名を設定</h2>
                        <p className="text-gray-600 mb-4 text-center">ゲーム中に表示される名前を入力してください</p>
                        <input
                            type="text"
                            value={username}
                            onChange={(e) => setUsername(e.target.value)}
                            placeholder="プレイヤー名（1-20文字）"
                            className="w-full p-3 border border-gray-300 rounded-lg mb-4 focus:outline-none focus:ring-2 focus:ring-blue-500"
                            maxLength={20}
                            onKeyPress={(e) => e.key === 'Enter' && handleSaveUsername()}
                        />
                        <div className="flex space-x-3">
                            <button
                                onClick={handleSaveUsername}
                                disabled={!isValidUsername(username)}
                                className="flex-1 bg-blue-500 hover:bg-blue-600 disabled:bg-gray-300 disabled:cursor-not-allowed text-white font-bold py-3 px-6 rounded-lg transition-colors"
                            >
                                保存
                            </button>
                            {getUsername() && (
                                <button
                                    onClick={() => setShowUsernameInput(false)}
                                    className="flex-1 bg-gray-500 hover:bg-gray-600 text-white font-bold py-3 px-6 rounded-lg transition-colors"
                                >
                                    キャンセル
                                </button>
                            )}
                        </div>
                    </div>
                </div>
            )}

            <div className="bg-slate-800 p-8 rounded-xl shadow-2xl w-full max-w-md">
                <h2 className="text-3xl font-semibold mb-6 text-center text-sky-400">モード選択</h2>
                
                {/* ユーザーネーム表示・変更 */}
                <div className="mb-6 p-4 bg-slate-700 rounded-lg">
                    <div className="flex items-center justify-between">
                        <div>
                            <p className="text-sm text-slate-400">プレイヤー名</p>
                            <p className="text-white font-semibold">{username || '未設定'}</p>
                        </div>
                        <button
                            onClick={() => setShowUsernameInput(true)}
                            className="bg-slate-600 hover:bg-slate-500 text-white px-3 py-1 rounded text-sm transition-colors"
                        >
                            変更
                        </button>
                    </div>
                </div>
                
                <div className="space-y-4">
                    <button 
                        onClick={() => handleModeSelect('2player', 'standard')}
                        disabled={!username || !isValidUsername(username)}
                        className="w-full bg-sky-500 hover:bg-sky-600 disabled:bg-gray-500 disabled:cursor-not-allowed text-white font-bold py-3 px-6 rounded-lg text-lg transition-all duration-150 ease-in-out transform hover:scale-105 shadow-lg flex items-center justify-center space-x-2"
                    >
                        <User size={24} /> <span>2人対戦</span>
                    </button>
                    <button 
                        onClick={() => handleModeSelect('4player', 'standard')}
                        disabled={!username || !isValidUsername(username)}
                        className={`w-full ${debugMode ? 'bg-orange-500 hover:bg-orange-600' : 'bg-teal-500 hover:bg-teal-600'} disabled:bg-gray-500 disabled:cursor-not-allowed text-white font-bold py-3 px-6 rounded-lg text-lg transition-all duration-150 ease-in-out transform hover:scale-105 shadow-lg flex items-center justify-center space-x-2`}
                    >
                        <Users size={24} /> 
                        <span>4人対戦 {debugMode && '🔧'}</span>
                    </button>
                </div>
            </div>

            <footer className="mt-8 text-center text-slate-400 space-x-6">
                <button 
                    onClick={() => {
                        setHelpPage(1);
                        setShowHelpOverlay(true);
                    }} 
                    className="hover:text-sky-400 transition-colors"
                >
                    <Info size={20} className="inline mr-1"/> 遊び方
                </button>
                <button 
                    onClick={() => {
                        setHelpPage(2);
                        setShowHelpOverlay(true);
                    }} 
                    className="hover:text-sky-400 transition-colors"
                >
                    <MessageSquare size={20} className="inline mr-1"/> チャットヘルプ
                </button>
                <button 
                    onClick={() => {
                        showNotification('問題発生時はリロードしてください。', 'info');
                    }} 
                    className="hover:text-sky-400 transition-colors"
                >
                    <HelpCircle size={20} className="inline mr-1"/> ヘルプ
                </button>
            </footer>

            {/* ヘルプオーバーレイ */}
            {showHelpOverlay && (
                <HelpOverlay
                    page={helpPage}
                    onClose={() => setShowHelpOverlay(false)}
                />
            )}
        </div>
    );
};

export default LobbyScreen;
