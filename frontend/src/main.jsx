import React from 'react'
import ReactDOM from 'react-dom/client'
import axios from 'axios'
import App from './App.jsx'
import './index.css'

let apiUrl = import.meta.env.VITE_API_URL || '';
if (apiUrl.endsWith('/')) {
  apiUrl = apiUrl.slice(0, -1);
}
axios.defaults.baseURL = apiUrl;

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)
