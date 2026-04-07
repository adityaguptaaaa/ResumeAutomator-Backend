import { initializeApp } from "firebase/app";
import { getAuth, GoogleAuthProvider } from "firebase/auth";

const firebaseConfig = {
  apiKey: "AIzaSyCJaTEh05ijTUaz9PYp_CuvnLUqX84y4yE",
  authDomain: "resume-automator-49998.firebaseapp.com",
  projectId: "resume-automator-49998",
  storageBucket: "resume-automator-49998.firebasestorage.app",
  messagingSenderId: "766471521780",
  appId: "1:766471521780:web:a18226905f06e1590de5a1",
  measurementId: "G-YRXDTQ079Z"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);

// Initialize and export Auth for our App.jsx to use
export const auth = getAuth(app);
export const provider = new GoogleAuthProvider();