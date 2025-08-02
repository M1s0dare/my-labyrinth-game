/**
 * 発言テンプレートモーダルコンポーネント
 */

import React from 'react';
import { X, MessageSquare } from 'lucide-react';

const SpeechTemplateModal = ({ isOpen, onClose, onSelectTemplate }) => {
    if (!isOpen) return null;

    const templates = [
        {
            category: "質問・確認",
            items: [
                "どこにいますか？",
                "どちらの方向に向かっていますか？",
                "ゴールは見つかりましたか？",
                "現在のスコアはどのくらいですか？",
                "壁に阻まれていませんか？"
            ]
        },
        {
            category: "情報共有",
            items: [
                "ゴールを発見しました！",
                "この方向は行き止まりです",
                "○○の位置に壁があります",
                "スタート地点に戻りました",
                "順調に進んでいます"
            ]
        },
        {
            category: "作戦・協力",
            items: [
                "一緒に探索しませんか？",
                "この道を試してみましょう",
                "別々の道を探索しましょう",
                "情報を共有しましょう",
                "頑張りましょう！"
            ]
        },
        {
            category: "リアクション",
            items: [
                "お疲れ様です！",
                "ナイスプレイ！",
                "すごいですね！",
                "頑張って！",
                "ありがとうございます！"
            ]
        }
    ];

    const handleTemplateSelect = (template) => {
        onSelectTemplate(template);
        onClose();
    };

    return (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-lg shadow-xl max-w-2xl w-full max-h-[80vh] overflow-hidden">
                {/* ヘッダー */}
                <div className="flex items-center justify-between p-4 border-b bg-blue-50">
                    <h2 className="text-xl font-bold text-gray-800 flex items-center">
                        <MessageSquare className="mr-2 text-blue-600" size={24}/>
                        発言テンプレート
                    </h2>
                    <button
                        onClick={onClose}
                        className="text-gray-500 hover:text-gray-700 transition-colors"
                    >
                        <X size={24}/>
                    </button>
                </div>

                {/* コンテンツ */}
                <div className="p-4 overflow-y-auto max-h-[60vh]">
                    <p className="text-gray-600 mb-4 text-sm">
                        以下のテンプレートをクリックして、チャットに入力することができます。
                    </p>
                    
                    <div className="space-y-6">
                        {templates.map((category, categoryIndex) => (
                            <div key={categoryIndex}>
                                <h3 className="text-lg font-semibold text-gray-800 mb-3 border-b border-gray-200 pb-2">
                                    {category.category}
                                </h3>
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                                    {category.items.map((template, templateIndex) => (
                                        <button
                                            key={templateIndex}
                                            onClick={() => handleTemplateSelect(template)}
                                            className="text-left p-3 bg-gray-50 hover:bg-blue-50 border border-gray-200 hover:border-blue-300 rounded-lg transition-colors text-sm text-gray-800"
                                        >
                                            {template}
                                        </button>
                                    ))}
                                </div>
                            </div>
                        ))}
                    </div>
                </div>

                {/* フッター */}
                <div className="p-4 border-t bg-gray-50 text-center">
                    <button
                        onClick={onClose}
                        className="bg-gray-500 hover:bg-gray-600 text-white px-6 py-2 rounded-lg transition-colors"
                    >
                        閉じる
                    </button>
                </div>
            </div>
        </div>
    );
};

export default SpeechTemplateModal;
