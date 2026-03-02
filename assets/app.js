// assets/app.js

// ====== フラグ（localStorage） ======
const KEY_QUIZ = "nagi_quiz_passed_v3";
const KEY_GAME = "nagi_game_cleared_v1";

// ====== 3問すべて4択 ======
const QUIZ = [
  {
    id: 1,
    title: "Q1 記念日クイズ",
    text: "ふたりの記念日はいつ？",
    choices: ["1月24日", "1月25日", "1月26日", "2月25日"],
    answer: "1月25日",
  },
  {
    id: 2,
    title: "Q2 旅行クイズ",
    text: "熱海で泊まったホテル名は？",
    choices: ["ホテル貫一", "ホテルニューアカオ", "ホテル大野屋", "熱海後楽園ホテル"],
    answer: "ホテル貫一",
  },
  {
    id: 3,
    title: "Q3 誕プレクイズ",
    text: "今日あげる誕生日プレゼントはなに？",
    choices: ["ブレスレット", "洋服", "キャンメイク", "絹女アイロン"],
    answer: "絹女アイロン",
  }
];

// ====== 誕生日メッセージ（ここだけ好きに書き換えてOK） ======
const BIRTHDAY_MESSAGE = `
なぎちゃん、誕生日おめでとう。

今日は「なぎちゃんのためのフルコース」を作りたくて、
このサイトもこっそり用意しました。

いつも一緒にいてくれてありがとう。
これからも、笑ってるなぎちゃんを一番近くで見ていたい。

最高の1日にしよう。
`;

// ====== Secret page logic ======
function initSecretPage(){
  const root = document.querySelector("[data-secret-root]");
  if(!root) return;

  const quizPassed = localStorage.getItem(KEY_QUIZ) === "yes";
  const gameCleared = localStorage.getItem(KEY_GAME) === "yes";

  const qbox = root.querySelector(".qbox");
  const toast = root.querySelector("[data-toast]");
  const msgArea = root.querySelector("[data-message]");
  const gate = root.querySelector("[data-gate]");

  let idx = 0;

  function setToast(type, text){
    toast.className = "toast " + (type || "");
    toast.textContent = text;
  }

  function showMessage(){
    qbox.style.display = "none";
    toast.style.display = "none";
    if(gate) gate.style.display = "none";
    msgArea.style.display = "block";
    msgArea.textContent = BIRTHDAY_MESSAGE.trim();
  }

  function showGate(){
    qbox.style.display = "none";
    toast.style.display = "none";
    msgArea.style.display = "none";
    gate.style.display = "block";
  }

  // ① 両方クリア済み → メッセージ
  if(quizPassed && gameCleared){
    showMessage();
    return;
  }

  // ② クイズだけクリア済み → ゲーム誘導
  if(quizPassed && !gameCleared){
    showGate();
    return;
  }

  // ③ まだクイズ未クリア → クイズ開始
  function render(){
    const q = QUIZ[idx];
    qbox.innerHTML = `
      <h3 class="qtitle">${escapeHtml(q.title)}</h3>
      <p class="qtext">${escapeHtml(q.text)}</p>
      <div class="choices">
        ${q.choices.map(c => `
          <div class="choice" data-choice="${escapeHtml(c)}">${escapeHtml(c)}</div>
        `).join("")}
      </div>
      <p class="small center">（全3問）今：${idx+1}/3</p>
    `;

    setToast("", "選んだら次に進むよ。");
    toast.style.display = "block";

    qbox.querySelectorAll("[data-choice]").forEach(el=>{
      el.addEventListener("click", ()=>submitChoice(el.getAttribute("data-choice")));
    });
  }

  function wrong(){
    setToast("ng", "残念…！もう一回いこう。");
    qbox.classList.remove("shake");
    void qbox.offsetWidth;
    qbox.classList.add("shake");
  }

  function correct(){
    setToast("ok", "正解！次の問題へ。");
    idx++;
    if(idx >= QUIZ.length){
      localStorage.setItem(KEY_QUIZ, "yes");
      setTimeout(()=>location.href = "game.html", 450);
    } else {
      setTimeout(render, 450);
    }
  }

  function submitChoice(choice){
    const q = QUIZ[idx];
    if(choice === q.answer) correct();
    else wrong();
  }

  render();
}

function escapeHtml(s){
  return String(s)
    .replaceAll("&","&amp;")
    .replaceAll("<","&lt;")
    .replaceAll(">","&gt;")
    .replaceAll('"',"&quot;")
    .replaceAll("'","&#039;");
}

// ====== Active nav highlight ======
function initNav(){
  const path = location.pathname.split("/").pop() || "index.html";
  document.querySelectorAll("[data-nav]").forEach(a=>{
    const href = a.getAttribute("href");
    if(href === path) a.classList.add("active");
  });
}

document.addEventListener("DOMContentLoaded", ()=>{
  initNav();
  initSecretPage();
});