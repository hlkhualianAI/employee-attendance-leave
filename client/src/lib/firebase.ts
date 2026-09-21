import { getApp, getApps, initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";

const firebaseConfig = {
  apiKey: "AIzaSyD-EDJYmMXAVkK9VMeP8zgbX1w9lPxycvM",
  authDomain: "employee-attendance-leave.firebaseapp.com",
  projectId: "employee-attendance-leave",
  storageBucket: "employee-attendance-leave.firebasestorage.app",
  messagingSenderId: "443627298125",
  appId: "1:443627298125:web:7cb822b25437d0c5db6b04",
  measurementId: "G-1J7625MLTK",
};

export const firebaseApp = getApps().length ? getApp() : initializeApp(firebaseConfig);
export const firebaseAuth = getAuth(firebaseApp);
