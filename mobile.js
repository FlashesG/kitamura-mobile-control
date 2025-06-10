// ===== グローバル変数 =====
let operationData = null;
let operationId = null;
let db = null; // Firebase Realtime Databaseのインスタンス
let timeoutInterval = null;
let startTime = null;
let operationTimeout = 300; // デフォルト5分
let isDebugMode = false;

// ===== DOM要素 =====
const elements = {
  loadingScreen: null,
  errorScreen: null,
  productSelectionScreen: null,
  orderConfirmationScreen: null,
  completionScreen: null,
};

// ===== 初期化 =====
document.addEventListener('DOMContentLoaded', function() {
  try {
    initializeElements();
    parseUrlParameters();
    initializeFirebase(); // URL解析後にFirebaseを初期化
    setupEventListeners();
    updateConnectionStatus('🔄 接続中');
    
    if (operationId && db) {
      loadOperationData();
    } else {
      showError('URLパラメータが不正、またはFirebaseの初期化に失敗しました。');
    }
    
    // デバッグモード有効化（URLに?debug=1が含まれる場合）
    if (window.location.search.includes('debug=1')) {
      enableDebugMode();
    }
    
  } catch (error) {
    console.error('初期化エラー:', error);
    showError(`初期化エラー: ${error.message}`);
  }
});

// ===== DOM要素の初期化 =====
function initializeElements() {
  elements.loadingScreen = document.getElementById('loadingScreen');
  elements.errorScreen = document.getElementById('errorScreen');
  elements.productSelectionScreen = document.getElementById('productSelectionScreen');
  elements.orderConfirmationScreen = document.getElementById('orderConfirmationScreen');
  elements.completionScreen = document.getElementById('completionScreen');
  elements.errorMessage = document.getElementById('errorMessage');
  elements.retryButton = document.getElementById('retryButton');
  elements.productList = document.getElementById('productList');
  elements.productCount = document.getElementById('productCount');
  elements.timeoutCountdown = document.getElementById('timeoutCountdown');
  elements.orderTimeoutCountdown = document.getElementById('orderTimeoutCountdown');
  elements.confirmOrderButton = document.getElementById('confirmOrderButton');
  elements.cancelOrderButton = document.getElementById('cancelOrderButton');
  elements.cancelSelectionButton = document.getElementById('cancelSelectionButton');
  elements.completionMessage = document.getElementById('completionMessage');
  elements.closeButton = document.getElementById('closeButton');
  elements.connectionStatus = document.getElementById('connectionStatus');
  elements.debugInfo = document.getElementById('debugInfo');
  elements.debugContent = document.getElementById('debugContent');
}

// ===== URLパラメータの解析 =====
function parseUrlParameters() {
  const urlParams = new URLSearchParams(window.location.search);
  operationId = urlParams.get('operationId');
  
  debugLog('URLパラメータ解析', { operationId: operationId ? 'あり' : 'なし' });
  
  if (!operationId) {
    throw new Error('必要なパラメータ（operationId）が不足しています');
  }
}

// ===== Firebaseの初期化 =====
function initializeFirebase() {
    try {
        if (typeof firebase === 'undefined' || typeof firebaseConfig === 'undefined') {
            throw new Error('Firebase SDK または設定ファイルが読み込まれていません。');
        }
        // Firebaseアプリを初期化
        const app = firebase.initializeApp(firebaseConfig);
        // Realtime Databaseのインスタンスを取得
        db = firebase.database(app);
        debugLog('Firebase 初期化成功');
    } catch (error) {
        console.error('Firebase 初期化エラー:', error);
        throw new Error(`Firebaseの初期化に失敗しました: ${error.message}`);
    }
}

// ===== イベントリスナーの設定 =====
function setupEventListeners() {
  // 再試行ボタン
  if (elements.retryButton) {
    elements.retryButton.addEventListener('click', function() {
      hideAllScreens();
      showScreen(elements.loadingScreen);
      updateConnectionStatus('🔄 再接続中');
      loadOperationData();
    });
  }
  
  // 注文確定ボタン
  if (elements.confirmOrderButton) {
    elements.confirmOrderButton.addEventListener('click', function() {
      handleOrderConfirmation('confirm');
    });
  }
  
  // 注文キャンセルボタン
  if (elements.cancelOrderButton) {
    elements.cancelOrderButton.addEventListener('click', function() {
      handleOrderConfirmation('cancel');
    });
  }
  
  // 商品選択キャンセルボタン
  if (elements.cancelSelectionButton) {
    elements.cancelSelectionButton.addEventListener('click', function() {
      handleProductSelection('cancel');
    });
  }
  
  // 完了画面閉じるボタン
  if (elements.closeButton) {
    elements.closeButton.addEventListener('click', function() {
      window.close();
    });
  }
  
  // ページ離脱時のクリーンアップ
  window.addEventListener('beforeunload', function() {
    if (timeoutInterval) {
      clearInterval(timeoutInterval);
    }
  });
  
  // デバッグ機能：画面タップでデバッグ情報表示
  document.addEventListener('click', function(e) {
    if (isDebugMode && e.detail === 3) { // トリプルタップ
      toggleDebugInfo();
    }
  });
}

// ===== Firebase API関数 (v9 compat 対応) =====

// データ取得
async function getFromFirebase(id) {
  try {
    debugLog('Firebase データ取得開始', { operationId: id });
    const dbRef = db.ref(`operations/${id}`);
    const snapshot = await dbRef.get();
    if (snapshot.exists()) {
        const data = snapshot.val();
        debugLog('Firebase データ取得成功', { data });
        return data;
    } else {
        throw new Error('指定された操作データが見つかりません。');
    }
  } catch (error) {
    debugLog('Firebase データ取得エラー', { error: error.message });
    throw new Error(`データ取得エラー: ${error.message}`);
  }
}

// データ更新
async function updateFirebase(id, data) {
  try {
    debugLog('Firebase データ更新開始', { operationId: id, data });
    const dbRef = db.ref(`operations/${id}`);
    await dbRef.update(data);
    debugLog('Firebase データ更新成功');
  } catch (error) {
    debugLog('Firebase データ更新エラー', { error: error.message });
    throw new Error(`データ更新エラー: ${error.message}`);
  }
}

// ===== 操作データの読み込み =====
async function loadOperationData() {
  try {
    updateConnectionStatus('📡 データ読み込み中');
    
    operationData = await getFromFirebase(operationId);
    
    if (operationData.status !== 'waiting') {
      throw new Error(`この操作は既に応答済みです (状態: ${operationData.status})`);
    }
    
    // タイムアウト設定
    operationTimeout = operationData.timeout || 300;
    startTime = operationData.timestamp || Date.now();
    
    debugLog('操作データ読み込み完了', operationData);
    
    // 操作タイプに応じて画面表示
    if (operationData.action === 'select_product') {
      showProductSelectionScreen();
    } else if (operationData.action === 'order_confirmation') {
      showOrderConfirmationScreen();
    } else {
      throw new Error(`未知の操作タイプ: ${operationData.action}`);
    }
    
    updateConnectionStatus('✅ 接続完了');
    
  } catch (error) {
    console.error('操作データ読み込みエラー:', error);
    updateConnectionStatus('❌ 接続エラー');
    showError(error.message);
  }
}

// ===== 商品選択画面の表示 =====
function showProductSelectionScreen() {
  try {
    hideAllScreens();
    
    if (!operationData.products || operationData.products.length === 0) {
      throw new Error('商品データが見つかりません');
    }
    
    // 商品数表示
    if (elements.productCount) {
      elements.productCount.textContent = `${operationData.products.length}件の商品が見つかりました`;
    }
    
    // 商品リスト生成
    generateProductList(operationData.products);
    
    // タイムアウト開始
    startCountdown(elements.timeoutCountdown, () => {
      handleProductSelection('timeout');
    });
    
    showScreen(elements.productSelectionScreen);
    
    debugLog('商品選択画面表示完了', { productCount: operationData.products.length });
    
  } catch (error) {
    console.error('商品選択画面表示エラー:', error);
    showError(`商品選択画面の表示に失敗しました: ${error.message}`);
  }
}

// ===== 商品リストの生成 =====
function generateProductList(products) {
  if (!elements.productList) return;
  
  elements.productList.innerHTML = '';
  
  products.forEach((product, index) => {
    const productCard = document.createElement('div');
    productCard.className = 'product-card';
    productCard.setAttribute('data-index', index);
    
    // 価格表示の処理
    const priceText = product.price ? `¥${product.price.toLocaleString()}` : '価格不明';
    
    // 状態ランク表示の処理
    const conditionText = product.condition || '不明';
    
    // ターゲット情報表示の処理
    const targetText = product.targetInfo ? `検索: ${product.targetInfo}` : '';
    
    productCard.innerHTML = `
      <div class="product-header">
        <div class="product-index">${index + 1}</div>
        <div class="product-condition">${conditionText}</div>
      </div>
      <div class="product-name">${escapeHtml(product.name)}</div>
      <div class="product-details">
        <div class="product-price">${priceText}</div>
        ${targetText ? `<div class="product-target">${escapeHtml(targetText)}</div>` : ''}
      </div>
    `;
    
    // クリックイベント追加
    productCard.addEventListener('click', function() {
      handleProductSelection('select', index);
    });
    
    // タッチフィードバック追加
    addTouchFeedback(productCard);
    
    elements.productList.appendChild(productCard);
  });
  
  debugLog('商品リスト生成完了', { count: products.length });
}

// ===== 注文確認画面の表示 =====
function showOrderConfirmationScreen() {
  try {
    hideAllScreens();
    
    // タイムアウト開始
    startCountdown(elements.orderTimeoutCountdown, () => {
      handleOrderConfirmation('timeout');
    });
    
    showScreen(elements.orderConfirmationScreen);
    
    debugLog('注文確認画面表示完了');
    
  } catch (error) {
    console.error('注文確認画面表示エラー:', error);
    showError(`注文確認画面の表示に失敗しました: ${error.message}`);
  }
}

// ===== タイムアウトカウントダウン =====
function startCountdown(element, onTimeout) {
  if (!element || !startTime) return;
  
  // 既存のタイマーをクリア
  if (timeoutInterval) {
    clearInterval(timeoutInterval);
  }
  
  timeoutInterval = setInterval(() => {
    const elapsedSeconds = Math.floor((Date.now() - startTime) / 1000);
    const remainingSeconds = Math.max(0, operationTimeout - elapsedSeconds);
    
    if (remainingSeconds <= 0) {
      clearInterval(timeoutInterval);
      element.textContent = '00:00';
      if (onTimeout) {
        onTimeout();
      }
      return;
    }
    
    const minutes = Math.floor(remainingSeconds / 60);
    const seconds = remainingSeconds % 60;
    element.textContent = `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
    
    // 残り時間が少ない場合の警告表示
    if (remainingSeconds <= 30) {
      element.style.animation = 'pulse 0.5s ease-in-out infinite';
      element.style.background = 'linear-gradient(135deg, #dc3545, #c82333)';
    } else if (remainingSeconds <= 60) {
      element.style.background = 'linear-gradient(135deg, #fd7e14, #e55a00)';
    }
  }, 1000);
  
  debugLog('カウントダウン開始', { timeout: operationTimeout, startTime });
}

// ===== 商品選択処理 =====
async function handleProductSelection(action, selectedIndex = null) {
  try {
    clearInterval(timeoutInterval);
    
    let responseData;
    let completionMessage;
    
    if (action === 'select' && selectedIndex !== null) {
      const selectedProduct = operationData.products[selectedIndex];
      responseData = {
        status: 'completed',
        selectedProductIndex: selectedIndex,
        timestamp: Date.now()
      };
      completionMessage = `「${selectedProduct.name}」を選択しました。PCで自動購入を開始しています...`;
      
      debugLog('商品選択', { selectedIndex, product: selectedProduct });
      
    } else if (action === 'cancel') {
      responseData = {
        status: 'completed',
        action: 'cancel',
        timestamp: Date.now()
      };
      completionMessage = '商品選択をキャンセルしました。';
      
      debugLog('商品選択キャンセル');
      
    } else if (action === 'timeout') {
      responseData = {
        status: 'completed',
        action: 'timeout',
        timestamp: Date.now()
      };
      completionMessage = 'タイムアウトしました。PCで手動操作を行ってください。';
      
      debugLog('商品選択タイムアウト');
    }
    
    // 結果をFirebaseに保存
    updateConnectionStatus('📤 結果を送信中');
    await updateFirebase(operationId, responseData);
    updateConnectionStatus('✅ 送信完了');
    
    // 完了画面を表示
    showCompletionScreen(completionMessage);
    
  } catch (error) {
    console.error('商品選択処理エラー:', error);
    updateConnectionStatus('❌ 送信エラー');
    showError(`選択の送信に失敗しました: ${error.message}`);
  }
}

// ===== 注文確認処理 =====
async function handleOrderConfirmation(action) {
  try {
    clearInterval(timeoutInterval);
    
    let responseData;
    let completionMessage;
    
    if (action === 'confirm') {
      responseData = {
        status: 'completed',
        action: 'confirm',
        timestamp: Date.now()
      };
      completionMessage = '注文確定を実行しました。PCで購入処理を完了しています...';
      
      debugLog('注文確定');
      
    } else if (action === 'cancel') {
      responseData = {
        status: 'completed',
        action: 'cancel',
        timestamp: Date.now()
      };
      completionMessage = '注文をキャンセルしました。';
      
      debugLog('注文キャンセル');
      
    } else if (action === 'timeout') {
      responseData = {
        status: 'completed',
        action: 'timeout',
        timestamp: Date.now()
      };
      completionMessage = 'タイムアウトしました。PCで手動で注文を確定してください。';
      
      debugLog('注文確認タイムアウト');
    }
    
    // 結果をFirebaseに保存
    updateConnectionStatus('📤 結果を送信中');
    await updateFirebase(operationId, responseData);
    updateConnectionStatus('✅ 送信完了');
    
    // 完了画面を表示
    showCompletionScreen(completionMessage);
    
  } catch (error) {
    console.error('注文確認処理エラー:', error);
    updateConnectionStatus('❌ 送信エラー');
    showError(`確認結果の送信に失敗しました: ${error.message}`);
  }
}

// ===== 画面表示制御 =====
function hideAllScreens() {
  const screens = [
    elements.loadingScreen,
    elements.errorScreen,
    elements.productSelectionScreen,
    elements.orderConfirmationScreen,
    elements.completionScreen,
  ];
  screens.forEach(screen => {
    if (screen) {
      screen.style.display = 'none';
    }
  });
}

function showScreen(screen) {
  if (screen) {
    screen.style.display = 'block';
  }
}

function showError(message) {
  hideAllScreens();
  if (elements.errorMessage) {
    elements.errorMessage.textContent = message;
  }
  showScreen(elements.errorScreen);
  debugLog('エラー表示', { message });
}

function showCompletionScreen(message) {
  hideAllScreens();
  if (elements.completionMessage) {
    elements.completionMessage.textContent = message;
  }
  showScreen(elements.completionScreen);
  
  // 5秒後に自動で閉じる
  setTimeout(() => {
    window.close();
  }, 5000);
  
  debugLog('完了画面表示', { message });
}

// ===== 接続状況表示 =====
function updateConnectionStatus(status) {
  if (elements.connectionStatus) {
    elements.connectionStatus.textContent = status;
  }
  debugLog('接続状況更新', { status });
}

// ===== ユーティリティ関数 =====

// HTMLエスケープ
function escapeHtml(text) {
  if (text === null || text === undefined) return '';
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

// タッチフィードバック追加
function addTouchFeedback(element) {
  element.addEventListener('touchstart', function() {
    element.style.transform = 'scale(0.98)';
  });
  
  element.addEventListener('touchend', function() {
    element.style.transform = '';
  });
  
  element.addEventListener('touchcancel', function() {
    element.style.transform = '';
  });
}

// ===== デバッグ機能 =====
function enableDebugMode() {
  isDebugMode = true;
  if (elements.debugInfo) {
    elements.debugInfo.style.display = 'block';
  }
  debugLog('デバッグモード有効化');
}

function toggleDebugInfo() {
  if (elements.debugInfo) {
    const isVisible = elements.debugInfo.style.display !== 'none';
    elements.debugInfo.style.display = isVisible ? 'none' : 'block';
  }
}

function debugLog(action, data = null) {
  const timestamp = new Date().toLocaleTimeString();
  const logEntry = `[${timestamp}] ${action}`;
  
  console.log(logEntry, data);
  
  if (isDebugMode && elements.debugContent) {
    const logDiv = document.createElement('div');
    logDiv.innerHTML = `<strong>${logEntry}</strong><br>${data ? JSON.stringify(data, null, 2).replace(/\n/g, '<br>').replace(/ /g, ' ') : ''}`;
    elements.debugContent.appendChild(logDiv);
    
    // ログが多すぎる場合は古いものを削除
    while (elements.debugContent.children.length > 20) {
      elements.debugContent.removeChild(elements.debugContent.firstChild);
    }
    
    // 最新ログまでスクロール
    elements.debugContent.scrollTop = elements.debugContent.scrollHeight;
  }
}

// ===== パフォーマンス監視 =====
window.addEventListener('load', function() {
  debugLog('ページ読み込み完了', {
    loadTime: Math.round(performance.now()),
    userAgent: navigator.userAgent,
    screenSize: `${screen.width}x${screen.height}`,
    viewportSize: `${window.innerWidth}x${window.innerHeight}`
  });
});

// ===== エラーハンドリング =====
window.addEventListener('error', function(event) {
  debugLog('JavaScriptエラー', {
    message: event.message,
    filename: event.filename,
    lineno: event.lineno,
    colno: event.colno
  });
  
  updateConnectionStatus('❌ エラー発生');
});

window.addEventListener('unhandledrejection', function(event) {
  debugLog('未処理のPromise拒否', {
    reason: event.reason
  });
  
  updateConnectionStatus('❌ 通信エラー');
});