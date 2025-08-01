/**
 * メインアプリケーションコンポーネント
 * 認証処理、画面遷移制御、ゲーム状態管理を行う
 */

import React, { useState, useEffect } from 'react';
import { onAuthStateChanged, signInAnonymously, signInWithCustomToken } from 'firebase/auth';
import { doc, getDoc } from 'firebase/firestore';
import { auth, db, appId, enableFirestoreNetwork, disableFirestoreNetwork } from './firebase';

import LobbyScreen from './components/LobbyScreen';
import CourseCreationScreen from './components/CourseCreationScreen';
import PlayScreen from './components/PlayScreen';

function App() {
    // === 状態管理 ===
    // 現在表示している画面（ロビー、コース作成、プレイ）を管理
    const [screen, setScreen] = useState('lobby');
    // Firebase認証で取得したユーザーIDを管理
    const [userId, setUserId] = useState(null);
    // 認証処理が完了したかどうかを管理
    const [isAuthReady, setIsAuthReady] = useState(false);
    // ゲームモード（2人/4人など）を管理
    const [gameMode, setGameMode] = useState('2player');
    // デバッグモードのON/OFFを管理
    const [debugMode, setDebugMode] = useState(false);
    // ネットワーク状態を管理
    const [isOnline, setIsOnline] = useState(navigator.onLine);

    // === Firebase認証の初期化処理 ===
    useEffect(() => {
        const initAuth = async () => {
            try {
                // 認証状態の変化を監視
                onAuthStateChanged(auth, async (user) => {
                    if (user) {
                        // 認証済みならユーザーIDをセット
                        setUserId(user.uid);
                        
                        // アプリ起動時に古いゲームデータをチェック・クリーンアップ
                        await cleanupStaleGameData(user.uid);
                    } else {
                        // カスタムトークンがあればそれでサインイン、なければ匿名認証
                        if (typeof window !== 'undefined' && typeof window.__initial_auth_token !== 'undefined' && window.__initial_auth_token) {
                            try {
                                await signInWithCustomToken(auth, window.__initial_auth_token);
                            } catch (customTokenError) {
                                console.error("Error signing in with custom token, falling back to anonymous:", customTokenError);
                                await signInAnonymously(auth);
                            }
                        } else {
                            await signInAnonymously(auth);
                        }
                    }
                    // 認証処理が完了したことをセット
                    setIsAuthReady(true);
                });
            } catch (error) {
                // 認証エラー時の処理
                console.error("Firebase Auth Error:", error);
                setIsAuthReady(true);
            }
        };
        initAuth();
    }, []);

    // === ネットワーク状態の監視 ===
    useEffect(() => {
        const handleOnline = async () => {
            console.log("🌐 [Network] Connection restored");
            setIsOnline(true);
            try {
                await enableFirestoreNetwork();
                console.log("✅ [Network] Firestore network enabled");
            } catch (error) {
                console.error("❌ [Network] Error enabling Firestore network:", error);
            }
        };

        const handleOffline = async () => {
            console.log("🌐 [Network] Connection lost");
            setIsOnline(false);
            try {
                await disableFirestoreNetwork();
                console.log("⚠️ [Network] Firestore network disabled");
            } catch (error) {
                console.error("❌ [Network] Error disabling Firestore network:", error);
            }
        };

        // ネットワーク状態変更のイベントリスナーを追加
        window.addEventListener('online', handleOnline);
        window.addEventListener('offline', handleOffline);

        // 初期状態を設定
        if (navigator.onLine) {
            handleOnline();
        } else {
            handleOffline();
        }

        return () => {
            window.removeEventListener('online', handleOnline);
            window.removeEventListener('offline', handleOffline);
        };
    }, []);

    // === 古いゲームデータのクリーンアップ処理 ===
    const cleanupStaleGameData = async (currentUserId) => {
        try {
            console.log("🧹 [App] Starting stale game data cleanup for user:", currentUserId);
            
            const storedGameId = localStorage.getItem('labyrinthGameId');
            if (storedGameId) {
                const gameDocRef = doc(db, `artifacts/${appId}/public/data/labyrinthGames`, storedGameId);
                const gameSnap = await getDoc(gameDocRef);
                
                if (gameSnap.exists()) {
                    const gameData = gameSnap.data();
                    const gameCreatedAt = gameData.createdAt?.toDate();
                    const now = new Date();
                    const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000);
                    
                    // ゲームが1時間以上前のものか、ユーザーが含まれていない場合はクリア
                    if (!gameCreatedAt || gameCreatedAt < oneHourAgo || 
                        !gameData.players || !gameData.players.includes(currentUserId) ||
                        gameData.status === 'abandoned' || gameData.status === 'disbanded') {
                        
                        console.log("🗑️ [App] Clearing stale game data from localStorage");
                        localStorage.removeItem('labyrinthGameId');
                        localStorage.removeItem('labyrinthGameType');
                    } else {
                        console.log("✅ [App] Game data is valid, keeping it");
                        // 有効なゲームが存在する場合は適切な画面に遷移
                        if (gameData.status === 'creating') {
                            setScreen('courseCreation');
                        } else if (gameData.status === 'playing') {
                            setScreen('play');
                        }
                    }
                } else {
                    console.log("🗑️ [App] Game document does not exist, clearing localStorage");
                    localStorage.removeItem('labyrinthGameId');
                    localStorage.removeItem('labyrinthGameType');
                }
            }
        } catch (error) {
            console.error("❌ [App] Error during stale game data cleanup:", error);
            // エラーが発生した場合は安全のためローカルストレージをクリア
            localStorage.removeItem('labyrinthGameId');
            localStorage.removeItem('labyrinthGameType');
        }
    };

    // === ページ離脱時のユーザー情報クリア処理 ===
    useEffect(() => {
        const handleBeforeUnload = async (event) => {
            console.log("🚪 [Cleanup] User is leaving the page, starting cleanup...");
            
            // 現在のゲーム情報を取得
            const currentGameId = localStorage.getItem('labyrinthGameId');
            
            if (currentGameId && userId) {
                try {
                    // Firebaseからプレイヤー情報を削除（トランザクション使用で安全性向上）
                    const { updateDoc, doc, getDoc, deleteField, runTransaction, serverTimestamp } = await import('firebase/firestore');
                    const gameDocRef = doc(db, `artifacts/${appId}/public/data/labyrinthGames`, currentGameId);
                    
                    await runTransaction(db, async (transaction) => {
                        const gameSnap = await transaction.get(gameDocRef);
                        if (gameSnap.exists()) {
                            const gameData = gameSnap.data();
                            const remainingPlayers = (gameData.players || []).filter(pid => pid !== userId);
                            
                            const updates = {
                                [`playerStates.${userId}`]: deleteField(),
                                players: remainingPlayers,
                                // 関連データも削除
                                [`mazes.${userId}`]: deleteField(),
                                [`declarations.${userId}`]: deleteField(),
                                lastActivity: serverTimestamp()
                            };
                            
                            if (remainingPlayers.length === 0) {
                                // 最後のプレイヤーが離脱する場合、ゲームを解散
                                updates.status = 'disbanded';
                                updates.disbandReason = 'プレイヤーが全員離脱したため';
                                updates.disbandedAt = serverTimestamp();
                            }
                            
                            transaction.update(gameDocRef, updates);
                        }
                    });
                    
                    console.log("✅ [Cleanup] Firebase game data cleaned up");
                } catch (error) {
                    console.error("❌ [Cleanup] Error cleaning up Firebase data:", error);
                }
            }
            
            // ローカルストレージからユーザー関連情報を完全クリア
            const keysToRemove = [
                'labyrinthGameId',
                'labyrinthGameType',
                'labyrinth_username',
                'userId',
                'gameState',
                'playerPosition',
                'lastActivity'
            ];
            keysToRemove.forEach(key => localStorage.removeItem(key));
            
            console.log("🔄 [Cleanup] Local storage cleared on page unload");
            
            // ブラウザによってはこのメッセージが表示される場合があります
            const message = 'ページを離れるとユーザー情報がリセットされます。';
            event.returnValue = message;
            return message;
        };

        const handleVisibilityChange = async () => {
            // ページが非表示になった場合（タブ切り替えなど）
            if (document.visibilityState === 'hidden') {
                console.log("👁️ [Cleanup] Page hidden, clearing local data...");
                localStorage.removeItem('labyrinthGameId');
                localStorage.removeItem('labyrinthGameType');
                localStorage.removeItem('labyrinth_username');
                localStorage.removeItem('userId');
                
                console.log("🔄 [Cleanup] Local storage cleared on visibility change");
            }
        };

        // ページ離脱時とページ非表示時のイベントリスナーを追加
        window.addEventListener('beforeunload', handleBeforeUnload);
        document.addEventListener('visibilitychange', handleVisibilityChange);

        // クリーンアップ関数でイベントリスナーを削除
        return () => {
            window.removeEventListener('beforeunload', handleBeforeUnload);
            document.removeEventListener('visibilitychange', handleVisibilityChange);
        };
    }, [userId]); // userIdの変更を監視
    
    // === 認証完了後のゲーム状態復元処理 ===
    useEffect(() => { 
        if(isAuthReady && userId) {
            // URLパラメータからデバッグモードを検出
            const urlParams = new URLSearchParams(window.location.search);
            const debugParam = urlParams.get('debug');
            if (debugParam === 'true' || debugParam === '1') {
                setDebugMode(true);
                console.log("🔧 [DEBUG MODE] Enabled for 2-player and 4-player testing");
            }
            
            // ローカルストレージに保存されたゲームIDを取得
            const storedGameId = localStorage.getItem('labyrinthGameId');
            if (storedGameId) {
                console.log("🔍 [DEBUG] Checking existing game:", storedGameId);
                // Firestoreから該当ゲームのドキュメントを取得
                const gameDocRef = doc(db, `artifacts/${appId}/public/data/labyrinthGames`, storedGameId);
                getDoc(gameDocRef).then(docSnap => {
                    if (docSnap.exists()) {
                        // ゲームデータが存在する場合
                        const game = docSnap.data();
                        console.log("🔍 [DEBUG] Game data found:", {
                            mode: game.mode,
                            gameType: game.gameType,
                            status: game.status,
                            players: game.players,
                            currentUserId: userId
                        });
                        
                        // ゲームの状態チェック（解散済み、終了済み、無効なゲーム）
                        const isGameInvalid = game.status === 'disbanded' || 
                                            game.status === 'finished' ||
                                            !game.players ||
                                            !game.players.includes(userId) ||
                                            !game.playerStates ||
                                            !game.playerStates[userId];
                        
                        if (isGameInvalid) {
                            console.log("❌ [DEBUG] Game is invalid or user not in players, clearing localStorage");
                            const keysToRemove = [
                                'labyrinthGameId',
                                'labyrinthGameType',
                                'labyrinth_username',
                                'userId',
                                'gameState',
                                'playerPosition',
                                'lastActivity'
                            ];
                            keysToRemove.forEach(key => localStorage.removeItem(key));
                            return;
                        }
                        
                        // ゲームモードをセット
                        setGameMode(game.mode); 
                        
                        // ゲームの状態に応じて画面遷移
                        if (game.status === "creating") {
                            console.log("🏗️ [DEBUG] Redirecting to course creation");
                            setScreen('courseCreation');
                        } else if (game.status === "playing" || game.status === "finished" || (game.gameType === "extra" && game.currentExtraModePhase)) {
                            console.log("🎮 [DEBUG] Redirecting to play screen");
                            setScreen('play'); 
                        } else { 
                            console.log("🗑️ [DEBUG] Invalid game status, clearing localStorage");
                            localStorage.removeItem('labyrinthGameId');
                            localStorage.removeItem('labyrinthGameType');
                        }
                    } else { 
                        // ゲームドキュメントが存在しない場合はローカルストレージをクリア
                        console.log("❌ [DEBUG] Game document not found, clearing localStorage");
                        localStorage.removeItem('labyrinthGameId');
                        localStorage.removeItem('labyrinthGameType');
                    }
                }).catch(error => {
                    // Firestore取得時のエラー処理
                    console.error("❌ [DEBUG] Error checking for existing game:", error);
                    localStorage.removeItem('labyrinthGameId');
                    localStorage.removeItem('labyrinthGameType');
                });
            } else {
                // ゲームIDが保存されていない場合はロビー画面のまま
                console.log("📝 [DEBUG] No stored game ID, staying on lobby");
            }
        }
    }, [isAuthReady, userId]);

    // === 認証処理中のローディング画面 ===
    if (!isAuthReady) {
        return <div className="flex items-center justify-center min-h-screen bg-slate-800 text-white text-xl">認証情報を読み込み中...</div>;
    }

    // === 認証失敗時のエラーメッセージ表示 ===
    if (!userId && isAuthReady) { 
         return <div className="flex items-center justify-center min-h-screen bg-slate-800 text-white text-xl">認証に失敗しました。ページをリロードしてください。</div>;
    }

    // === 現在の画面状態に応じて各画面コンポーネントを表示 ===
    switch (screen) {
        case 'courseCreation':
            // コース作成画面
            return <CourseCreationScreen userId={userId} setScreen={setScreen} gameMode={gameMode} debugMode={debugMode} isOnline={isOnline} />;
        case 'play':
            // プレイ画面
            return <PlayScreen userId={userId} setScreen={setScreen} gameMode={gameMode} debugMode={debugMode} isOnline={isOnline} />; 
        case 'lobby':
        default:
            // ロビー画面（デフォルト）
            return <LobbyScreen setGameMode={setGameMode} setScreen={setScreen} userId={userId} debugMode={debugMode} isOnline={isOnline} />;
    }
}

export default App;
