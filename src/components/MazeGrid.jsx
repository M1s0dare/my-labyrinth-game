/**
 * 迷路グリッドコンポーネント
 * 迷路の表示と壁の描画、プレイヤーの位置、トラップなどを管理
 */

import React from 'react';
import { User, UserCheck, Skull } from 'lucide-react';
import { STANDARD_GRID_SIZE } from '../constants';

/**
 * 迷路グリッドコンポーネント
 * @param {Object} props - コンポーネントのプロパティ
 * @param {Object} mazeData - 迷路データ（壁情報、スタート/ゴール位置など）
 * @param {Object} playerPosition - プレイヤーの現在位置
 * @param {boolean} showAllWalls - すべての壁を表示するかどうか
 * @param {Array} wallSettings - 壁の設定（作成モード時）
 * @param {Function} onWallClick - 壁クリック時のハンドラー
 * @param {boolean} isCreating - 作成モードかどうか
 * @param {Object} startPos - スタート位置
 * @param {Object} goalPos - ゴール位置
 * @param {Function} onCellClick - セルクリック時のハンドラー
 * @param {Object} revealedCells - 明かされたセルの情報
 * @param {Array} revealedPlayerWalls - 明かされた壁の情報
 * @param {boolean} smallView - 小さい表示モードかどうか
 * @param {boolean} highlightPlayer - プレイヤーをハイライトするかどうか
 * @param {Array} otherPlayers - 他のプレイヤーの情報
 * @param {number} gridSize - グリッドサイズ
 * @param {Array} traps - トラップの位置情報
 * @param {boolean} selectingTrapCoord - トラップ座標選択モードかどうか
 * @param {Function} onTrapCoordSelect - トラップ座標選択時のハンドラー
 * @param {Array} alliedPlayersPos - 同盟プレイヤーの位置
 * @param {Array} sharedWallsFromAllies - 同盟プレイヤーから共有された壁情報
 * @param {boolean} showAllPlayerPositions - 全プレイヤーの位置を表示するかどうか
 */
const MazeGrid = ({
    mazeData,
    playerPosition,
    showAllWalls,
    wallSettings,
    onWallClick,
    isCreating,
    startPos,
    goalPos,
    onCellClick,
    revealedCells = {},
    revealedPlayerWalls = [],
    smallView = false,
    highlightPlayer = true,
    otherPlayers = [],
    gridSize = STANDARD_GRID_SIZE,
    traps = [],
    selectingTrapCoord = false,
    onTrapCoordSelect,
    alliedPlayersPos = [],
    sharedWallsFromAllies = [],
    showAllPlayerPositions = false
}) => {
    // ローディング表示の処理
    if (!isCreating && !mazeData && !smallView) return <div className="text-center p-4">迷路データを読み込み中...</div>;
    if (smallView && !mazeData) return <div className="text-center p-1 text-xs">データなし</div>;

    // 使用する壁データを決定（作成モードか通常モードか）
    const wallsToConsider = isCreating ? wallSettings : mazeData?.walls;

    // グリッドサイズに応じたセルサイズの動的調整
    let baseCellSize = 'w-12 h-12 md:w-16 md:h-16';
    if (gridSize > 7) baseCellSize = 'w-8 h-8 md:w-10 md:h-10';
    if (gridSize > 10) baseCellSize = 'w-7 h-7 md:w-8 md:h-8';

    // 表示モードに応じたセルサイズとアイコンサイズの設定
    const cellSize = smallView ? (gridSize > 7 ? 'w-5 h-5 md:w-6 md:h-6' : 'w-6 h-6 md:w-8 md:h-8') : baseCellSize;
    const iconSize = smallView ? (gridSize > 7 ? 10 : 12) : (gridSize > 7 ? 16 : 24);
    const textSize = smallView ? 'text-2xs md:text-xs' : (gridSize > 7 ? 'text-xs' : 'text-sm');

    /**
     * セルに表示するコンテンツを決定する関数
     * @param {number} r - 行インデックス
     * @param {number} c - 列インデックス
     * @returns {JSX.Element|null} セルに表示するコンテンツ
     */
    const renderCellContent = (r, c) => {
        // 作成モードの場合
        if (isCreating) {
            if (startPos && startPos.r === r && startPos.c === c) return <span className={`font-bold ${textSize} text-green-700`}>S</span>;
            if (goalPos && goalPos.r === r && goalPos.c === c) return <span className={`font-bold ${textSize} text-red-700`}>G</span>;
            return null;
        }

        // 通常モードの場合、プレイヤーやトラップなどの情報を収集
        const playersOnThisCell = otherPlayers.filter(p => p.position.r === r && p.position.c === c);
        const trapOnCell = traps.find(t => t.r === r && t.c === c && t.mazeOwnerId === mazeData?.ownerId);
        const isAlliedPlayerOnCell = alliedPlayersPos.find(p => p.r === r && p.c === c);

        let cellPlayerIcons = [];
        
        // メインプレイヤーのアイコン表示
        if (highlightPlayer && playerPosition && playerPosition.r === r && playerPosition.c === c) {
            cellPlayerIcons.push(<User key="mainPlayer" size={iconSize} className="text-white z-10" />);
        }
        
        // 全プレイヤー位置表示モードの場合（2人対戦モードで使用）
        if (showAllPlayerPositions && !smallView) {
            otherPlayers.forEach(p => {
                if (p.position && p.position.r === r && p.position.c === c && (!playerPosition || p.id !== playerPosition.id)) {
                     cellPlayerIcons.push(<User key={p.id} size={iconSize * 0.8} className="text-orange-500 opacity-90 absolute" title={`相手プレイヤー: ${p.id.substring(0,5)}`} style={{left: `${Math.random()*20+30}%`, top: `${Math.random()*20+30}%`}} />);
                }
            });
        } else {
            // 通常モードでの他プレイヤー表示
            if (isAlliedPlayerOnCell && !smallView) {
                 if (!highlightPlayer || !playerPosition || playerPosition.r !==r || playerPosition.c !==c) {
                    cellPlayerIcons.push(<UserCheck key={`ally-${isAlliedPlayerOnCell.id}`} size={iconSize * 0.8} className="text-green-500 opacity-80 absolute z-5" title={`Allied: ${isAlliedPlayerOnCell.id.substring(0,5)}`} />);
                 }
            }
            if (playersOnThisCell.length > 0 && !smallView) {
                playersOnThisCell.forEach(p => {
                    if (p.position && (!highlightPlayer || !playerPosition || playerPosition.r !== r || playerPosition.c !== c)) {
                         if (!alliedPlayersPos.find(ap => ap.id === p.id && ap.r === r && ap.c ===c))
                            cellPlayerIcons.push(<User key={p.id} size={iconSize * 0.8} className="text-purple-400 opacity-70 absolute" title={p.id.substring(0,5)} />);
                    }
                });
            }
        }
        
        // トラップの表示
        if (trapOnCell && !smallView && (!playerPosition || playerPosition.r !==r || playerPosition.c !== c)) {
            cellPlayerIcons.push(<Skull key="trap" size={iconSize * 0.7} className="text-red-500 opacity-60 absolute z-0" title={`Trap by ${trapOnCell.ownerId.substring(0,5)}`} />);
        }

        // スタート・ゴール位置の表示（現在位置がある場合はプレイヤーアイコンを優先）
        if (highlightPlayer && playerPosition && playerPosition.r === r && playerPosition.c === c) {
            // 現在位置にいる場合はプレイヤーアイコンを優先表示
            return <>{cellPlayerIcons}</>;
        }
        
        // 現在位置にいない場合のみスタート・ゴールを表示
        if (mazeData?.start?.r === r && mazeData?.start?.c === c) return <><span className={`font-bold ${textSize} text-green-700`}>S</span>{cellPlayerIcons}</>;
        if (mazeData?.goal?.r === r && mazeData?.goal?.c === c) return <><span className={`font-bold ${textSize} text-red-700`}>G</span>{cellPlayerIcons}</>;
        
        return cellPlayerIcons.length > 0 ? <>{cellPlayerIcons}</> : null;
    };

    /**
     * 2つのセル間に壁があるかどうかを判定する関数
     * 仕様書に基づく正確な壁座標系を使用
     * @param {number} r1 - セル1の行
     * @param {number} c1 - セル1の列
     * @param {number} r2 - セル2の行
     * @param {number} c2 - セル2の列
     * @returns {boolean} 壁の存在有無
     */
    const hasWallBetween = (r1, c1, r2, c2) => {
        if (!wallsToConsider && (!sharedWallsFromAllies || sharedWallsFromAllies.length === 0)) return false;
        
        let wallR, wallC, wallType;
        
        // 移動方向に応じて壁のタイプと位置を決定
        // 仕様書準拠：壁はマスとマスの間に存在
        if (r1 === r2) { 
            // 水平移動：縦の壁をチェック
            wallType = 'vertical'; 
            wallR = r1; 
            wallC = Math.min(c1, c2); // より小さい列番号を使用
        } else if (c1 === c2) { 
            // 垂直移動：横の壁をチェック
            wallType = 'horizontal'; 
            wallR = Math.min(r1, r2); // より小さい行番号を使用
            wallC = c1; 
        } else {
            // 斜め移動は許可されていない
            return false;
        }
        
        // 壁の存在を確認（activeフラグもチェック）
        const definingWall = wallsToConsider?.find(w => 
            w.type === wallType && w.r === wallR && w.c === wallC && w.active === true
        );
        const sharedWall = sharedWallsFromAllies?.find(w => 
            w.type === wallType && w.r === wallR && w.c === wallC && w.active === true
        );

        // 表示モードに応じた壁の可視性判定
        if (isCreating || smallView) return !!definingWall;
        if (showAllWalls) return !!definingWall || !!sharedWall;
        
        const revealedWall = revealedPlayerWalls.find(w => 
            w.type === wallType && w.r === wallR && w.c === wallC && w.active === true
        );
        return !!revealedWall || !!sharedWall;
    };

    // メインの迷路グリッドをレンダリング
    return (
        <div className={`grid grid-cols-1 gap-0 ${smallView ? 'border-2' : 'border-4'} border-black bg-gray-50 rounded-md shadow-lg`} style={{ gridTemplateColumns: `repeat(${gridSize}, minmax(0, 1fr))`}}>
            {/* グリッドの各行・各列をループで生成 */}
            {Array(gridSize).fill(0).map((_, r) =>
                Array(gridSize).fill(0).map((_, c) => {
                    const cellKey = `${r}-${c}`;
                    let cellClasses = `${cellSize} flex items-center justify-center relative`;

                    // 作成モードでのセルの背景色設定
                    if (isCreating) {
                        if (startPos && startPos.r === r && startPos.c === c) cellClasses += " bg-green-300";
                        else if (goalPos && goalPos.r === r && goalPos.c === c) cellClasses += " bg-red-300";
                        else cellClasses += " hover:bg-gray-100 cursor-pointer";
                    } 
                    // 通常モードでのセルの背景色設定
                    else if (!smallView) {
                        if (highlightPlayer && playerPosition && playerPosition.r === r && playerPosition.c === c) 
                            cellClasses += " bg-blue-400 transition-colors duration-300";
                        else if (mazeData?.start?.r === r && mazeData?.start?.c === c) 
                            cellClasses += " bg-green-200";
                        else if (mazeData?.goal?.r === r && mazeData?.goal?.c === c) 
                            cellClasses += " bg-red-200";
                        else if (revealedCells[`${r}-${c}`]) 
                            cellClasses += " bg-yellow-100";
                        else 
                            cellClasses += " bg-gray-50";
                    } 
                    // 小さい表示モードでのセルの背景色設定
                    else { 
                        if (highlightPlayer && playerPosition && playerPosition.r === r && playerPosition.c === c) 
                            cellClasses += " bg-blue-300";
                        else if (mazeData?.start?.r === r && mazeData?.start?.c === c) 
                            cellClasses += " bg-green-100";
                        else if (mazeData?.goal?.r === r && mazeData?.goal?.c === c) 
                            cellClasses += " bg-red-100";
                        else 
                            cellClasses += " bg-gray-100";
                    }
                    
                    // トラップ座標選択モード時のカーソル設定
                    if (selectingTrapCoord && onTrapCoordSelect && !isCreating && !smallView) {
                        cellClasses += " cursor-crosshair hover:bg-red-200/50";
                    }

                    // 壁の境界線スタイルを設定
                    let borderStyles = "";
                    const wallBorderThickness = gridSize > 7 ? 'border-2' : 'border-4'; // 壁を太くして見やすく
                    const wallBorder = smallView ? 'border-black' : `border-black ${wallBorderThickness}`;
                    const pathBorder = smallView ? 'border-gray-300' : 'border-gray-300';
                    const outerBorderThickness = gridSize > 7 ? 'border-black' : 'border-t-4 border-t-black'; // 外枠も太く

                    // 上の境界線を設定
                    if (r === 0) borderStyles += ` border-t ${gridSize > 7 && smallView ? 'border-black' : outerBorderThickness}`;
                    else if (hasWallBetween(r,c,r-1,c)) borderStyles += ` border-t ${wallBorderThickness} border-t-black`; 
                    else borderStyles += ` border-t ${pathBorder}`;
                    
                    // 下の境界線を設定
                    if (r === gridSize - 1) borderStyles += ` border-b ${gridSize > 7 && smallView ? 'border-black' : `border-b-4 border-b-black`}`;
                    else if (hasWallBetween(r,c,r+1,c)) borderStyles += ` border-b ${wallBorderThickness} border-b-black`; 
                    else borderStyles += ` border-b ${pathBorder}`;

                    // 左の境界線を設定
                    if (c === 0) borderStyles += ` border-l ${gridSize > 7 && smallView ? 'border-black' : `border-l-4 border-l-black`}`;
                    else if (hasWallBetween(r,c,r,c-1)) borderStyles += ` border-l ${wallBorderThickness} border-l-black`; 
                    else borderStyles += ` border-l ${pathBorder}`;

                    // 右の境界線を設定
                    if (c === gridSize - 1) borderStyles += ` border-r ${gridSize > 7 && smallView ? 'border-black' : `border-r-4 border-r-black`}`;
                    else if (hasWallBetween(r,c,r,c+1)) borderStyles += ` border-r ${wallBorderThickness} border-r-black`; 
                    else borderStyles += ` border-r ${pathBorder}`;
                    
                    cellClasses += ` ${borderStyles}`;

                    return (
                        <div
                            key={cellKey}
                            className={cellClasses}
                            onClick={() => {
                                // セルクリック時の処理
                                if (isCreating && onCellClick) onCellClick(r, c);
                                if (selectingTrapCoord && onTrapCoordSelect) onTrapCoordSelect(r, c);
                            }}
                        >
                            {/* セルの内容を表示 */}
                            {renderCellContent(r,c)}
                            
                            {/* 作成モードでの壁編集用UIを表示 */}
                            {isCreating && onWallClick && !smallView && (
                                <>
                                    {/* 横の壁編集用エリア */}
                                    {r < gridSize - 1 && (
                                        <div title={`H-wall (${r},${c})`}
                                            className={`absolute bottom-[-4px] left-0 w-full h-[8px] cursor-pointer hover:bg-blue-300/50 z-10 ${wallSettings && wallSettings.find(w=>w.type==='horizontal' && w.r===r && w.c===c)?.active ? 'bg-black/50' : 'bg-gray-300/30'}`}
                                            onClick={(e) => { e.stopPropagation(); onWallClick(r, c, 'horizontal'); }}
                                        />
                                    )}
                                    {/* 縦の壁編集用エリア */}
                                    {c < gridSize - 1 && (
                                        <div title={`V-wall (${r},${c})`}
                                            className={`absolute top-0 right-[-4px] w-[8px] h-full cursor-pointer hover:bg-blue-300/50 z-10 ${wallSettings && wallSettings.find(w=>w.type==='vertical' && w.r===r && w.c===c)?.active ? 'bg-black/50' : 'bg-gray-300/30'}`}
                                            onClick={(e) => { e.stopPropagation(); onWallClick(r, c, 'vertical'); }}
                                        />
                                    )}
                                </>
                            )}
                        </div>
                    );
                })
            )}
        </div>
    );
};

export default MazeGrid;
