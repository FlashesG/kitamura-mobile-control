// Import the functions you need from the SDKs you need
import { initializeApp } from "firebase/app";
import { getAnalytics } from "firebase/analytics";
// TODO: Add SDKs for Firebase products that you want to use
// https://firebase.google.com/docs/web/setup#available-libraries

// Your web app's Firebase configuration
// For Firebase JS SDK v7.20.0 and later, measurementId is optional
const firebaseConfig = {
  apiKey: "AIzaSyBEO_XGqzzbVtuW8i-GkUW3x6yaLppBnug",
  authDomain: "kitamura-camera-tool.firebaseapp.com",
  databaseURL: "https://kitamura-camera-tool-default-rtdb.firebaseio.com",
  projectId: "kitamura-camera-tool",
  storageBucket: "kitamura-camera-tool.firebasestorage.app",
  messagingSenderId: "77159674181",
  appId: "1:77159674181:web:19764aff48b4c39a998e2c",
  measurementId: "G-D3LDW13CEL"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const analytics = getAnalytics(app);