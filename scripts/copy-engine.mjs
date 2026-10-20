// Copies the Stockfish build out of node_modules so the browser can load it as a Web Worker.
import { copyFileSync, mkdirSync } from 'node:fs';

mkdirSync('public/engine', { recursive: true });
copyFileSync('node_modules/stockfish.js/stockfish.js', 'public/engine/stockfish.js');
copyFileSync('node_modules/stockfish.js/Copying.txt', 'public/engine/COPYING.txt');
console.log('engine copied to public/engine');
