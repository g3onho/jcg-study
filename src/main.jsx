import { render } from 'preact';
import { App } from './app.jsx';
import { init } from './store.js';
import './styles.css';

addEventListener('hashchange', () => document.querySelector('.side')?.classList.remove('open'));
render(<App />, document.getElementById('app'));
init();
