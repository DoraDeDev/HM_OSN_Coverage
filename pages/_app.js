// pages/_app.js
import '../styles/globals.css';
// mapbox-gl.css is loaded from components/MapView.jsx (client-only) to avoid SSR/bundle issues

export default function App({ Component, pageProps }) {
  return <Component {...pageProps} />;
}
