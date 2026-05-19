let peer;
let myId;
let video; // 手機端是本地相機，電腦端是接收到的遠端影像
let poseNet;
let poses = [];
let currentAction = 0;
let isPhone = false;
let remoteStreamReady = false;
let connectionStatus = "初始化中..."; // Added for status display
let qrcodeGenerated = false; // 確保 QR Code 只產生一次
let peerError = null; // Added for error display

function setup() {
  createCanvas(windowWidth, windowHeight);

  const urlParams = new URLSearchParams(window.location.search);
  const room = urlParams.get('room');

  // 建立 PeerJS 物件，加入明確的 STUN 伺服器配置以利跨網路連線
  const peerConfig = {
    config: {
      'iceServers': [
        { url: 'stun:stun.l.google.com:19302' },
        { url: 'stun:stun1.l.google.com:19302' }
      ]
    }
  };

  if (room) {
    // 手機端模式
    isPhone = true;
    connectionStatus = "請求相機權限...";
    video = createCapture(VIDEO, (stream) => {
      connectionStatus = "正在建立通訊伺服器連線...";
      peer = new Peer(peerConfig);
      peer.on('open', (id) => {
        myId = id; // Store phone's ID too
        peer.call(room, stream); // 撥號給電腦
        connectionStatus = "正在連線至電腦端...";
      });
      peer.on('error', (err) => {
        console.error("PeerJS Error (Phone):", err);
        peerError = err.type;
        connectionStatus = "連線失敗: " + err.type;
      });
      peer.on('close', () => {
        connectionStatus = "連線已關閉 (Phone)";
      });
    }, (err) => { // Error callback for createCapture
      console.error("Camera access error (Phone):", err);
      connectionStatus = "無法存取相機: " + err.name;
    });
    video.size(640, 480);
    video.hide();
  } else {
    // 電腦端模式
    peer = new Peer(peerConfig);
    peer.on('open', (id) => {
      myId = id;
      connectionStatus = "等待手機連線...";
      if (typeof updateQRCode === 'function' && !qrcodeGenerated) {
        updateQRCode(id);
        qrcodeGenerated = true;
      }
    });
    peer.on('error', (err) => {
      console.error("PeerJS Error (PC):", err);
      peerError = err.type;
      connectionStatus = "連線失敗: " + err.type;
    });
    peer.on('close', () => {
      connectionStatus = "連線已關閉 (PC)";
    });
    peer.on('call', (call) => {
      connectionStatus = "手機已連線，正在接收影像...";
      call.answer(); // 接聽手機的來電
      call.on('stream', (stream) => {
        // 接收手機影像
        video = createVideo();
        video.elt.srcObject = stream;
        video.elt.play();
        video.elt.muted = true; // 避免回音
        video.elt.setAttribute('playsinline', ''); // Added for remote video
        video.size(640, 480);
        video.hide();
        remoteStreamReady = true;
        
        // 初始化 PoseNet 偵測
        poseNet = ml5.poseNet(video, () => console.log("PoseNet 模型已準備好"));
        poseNet.on('pose', results => {
          poses = results;
        });
      });
      call.on('close', () => {
        connectionStatus = "手機連線已中斷";
        remoteStreamReady = false;
        video = null; // Clear video
      });
    });
  }
}

function draw() {
  background(0);
  
  let boxW = 640;
  let boxH = 480;
  let x = (width - boxW) / 2;
  let y = (height - boxH) / 2;

  if (isPhone) {
    // 手機端：顯示自己的鏡頭當作預覽
    if (video && video.elt.readyState === 4) { // Check if video is ready
      image(video, 0, 0, width, height, 0, 0, video.width, video.height, COVER);
    } else {
      background(0); // Ensure background is black if video not ready
    }
    
    // 狀態顯示
    fill(0, 150);
    noStroke();
    rect(0, height - 100, width, 100);
    fill(255);
    textAlign(CENTER, CENTER);
    textSize(20);
    text(connectionStatus, width / 2, height - 65);
    if (peerError) {
      fill(255, 100, 100);
      text("錯誤: " + peerError, width / 2, height - 35);
    }
  } else {
    // 電腦端繪製
    stroke(255);
    noFill();
    rect(x, y, boxW, boxH);

    if (remoteStreamReady && video && video.elt.readyState === 4) { // Check if video is ready
      image(video, x, y, boxW, boxH, 0, 0, video.width, video.height, COVER); // Use COVER to fill
      drawFaceEffect(x, y);
    } else {
      fill(255);
      noStroke();
      textSize(24);
      textAlign(CENTER, CENTER);
      
      if (peerError) {
        fill(255, 100, 100);
        text('連線錯誤: ' + peerError, width / 2, height / 2 - 20);
        textSize(16);
        text('請檢查瀏覽器控制台是否有更多錯誤訊息', width / 2, height / 2 + 20);
      } else {
        text(connectionStatus, width / 2, height / 2);
      }
    }
  }

  // 學生資訊
  fill(255);
  noStroke();
  textSize(20);
  textAlign(CENTER, CENTER);
  text('414730050 曹苡萱', width / 2, y - 20);
}

function drawFaceEffect(offsetX, offsetY) {
  // 使用 poseNet 結果繪製骨架並分類動作
  if (!poses || poses.length === 0) return;

  const p = poses[0].pose;

  // 繪製 keypoints
  p.keypoints.forEach(k => {
    if (k.score > 0.3) {
      fill(0, 255, 150);
      noStroke();
      ellipse(offsetX + k.position.x, offsetY + k.position.y, 8, 8);
    }
  });

  // 繪製骨架連線
  stroke(0, 200, 255);
  strokeWeight(2);
  const skeletonPairs = [
    ['leftShoulder','rightShoulder'], ['leftShoulder','leftElbow'], ['leftElbow','leftWrist'],
    ['rightShoulder','rightElbow'], ['rightElbow','rightWrist'], ['leftShoulder','leftHip'],
    ['rightShoulder','rightHip'], ['leftHip','rightHip'], ['leftHip','leftKnee'], ['leftKnee','leftAnkle'],
    ['rightHip','rightKnee'], ['rightKnee','rightAnkle']
  ];
  function getK(name){
    const kp = p.keypoints.find(k => k.part === name);
    return (kp && kp.score>0.2) ? kp.position : null;
  }
  skeletonPairs.forEach(pair => {
    const a = getK(pair[0]);
    const b = getK(pair[1]);
    if (a && b) line(offsetX + a.x, offsetY + a.y, offsetX + b.x, offsetY + b.y);
  });

  // 動作分類
  currentAction = classifyPose(p);

  // 將動作編號映射為中文猜拳名稱
  const actionNames = ["偵測中...", "剪刀", "石頭", "布"];

  // 在畫面上方顯示醒目的動作狀態框
  noStroke();
  fill(0, 200); // 黑色深色背景
  rect(offsetX + 10, offsetY + 10, 320, 90, 15); 

  fill(255, 255, 0); // 亮黃色文字最醒目
  textSize(56);      // 加大字體
  textAlign(LEFT, TOP);
  text('猜拳：' + actionNames[currentAction], offsetX + 30, offsetY + 25);
}

function classifyPose(pose) {
  if (!pose) return 0;
  function yOf(part){ const k = pose.keypoints.find(k=>k.part===part); return k && k.score>0.2 ? k.position.y : null; }
  const noseY = yOf('nose');
  const lW = yOf('leftWrist');
  const rW = yOf('rightWrist');

  // 若找不到必要點，回傳 0
  if (!noseY || !lW || !rW) return 0;

  // 猜拳判定邏輯：
  // 1. 雙手都在鼻子上方 -> 布
  if (lW < noseY && rW < noseY) return 3;
  
  // 2. 只有一隻手在鼻子上方 -> 剪刀
  if (lW < noseY || rW < noseY) return 1;
  
  // 3. 雙手都在鼻子下方 -> 石頭
  return 2;
}

function windowResized() {
  resizeCanvas(windowWidth, windowHeight);
}