/**
 * Firebase設定ファイル
 * Firebase認証とFirestoreデータベースの初期化を行う
 */

import { initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { getFirestore, enableNetwork, disableNetwork } from 'firebase/firestore';

// Firebase設定オブジェクト
// プロジェクトごとに異なる設定値を含む
const firebaseConfig = {
  apiKey: "AIzaSyDELpL-KPlPpxAxondBu6WMPncmmtcZHs8",
  authDomain: "my-labyrinth-game.firebaseapp.com",
  projectId: "my-labyrinth-game",
  storageBucket: "my-labyrinth-game.firebasestorage.app",
  messagingSenderId: "387163715938",
  appId: "1:387163715938:web:5d1cc5f6b5075f41f2143b"
};

// Firebase アプリケーションの初期化
const app = initializeApp(firebaseConfig);

// Firebase Auth インスタンスを取得・エクスポート
export const auth = getAuth(app);

// Firestore データベースインスタンスを取得・エクスポート
export const db = getFirestore(app);

// ネットワーク制御関数をエクスポート
export const enableFirestoreNetwork = () => enableNetwork(db);
export const disableFirestoreNetwork = () => disableNetwork(db);

// アプリケーションIDを設定からエクスポート
export const appId = firebaseConfig.appId;
