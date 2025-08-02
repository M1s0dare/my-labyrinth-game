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
            <h2>遊び方</h2>
            {/* 1ページ目は後で実装予定 */}
            <div className="placeholder-content">
                <p className="text-gray-500">遊び方の説明は後で追加予定です。</p>
                <div className="placeholder-sections">
                    <div className="placeholder-section">
                        <h3>基本ルール</h3>
                        <p className="text-gray-400">基本的なゲームの流れについて説明します。</p>
                    </div>
                    <div className="placeholder-section">
                        <h3>スタンダードモード</h3>
                        <p className="text-gray-400">2人対戦のルールについて説明します。</p>
                    </div>
                    <div className="placeholder-section">
                        <h3>エクストラモード</h3>
                        <p className="text-gray-400">4人対戦の特殊ルールについて説明します。</p>
                    </div>
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
                    <h3>🤝 協力・連携</h3>
                    <ul>
                        <li onClick={() => copyToClipboard("一緒に進みませんか？")}>「一緒に進みませんか？」</li>
                        <li onClick={() => copyToClipboard("協力して突破しましょう！")}>「協力して突破しましょう！」</li>
                        <li onClick={() => copyToClipboard("チームワークで頑張りましょう")}>「チームワークで頑張りましょう」</li>
                        <li onClick={() => copyToClipboard("みんなで力を合わせよう")}>「みんなで力を合わせよう」</li>
                        <li onClick={() => copyToClipboard("同盟を組みましょう")}>「同盟を組みましょう」</li>
                    </ul>
                </div>
                
                <div className="template-section">
                    <h3>❓ 質問・相談</h3>
                    <ul>
                        <li onClick={() => copyToClipboard("どこに進む予定ですか？")}>「どこに進む予定ですか？」</li>
                        <li onClick={() => copyToClipboard("この壁は誰が置きましたか？")}>「この壁は誰が置きましたか？」</li>
                        <li onClick={() => copyToClipboard("ゴールまでの道は見つかりましたか？")}>「ゴールまでの道は見つかりましたか？」</li>
                        <li onClick={() => copyToClipboard("今の状況を教えてください")}>「今の状況を教えてください」</li>
                        <li onClick={() => copyToClipboard("ヒントが欲しいです")}>「ヒントが欲しいです」</li>
                        <li onClick={() => copyToClipboard("どちらの方向がいいと思いますか？")}>「どちらの方向がいいと思いますか？」</li>
                        <li onClick={() => copyToClipboard("戦略を相談しませんか？")}>「戦略を相談しませんか？」</li>
                    </ul>
                </div>
                
                <div className="template-section">
                    <h3>📢 情報共有</h3>
                    <ul>
                        <li onClick={() => copyToClipboard("この道は行き止まりです")}>「この道は行き止まりです」</li>
                        <li onClick={() => copyToClipboard("ここから進めそうです")}>「ここから進めそうです」</li>
                        <li onClick={() => copyToClipboard("壁を置きました")}>「壁を置きました」</li>
                        <li onClick={() => copyToClipboard("ゴールが見えました！")}>「ゴールが見えました！」</li>
                        <li onClick={() => copyToClipboard("注意：この先は危険かも")}>「注意：この先は危険かも」</li>
                        <li onClick={() => copyToClipboard("トラップを発見しました")}>「トラップを発見しました」</li>
                        <li onClick={() => copyToClipboard("重要な情報があります")}>「重要な情報があります」</li>
                    </ul>
                </div>
                
                <div className="template-section">
                    <h3>⚔️ 競争・対抗</h3>
                    <ul>
                        <li onClick={() => copyToClipboard("負けませんよ！")}>「負けませんよ！」</li>
                        <li onClick={() => copyToClipboard("追いついてみせます")}>「追いついてみせます」</li>
                        <li onClick={() => copyToClipboard("今度は阻止します")}>「今度は阻止します」</li>
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
                
                <div className="template-section">
                    <h3>🎯 エクストラモード専用</h3>
                    <ul>
                        <li onClick={() => copyToClipboard("アクションを宣言します")}>「アクションを宣言します」</li>
                        <li onClick={() => copyToClipboard("偵察結果を共有します")}>「偵察結果を共有します」</li>
                        <li onClick={() => copyToClipboard("同盟の提案があります")}>「同盟の提案があります」</li>
                        <li onClick={() => copyToClipboard("交渉しませんか？")}>「交渉しませんか？」</li>
                        <li onClick={() => copyToClipboard("秘密目標を達成しました")}>「秘密目標を達成しました」</li>
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
