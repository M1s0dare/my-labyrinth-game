/**
 * 戦闘モーダルコンポーネント
 * プレイヤー同士の戦闘時に賭け金を設定するモーダル
 */

import React, { useState, useEffect } from 'react';
import { Swords, MinusCircle, PlusCircle } from 'lucide-react';

/**
 * 戦闘モーダルコンポーネント
 * @param {boolean} isOpen - モーダルの開閉状態
 * @param {Function} onClose - モーダルを閉じる関数
 * @param {Function} onBet - 賭け金を決定する関数
 * @param {number} maxBet - 最大賭け金
 * @param {string} opponentName - 相手の名前
 * @param {string} myName - 自分の名前
 * @param {number} myCurrentScore - 現在のスコア
 */
const BattleModal = ({ isOpen, onClose, onBet, maxBet, opponentName, myName, myCurrentScore }) => {
    const [betAmount, setBetAmount] = useState(0);  // 賭け金の状態管理

    // モーダルが開いた時の初期化処理
    useEffect(() => {
        if (isOpen) {
            setBetAmount(0); // 開いた時に賭け金をリセット
        }
    }, [isOpen]);

    // モーダルが閉じている場合は何も表示しない
    if (!isOpen) return null;

    // 実際の最大賭け金を計算（0から賭けられる）
    const actualMaxBet = Math.max(0, myCurrentScore);
    
    // 賭け金を増減する関数
    const incrementBet = () => setBetAmount(prev => Math.min(prev + 1, actualMaxBet));
    const decrementBet = () => setBetAmount(prev => Math.max(0, prev - 1));

    return (
        <div className="fixed inset-0 bg-black bg-opacity-75 flex items-center justify-center z-50 p-4">
            <div className="bg-white p-6 rounded-lg shadow-xl w-full max-w-sm text-center">
                <h2 className="text-2xl font-bold mb-2 text-red-600 flex items-center justify-center">
                    <Swords size={28} className="mr-2"/> バトル発生！
                </h2>
                <p className="mb-1 text-lg">
                    vs <span className="font-semibold">{opponentName ? opponentName.substring(0,8) : '相手'}</span>
                </p>
                <p className="mb-4 text-sm text-gray-600">あなたの現在ポイント: {myCurrentScore}pt</p>
                <p className="mb-1 font-semibold">ポイントを賭けてください</p>
                <p className="mb-4 text-xs text-gray-500">(最小: 0pt, 最大: {actualMaxBet}pt)</p>
                <div className="flex items-center justify-center space-x-3 my-4">
                    <button 
                        onClick={decrementBet} 
                        disabled={betAmount <= 0} 
                        className="p-2 bg-gray-300 hover:bg-gray-400 rounded-full disabled:opacity-50 transition-colors"
                        aria-label="ベットを減らす"
                    >
                        <MinusCircle size={28}/>
                    </button>
                    <span className="text-3xl font-bold w-16 text-center">{betAmount}</span>
                    <button 
                        onClick={incrementBet} 
                        disabled={betAmount >= actualMaxBet} 
                        className="p-2 bg-gray-300 hover:bg-gray-400 rounded-full disabled:opacity-50 transition-colors"
                        aria-label="ベットを増やす"
                    >
                        <PlusCircle size={28}/>
                    </button>
                </div>
                <button 
                    onClick={() => onBet(betAmount)}
                    className="w-full bg-red-500 hover:bg-red-600 text-white font-bold py-3 px-4 rounded-lg text-lg transition-colors"
                >
                    賭ける！
                </button>
                <p className="text-xs mt-3 text-gray-500">相手もポイント入力中です...</p>
            </div>
        </div>
    );
};

export default BattleModal;
