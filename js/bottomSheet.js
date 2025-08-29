/* ========= BOTTOM SHEET ========= */
export const bottomSheet = document.getElementById("bottom-sheet");
let sheetState = "collapsed"; // collapsed / half / full

export function setSheetState(state) {
    sheetState = state;
    bottomSheet.dataset.state = state;
}

// Touch dragging logic (simplified placeholders)
bottomSheet.addEventListener("touchstart", startDrag);
bottomSheet.addEventListener("touchmove", onDrag);
bottomSheet.addEventListener("touchend", endDrag);

function startDrag(e) { /* implement drag start */ }
function onDrag(e) { /* implement dragging */ }
function endDrag(e) { /* implement drag end */ }

