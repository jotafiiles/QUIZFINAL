/**
 * Firebase Realtime Database Configuration & Initialization
 * Utiliza Firebase SDK v10 mediante módulos ES6.
 * Listo para ejecución nativa en GitHub Pages.
 */

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { 
  getDatabase, 
  ref, 
  set, 
  get, 
  child, 
  push, 
  onValue 
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-database.js";

const firebaseConfig = {
  apiKey: "AIzaSyD4WvpkbHVh6mXji59QjA3XbFzKFksNSec",
  authDomain: "proyecto-quiz---pp.firebaseapp.com",
  databaseURL: "https://proyecto-quiz---pp-default-rtdb.firebaseio.com",
  projectId: "proyecto-quiz---pp",
  storageBucket: "proyecto-quiz---pp.firebasestorage.app",
  messagingSenderId: "115058153234",
  appId: "1:115058153234:web:2d624d7540f8afd32a85cb",
  measurementId: "G-PCW2YG0TJF"
};

// Inicializar la aplicación de Firebase
const app = initializeApp(firebaseConfig);

// Obtener la instancia de Realtime Database
const db = getDatabase(app);

export { app, db, ref, set, get, child, push, onValue };
