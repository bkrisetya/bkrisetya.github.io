const filterIds = ["sector", "status", "review", "gap"];
const summary = document.querySelector("#lens-summary");
const shell = document.querySelector(".dashboard-shell");

function fitShell() {
  const scale = Math.min(window.innerWidth / 1600, window.innerHeight / 900);
  shell.style.transform = `scale(${scale})`;
  shell.style.left = `${Math.max(0, (window.innerWidth - 1600 * scale) / 2)}px`;
  shell.style.top = `${Math.max(0, (window.innerHeight - 900 * scale) / 2)}px`;
}

function updateLens() {
  const selected = filterIds.map((id) => document.querySelector(`#${id}`).value);
  summary.textContent = selected.join(" / ");
}

document.querySelectorAll("select").forEach((select) => {
  select.addEventListener("change", updateLens);
});

updateLens();
fitShell();
window.addEventListener("resize", fitShell);
