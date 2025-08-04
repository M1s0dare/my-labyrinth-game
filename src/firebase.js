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
  apiKey: "AIzaSyBkQ11yrZ1WBYwOGM1zAAcGltj8Ig_Afk4",
  authDomain: "labyrinthconnection-d7d49.firebaseapp.com",
  projectId: "labyrinthconnection-d7d49",
  storageBucket: "labyrinthconnection-d7d49.firebasestorage.app",
  messagingSenderId: "912780396524",
  appId: "1:912780396524:web:b7254784f2efdcb34da2c9",
  measurementId: "G-4KGR81M23W"
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
