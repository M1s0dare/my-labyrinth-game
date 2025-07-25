/**
 * メインアプリケーションコンポーネント
 * 認証処理、画面遷移制御、ゲーム状態管理を行う
 */

import React, { useState, useEffect } from 'react';
import { onAuthStateChanged, signInAnonymously, signInWithCustomToken } from 'firebase/auth';
import { doc, getDoc } from 'firebase/firestore';
import { auth, db, appId } from './firebase';

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

    // === Firebase認証の初期化処理 ===
    useEffect(() => {
        const initAuth = async () => {
            try {
                // 認証状態の変化を監視
                onAuthStateChanged(auth, async (user) => {
                    if (user) {
                        // 認証済みならユーザーIDをセット
                        setUserId(user.uid);
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

    // === ページ離脱時のユーザー情報クリア処理 ===
    useEffect(() => {
        const handleBeforeUnload = (event) => {
            // ローカルストレージからユーザー関連情報をクリア
            localStorage.removeItem('labyrinthGameId');
            localStorage.removeItem('labyrinthGameType');
            localStorage.removeItem('labyrinth_username');
            
            console.log("🔄 [INFO] User data cleared on page unload");
            
            // ブラウザによってはこのメッセージが表示される場合があります
            const message = 'ページを離れるとユーザー情報がリセットされます。';
            event.returnValue = message;
            return message;
        };

        const handleVisibilityChange = () => {
            // ページが非表示になった場合（タブ切り替えなど）
            if (document.visibilityState === 'hidden') {
                localStorage.removeItem('labyrinthGameId');
                localStorage.removeItem('labyrinthGameType');
                localStorage.removeItem('labyrinth_username');
                
                console.log("🔄 [INFO] User data cleared on visibility change");
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
    }, []);
    
    // === 認証完了後のゲーム状態復元処理 ===
    useEffect(() => { 
        if(isAuthReady && userId) {
            // URLパラメータからデバッグモードを検出
            const urlParams = new URLSearchParams(window.location.search);
            const debugParam = urlParams.get('debug');
            if (debugParam === 'true' || debugParam === '1') {
                setDebugMode(true);
                console.log("🔧 [DEBUG MODE] Enabled for 4-player testing");
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
                        
                        // 現在のユーザーがプレイヤーに含まれていなければローカルストレージをクリア
                        if (!game.players || !game.players.includes(userId)) {
                            console.log("❌ [DEBUG] User not in game players, clearing localStorage");
                            localStorage.removeItem('labyrinthGameId');
                            localStorage.removeItem('labyrinthGameType'); 
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
            return <CourseCreationScreen userId={userId} setScreen={setScreen} gameMode={gameMode} debugMode={debugMode} />;
        case 'play':
            // プレイ画面
            return <PlayScreen userId={userId} setScreen={setScreen} gameMode={gameMode} debugMode={debugMode} />; 
        case 'lobby':
        default:
            // ロビー画面（デフォルト）
            return <LobbyScreen setGameMode={setGameMode} setScreen={setScreen} userId={userId} debugMode={debugMode} />;
    }
}

export default App;
