import { initializeApp } from 'firebase/app';
import { getAuth, GoogleAuthProvider, signInWithPopup, signOut, onAuthStateChanged } from 'firebase/auth';
import type { User } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';

const firebaseConfig = {
  apiKey: 'AIzaSyBFmV3JwM-ICuc7kQALZCNcMR3736sgycE',
  authDomain: 'corgi7-d129d.firebaseapp.com',
  projectId: 'corgi7-d129d',
  storageBucket: 'corgi7-d129d.firebasestorage.app',
  messagingSenderId: '544246358745',
  appId: '1:544246358745:web:8bb7d675c5e986a61954c8',
};

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);

const provider = new GoogleAuthProvider();
export const signInWithGoogle = () => signInWithPopup(auth, provider);
export const signOutUser = () => signOut(auth);
export const onAuth = (cb: (user: User | null) => void) => onAuthStateChanged(auth, cb);
