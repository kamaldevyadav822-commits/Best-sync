// join.js — handles small UI, random name, and redirect logic to player page

function randName() {
  const ADJ = ["silent","lucky","wild","clever","sleepy","cosmic"];
  const NOUN = ["fox","tiger","otter","panda","wolf","eagle"];
  return `${ADJ[Math.floor(Math.random()*ADJ.length)]}-${NOUN[Math.floor(Math.random()*NOUN.length)]}-${Math.floor(Math.random()*900+100)}`;
}

const inpName = document.getElementById("inpName");
const btnRand = document.getElementById("btnRand");
const joinCode = document.getElementById("joinCode");
const btnJoin = document.getElementById("btnJoin");
const btnCreate = document.getElementById("btnCreate");
const statusEl = document.getElementById("status");
const loader = document.getElementById("loader");
const loaderText = document.getElementById("loaderText");

btnRand.addEventListener("click", () => {
  inpName.value = randName();
});

function showLoader(txt = "Working...") {
  loader.classList.remove("hidden");
  loaderText.textContent = txt;
}
function hideLoader() {
  loader.classList.add("hidden");
}

function setStatus(txt, isError = false) {
  statusEl.textContent = txt;
  statusEl.className = isError ? "mt-4 text-sm text-red-400" : "mt-4 text-sm text-slate-400";
}

// JOIN flow: go to player page as GUEST with room code and name
btnJoin.addEventListener("click", () => {
  const code = (joinCode.value || "").trim();
  if (!/^\d{4}$/.test(code)) {
    setStatus("Enter a valid 4-digit code.", true);
    return;
  }
  const name = (inpName.value || "").trim() || randName();
  // redirect to player page which will make the socket join
  const url = `/player.html?room=${encodeURIComponent(code)}&role=GUEST&name=${encodeURIComponent(name)}`;
  // small animation
  showLoader("Opening room...");
  setTimeout(() => {
    hideLoader();
    window.location.href = url;
  }, 300);
});

// CREATE flow: go to player page with create=1 (player will call room:create)
btnCreate.addEventListener("click", () => {
  const name = (inpName.value || "").trim() || randName();
  const url = `/player.html?create=1&role=HOST&name=${encodeURIComponent(name)}`;
  showLoader("Creating room...");
  setTimeout(() => {
    hideLoader();
    window.location.href = url;
  }, 350);
});

// UX: allow Enter key on code input
joinCode.addEventListener("keydown", (e) => {
  if (e.key === "Enter") btnJoin.click();
});

// populate default name
if (!inpName.value) inpName.value = randName();
