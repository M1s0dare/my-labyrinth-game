/**
 * ヘルプオーバーレイコンポーネント
 * 遊び方説明とチャットテンプレートの2ページ構成
 */

import React from 'react';
import './HelpOverlay.css';

/**
 * ヘルプオーバーレイコンポーネント
 * @param {Object} props
 * @param {number} props.page - 表示するページ（1: 遊び方, 2: チャットテンプレート）
 * @param {Function} props.onClose - 閉じるボタンのコールバック
 */
export const HelpOverlay = ({ page = 1, onClose }) => {
    const renderPage1 = () => (
        <div className="help-content">
            <h2>🎮 ラビリンス - 遊び方ガイド</h2>
            <p className="help-description">見えない壁の迷路で相手の思考を読み合う心理戦ゲームです。</p>
            
            <div className="help-sections">
                <div className="help-section">
                    <h3>🎯 ゲームの目的</h3>
                    <p>他のプレイヤーが作った「見えない壁」の迷路を攻略して、ゴールを目指します。壁の位置は見えないため、移動しながら壁の配置を推理していく必要があります。</p>
                </div>

                <div className="help-section">
                    <h3>📋 基本ルール</h3>
                    <ul>
                        <li><strong>マップ:</strong> 6×6のマス（36マス）で構成</li>
                        <li><strong>壁:</strong> 各マスの間に20本の壁が設置されている</li>
                        <li><strong>移動:</strong> 上下左右に1マスずつ移動可能</li>
                        <li><strong>壁判定:</strong> 移動先に壁がある場合は移動失敗、壁が表示される</li>
                        <li><strong>連続移動:</strong> 壁にぶつかるまで連続で移動できる</li>
                        <li><strong>ゴール:</strong> ゴールマスに到達すれば勝利</li>
                    </ul>
                </div>

                <div className="help-section">
                    <h3>🏃‍♂️ 2人対戦</h3>
                    <div className="mode-details">
                        <h4>📝 準備フェーズ</h4>
                        <ul>
                            <li>各プレイヤーが6×6マスの迷路を作成</li>
                            <li>20本の壁、スタート位置、ゴール位置を設定</li>
                            <li>相手の迷路を攻略し、自分の迷路は相手が攻略</li>
                        </ul>
                        
                        <h4>🎲 ゲーム進行</h4>
                        <ul>
                            <li>ランダムで順番を決定し、交互にターンを進行</li>
                            <li>相手の位置が常に見える</li>
                            <li>壁にぶつかるとターン終了</li>
                            <li>どちらかがゴールした時点でゲーム終了</li>
                        </ul>
                        
                        <h4>🎯 勝利条件</h4>
                        <p>先にゴールに到達したプレイヤーの勝利</p>
                    </div>
                </div>

                <div className="help-section">
                    <h3>⚔️ 4人対戦</h3>
                    <div className="mode-details">
                        <h4>📝 準備フェーズ</h4>
                        <ul>
                            <li>4人それぞれが迷路を作成（計4つの迷路）</li>
                            <li>迷路はランダムにシャッフルして配布</li>
                            <li>自分が作った迷路は自分では攻略しない</li>
                        </ul>
                        
                        <h4>🎲 ゲーム進行</h4>
                        <ul>
                            <li>他プレイヤーの位置は基本的に見えない</li>
                            <li>自分が作った迷路をプレイしている人の位置のみ見える</li>
                        </ul>
                        
                        <h4>💰 ポイントシステム</h4>
                        <ul>
                            <li><strong>移動ポイント:</strong> 未探索マスに入ると +1pt</li>
                            <li><strong>バトル勝利:</strong> バトルに勝つと +5pt</li>
                            <li><strong>ゴール順位:</strong> 1位:20pt / 2位:15pt / 3位:10pt / 4位:0pt</li>
                        </ul>
                        
                        <h4>⚔️ バトルシステム</h4>
                        <ul>
                            <li>同じマスに複数プレイヤーが止まるとバトル発生</li>
                            <li>お互いポイントを賭けて、多く賭けた方が勝利</li>
                            <li>敗者は次のターン休み</li>
                        </ul>
                        
                        <h4>🎯 勝利条件</h4>
                        <p>3人がゴールした時点でゲーム終了。総ポイントが最も高いプレイヤーの勝利</p>
                    </div>
                </div>

                <div className="help-section">
                    <h3>🎮 操作方法</h3>
                    <ul>
                        <li><strong>移動:</strong> 画面の矢印ボタン または キーボードの矢印キー/WASD</li>
                        <li><strong>チャット:</strong> Open Chatを活用して　情報を得よう</li>
                    </ul>
                </div>

                <div className="help-section">
                    <h3>💡 戦略のヒント</h3>
                    <ul>
                        <li><strong>心理戦:</strong> Open Chatで相手を誤誘導したり、協力を持ちかけたりしよう</li>
                        <li><strong>相手観察:</strong> 相手の動きから迷路の構造を推理しよう</li>
                        <li><strong>リスク管理:</strong> バトルでは適切な賭けポイントを選択しよう</li>
                        <li><strong>情報戦:</strong> 真実と嘘を使い分けて相手を翻弄しよう</li>
                    </ul>
                </div>

                <div className="help-section">
                    <h3>🔧 チャット機能</h3>
                    <ul>
                        <li><strong>Open Chat:</strong> 全プレイヤーに見える公開チャット</li>
                        <li><strong>テンプレート:</strong> よく使う発言のテンプレート集も活用可能</li>
                    </ul>
                </div>
            </div>
        </div>
    );

    const renderPage2 = () => (
        <div className="help-content">
            <h2>チャット発言テンプレート集</h2>
            <p className="help-description">対戦中のチャットで使える発言テンプレートです。クリックしてコピーできます。</p>
            <div className="template-sections">
                <div className="template-section">
                    <h3>❓ 質問・相談</h3>
                    <ul>
                        <li onClick={() => copyToClipboard("今の状況を教えてください")}>「今の状況を教えてください」</li>
                        <li onClick={() => copyToClipboard("ゴールまでのヒントが欲しいです")}>「ゴールまでのヒントが欲しいです」</li>
                        <li onClick={() => copyToClipboard("どの方向がいいと思いますか？")}>「どの方向がいいと思いますか？」</li>
                    </ul>
                </div>
                
                <div className="template-section">
                    <h3>📢 情報共有</h3>
                    <ul>
                        <li onClick={() => copyToClipboard("この道は行き止まりです")}>「この道は行き止まりです」</li>
                        <li onClick={() => copyToClipboard("ゴールが見えました！")}>「ゴールが見えました！」</li>
                        <li onClick={() => copyToClipboard("注意：この先は危険かも")}>「注意：この先は危険かも」</li>
                    </ul>
                </div>
                
                <div className="template-section">
                    <h3>⚔️ 競争・対抗</h3>
                    <ul>
                        <li onClick={() => copyToClipboard("負けませんよ！")}>「負けませんよ！」</li>
                        <li onClick={() => copyToClipboard("追いついてみせます")}>「追いついてみせます」</li>
                        <li onClick={() => copyToClipboard("戦略を変更します")}>「戦略を変更します」</li>
                        <li onClick={() => copyToClipboard("手強い相手ですね")}>「手強い相手ですね」</li>
                    </ul>
                </div>
                
                <div className="template-section">
                    <h3>👏 応援・感謝</h3>
                    <ul>
                        <li onClick={() => copyToClipboard("ナイスプレイ！")}>「ナイスプレイ！」</li>
                        <li onClick={() => copyToClipboard("ありがとうございます")}>「ありがとうございます」</li>
                        <li onClick={() => copyToClipboard("すごいですね！")}>「すごいですね！」</li>
                        <li onClick={() => copyToClipboard("お疲れ様でした")}>「お疲れ様でした」</li>
                        <li onClick={() => copyToClipboard("楽しかったです")}>「楽しかったです」</li>
                        <li onClick={() => copyToClipboard("素晴らしい戦略でした")}>「素晴らしい戦略でした」</li>
                        <li onClick={() => copyToClipboard("またよろしくお願いします")}>「またよろしくお願いします」</li>
                    </ul>
                </div>
            </div>
            
            <div className="copy-hint">
                <p className="text-sm text-gray-600">💡 各発言をクリックするとクリップボードにコピーされます</p>
            </div>
        </div>
    );

    // クリップボードにコピーする関数
    const copyToClipboard = async (text) => {
        try {
            await navigator.clipboard.writeText(text);
            // 成功時の視覚的フィードバック（任意）
            console.log('テキストをコピーしました:', text);
        } catch (err) {
            console.error('クリップボードへのコピーに失敗しました:', err);
            // フォールバック: 旧式の方法
            const textArea = document.createElement('textarea');
            textArea.value = text;
            document.body.appendChild(textArea);
            textArea.select();
            document.execCommand('copy');
            document.body.removeChild(textArea);
        }
    };

    return (
        <div className="help-overlay">
            <div className="help-overlay-content">
                <button className="help-close-btn" onClick={onClose}>
                    ×
                </button>
                {page === 1 ? renderPage1() : renderPage2()}
                <div className="help-footer">
                    <button className="help-close-button" onClick={onClose}>
                        閉じる
                    </button>
                </div>
            </div>
        </div>
    );
};
