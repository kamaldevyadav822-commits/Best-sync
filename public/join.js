// join.js — validate room existence before redirecting

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

// Helper: check room existence using server endpoint
async function roomExists(code) {
  try {
    const r = await fetch(`/api/room-exists?room=${encodeURIComponent(code)}`);
    if (!r.ok) return false;
    const j = await r.json();
    return !!j.exists;
  } catch (e) {
    return false;
  }
}

// JOIN flow: validate then redirect
btnJoin.addEventListener("click", async () => {
  const code = (joinCode.value || "").trim();
  if (!/^\d{4}$/.test(code)) {
    setStatus("Enter a valid 4-digit code.", true);
    return;
  }
  const name = (inpName.value || "").trim() || randName();

  showLoader("Checking room...");
  const exists = await roomExists(code);
  hideLoader();

  if (!exists) {
    setStatus("Room not found. Check the code or ask host to create a room.", true);
    return;
  }

  // safe: redirect to player page join flow
  const url = `/player.html?room=${encodeURIComponent(code)}&role=GUEST&name=${encodeURIComponent(name)}`;
  window.location.href = url;
});

// CREATE flow: create via player page (no change)
btnCreate.addEventListener("click", () => {
  const name = (inpName.value || "").trim() || randName();
  const url = `/player.html?create=1&role=HOST&name=${encodeURIComponent(name)}`;
  showLoader("Creating room...");
  setTimeout(() => {
    hideLoader();
    window.location.href = url;
  }, 350);
});

joinCode.addEventListener("keydown", (e) => {
  if (e.key === "Enter") btnJoin.click();
});

if (!inpName.value) inpName.value = randName();
