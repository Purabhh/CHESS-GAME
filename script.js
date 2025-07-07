let selectedSquare = null;
let selectedPiece = null;

document.addEventListener('DOMContentLoaded', () => {
  const board = {
    a8: "bR", b8: "bN", c8: "bB", d8: "bQ", e8: "bK", f8: "bB", g8: "bN", h8: "bR",
    a7: "bP", b7: "bP", c7: "bP", d7: "bP", e7: "bP", f7: "bP", g7: "bP", h7: "bP",
    a6: "", b6: "", c6: "", d6: "", e6: "", f6: "", g6: "", h6: "",
    a5: "", b5: "", c5: "", d5: "", e5: "", f5: "", g5: "", h5: "",
    a4: "", b4: "", c4: "", d4: "", e4: "", f4: "", g4: "", h4: "",
    a3: "", b3: "", c3: "", d3: "", e3: "", f3: "", g3: "", h3: "",
    a2: "wP", b2: "wP", c2: "wP", d2: "wP", e2: "wP", f2: "wP", g2: "wP", h2: "wP",
    a1: "wR", b1: "wN", c1: "wB", d1: "wQ", e1: "wK", f1: "wB", g1: "wN", h1: "wR"
  };

  function looper(board) {
    const pieceImages = {
      wK: "images/king-w.svg",
      wQ: "images/queen-w.svg",
      wR: "images/rook-w.svg",
      wB: "images/bishop-w.svg",
      wN: "images/knight-w.svg",
      wP: "images/pawn-w.svg",
      bK: "images/king-b.svg",
      bQ: "images/queen-b.svg",
      bR: "images/rook-b.svg",
      bB: "images/bishop-b.svg",
      bN: "images/knight-b.svg",
      bP: "images/pawn-b.svg"
    };

    for (let squareId in board) {
      const squareElement = document.getElementById(squareId);
      if (squareElement) {
        const piece = board[squareId];
        if (piece) {
          squareElement.style.backgroundImage = `url(${pieceImages[piece]})`;
        } else {
          squareElement.style.backgroundImage = "none";
        }

        // ✅ Highlight selected square
        if (squareId === selectedSquare) {
          squareElement.classList.add('selected');
        } else {
          squareElement.classList.remove('selected');
        }
      }
    }
  }

  function setupClickListeners(board) {
    for (let squareId in board) {
      const square = document.getElementById(squareId);
      if (square) {
        square.addEventListener("click", () => {
          if (!selectedSquare) {
            if (board[squareId] !== "") {
              selectedSquare = squareId;
              selectedPiece = board[squareId];
              looper(board);  // Re-render immediately to show highlight
            }
          } else {
            board[squareId] = selectedPiece;
            board[selectedSquare] = "";
            selectedSquare = null;
            selectedPiece = null;
            looper(board);  // Re-render after moving
          }
        });
      }
    }
  }

  looper(board);
  setupClickListeners(board);
});
